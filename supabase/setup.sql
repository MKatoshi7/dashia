-- =====================================================================
-- SETUP COMPLETO DO BANCO — cole INTEIRO no SQL Editor do Supabase.
--
-- Alternativa à Supabase CLI (`npx supabase db push`) para quem prefere
-- não instalar/logar na CLI. Gera o schema 100% reproduzível: extensões,
-- funções, tabelas, RLS, rate limit, captura, realtime e checkout.
--
-- Rode UMA VEZ SÓ, num projeto Supabase novo e vazio.
-- Gerado a partir de supabase/migrations/ (ordem preservada) por
-- scripts/build-setup-sql.mjs — NÃO edite à mão; rode o script.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 20260721120000_extensions_and_functions.sql
-- ---------------------------------------------------------------------
-- =============================================================================
-- Fase 1 · Extensões e funções utilitárias
-- =============================================================================
-- pgcrypto: usado para cifrar/decifrar segredos de integração com uma chave
-- (ENCRYPTION_KEY) que vive SOMENTE no ambiente do servidor — nunca no banco.
-- A cifra/decifra acontece via funções abaixo, chamadas apenas pelo service_role
-- (servidor), passando a chave por parâmetro (corpo da requisição, sob TLS).
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Trigger genérico para manter updated_at
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Cifra/decifra de segredos (pgcrypto, chave simétrica passada pelo servidor).
-- O ciphertext é armazenado como TEXT base64 (colunas *_token / hottok), então
-- o servidor só troca strings com o banco (sem bytea via JSON).
--   - app_encrypt(plaintext, key) -> text base64
--   - app_decrypt(ciphertext_base64, key) -> text (somente no servidor)
-- STRICT: entrada NULL retorna NULL (token não configurado permanece NULL).
-- EXECUTE liberado apenas para service_role: decifra só acontece no servidor.
-- ---------------------------------------------------------------------------
create or replace function public.app_encrypt(plaintext text, key text)
returns text
language sql
strict
volatile
as $$
  select encode(extensions.pgp_sym_encrypt(plaintext, key), 'base64');
$$;

create or replace function public.app_decrypt(ciphertext text, key text)
returns text
language sql
strict
volatile
as $$
  select extensions.pgp_sym_decrypt(decode(ciphertext, 'base64'), key);
$$;

revoke all on function public.app_encrypt(text, text) from public;
revoke all on function public.app_decrypt(text, text) from public;
grant execute on function public.app_encrypt(text, text) to service_role;
grant execute on function public.app_decrypt(text, text) to service_role;

-- ---------------------------------------------------------------------
-- 20260721120100_tables.sql
-- ---------------------------------------------------------------------
-- =============================================================================
-- Fase 1 · Tabelas do domínio
-- =============================================================================
-- IDENTIDADE: `user_id` é o ID ANÔNIMO do visitante (nanoid), gerado pelo sistema.
-- NÃO tem relação com auth.users e NÃO possui FK para auth.users.
-- MULTI-ÁREA: quase todas as tabelas têm area_id (indexado). Branding é global.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Áreas (workspaces)
-- ---------------------------------------------------------------------------
create table public.areas (
  id           uuid primary key default gen_random_uuid(),
  nome         text not null,
  revenue_goal numeric(14,2) not null default 0,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Branding (GLOBAL da instância — linha única forçada por id boolean = true)
-- Defaults NEUTROS (white label). Sempre existe exatamente uma linha.
-- ---------------------------------------------------------------------------
create table public.branding (
  id                     boolean primary key default true,
  product_name           text not null default 'Dashboard',
  logo_light_url         text,
  logo_dark_url          text,
  favicon_url            text,
  primary_color_override text,          -- HSL sem função, ex: "142 76% 58%"
  updated_at             timestamptz not null default now(),
  constraint branding_singleton check (id = true)
);
insert into public.branding (id) values (true) on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Settings (uma linha por área). Segredos cifrados em bytea (pgcrypto).
-- ---------------------------------------------------------------------------
create table public.settings (
  area_id              uuid primary key references public.areas(id) on delete cascade,
  currency             text not null default 'BRL',
  tax_rate             numeric(5,2) not null default 0,      -- alíquota de imposto (%)
  revenue_goal         numeric(14,2) not null default 0,     -- meta operacional da área
  allowed_origins      text[] not null default '{}',         -- CORS das landing pages
  hotmart_hottok       text,                                 -- cifrado (base64 pgcrypto)
  kiwify_webhook_token text,                                 -- cifrado (base64 pgcrypto)
  updated_at           timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Contas de anúncio da Meta (N por área). ads_token cifrado (System User).
-- ---------------------------------------------------------------------------
create table public.meta_ad_accounts (
  id            uuid primary key default gen_random_uuid(),
  area_id       uuid not null references public.areas(id) on delete cascade,
  label         text not null,
  ad_account_id text not null,        -- "act_<numeric>" ou numérico
  ads_token     text,                 -- cifrado (base64 pgcrypto); ads_read + ads_management
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index meta_ad_accounts_area_id_idx on public.meta_ad_accounts (area_id);

-- ---------------------------------------------------------------------------
-- Visitors (visitante anônimo rastreado). user_id único por área.
-- LGPD: só email/telefone/nome em claro, apenas para o match de compra.
-- ---------------------------------------------------------------------------
create table public.visitors (
  id           uuid primary key default gen_random_uuid(),
  area_id      uuid not null references public.areas(id) on delete cascade,
  user_id      text not null,
  email        text,
  telefone     text,
  nome         text,
  utm_source   text,
  utm_medium   text,
  utm_campaign text,
  utm_term     text,
  utm_content  text,
  referrer     text,
  ip           text,
  user_agent   text,
  geo_country  text,
  geo_region   text,
  geo_city     text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (area_id, user_id)
);
create index visitors_area_id_idx    on public.visitors (area_id);
create index visitors_user_id_idx    on public.visitors (user_id);
create index visitors_created_at_idx on public.visitors (created_at);
create index visitors_email_idx      on public.visitors (email);
create index visitors_telefone_idx   on public.visitors (telefone);

-- ---------------------------------------------------------------------------
-- Events log (page_view, initiate_checkout, ...). Só grava (nada sai pra fora).
-- Para checkouts, o ad_id trafega em utm_content.
-- ---------------------------------------------------------------------------
create table public.events_log (
  id           uuid primary key default gen_random_uuid(),
  area_id      uuid not null references public.areas(id) on delete cascade,
  user_id      text not null,
  event_name   text not null,
  utm_source   text,
  utm_medium   text,
  utm_campaign text,
  utm_term     text,
  utm_content  text,
  ip           text,
  geo_country  text,
  geo_region   text,
  geo_city     text,
  created_at   timestamptz not null default now()
);
create index events_log_area_id_idx    on public.events_log (area_id);
create index events_log_user_id_idx    on public.events_log (user_id);
create index events_log_event_name_idx on public.events_log (event_name);
create index events_log_created_at_idx on public.events_log (created_at);

-- ---------------------------------------------------------------------------
-- Purchases (compras via webhook). UPSERT idempotente por transaction_id.
-- ad_id em coluna própria (indexada), validado como numérico na aplicação.
-- status: unificado interno. plataforma: hotmart | kiwify.
-- ---------------------------------------------------------------------------
create table public.purchases (
  id             uuid primary key default gen_random_uuid(),
  area_id        uuid not null references public.areas(id) on delete cascade,
  transaction_id text not null unique,
  user_id        text,
  email          text,
  telefone       text,
  produto        text,
  valor          numeric(14,2),
  moeda          text,
  status         text not null check (status in ('approved','pending','refunded','chargeback','canceled')),
  plataforma     text not null check (plataforma in ('hotmart','kiwify')),
  utm_source     text,
  utm_medium     text,
  utm_campaign   text,
  utm_term       text,
  utm_content    text,
  ad_id          text,
  geo_country    text,
  geo_region     text,
  geo_city       text,
  match          text,                 -- como casou (user_id / email / telefone / none)
  raw_webhook    jsonb,                -- payload bruto para auditoria
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index purchases_area_id_idx    on public.purchases (area_id);
create index purchases_ad_id_idx      on public.purchases (ad_id);
create index purchases_status_idx     on public.purchases (status);
create index purchases_plataforma_idx on public.purchases (plataforma);
create index purchases_user_id_idx    on public.purchases (user_id);
create index purchases_created_at_idx on public.purchases (created_at);
create index purchases_email_idx      on public.purchases (email);
create index purchases_telefone_idx   on public.purchases (telefone);

-- ---------------------------------------------------------------------------
-- Automation rules (página Regras) + histórico de execuções
-- ---------------------------------------------------------------------------
create table public.automation_rules (
  id         uuid primary key default gen_random_uuid(),
  area_id    uuid not null references public.areas(id) on delete cascade,
  nome       text not null,
  nivel      text not null check (nivel in ('campanha','conjunto','anuncio')),
  metric     text not null,
  operator   text not null check (operator in ('>','<')),
  value      numeric not null,
  period     text not null,                         -- ex: 'today','7d','30d'
  action     text not null check (action in ('pausar','notificar')),
  ativa      boolean not null default true,
  last_run   timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index automation_rules_area_id_idx on public.automation_rules (area_id);

create table public.rule_executions (
  id           uuid primary key default gen_random_uuid(),
  area_id      uuid not null references public.areas(id) on delete cascade,
  rule_id      uuid not null references public.automation_rules(id) on delete cascade,
  ran_at       timestamptz not null default now(),
  matched      boolean not null,
  action_taken text,
  target_level text,
  target_id    text,
  details      jsonb
);
create index rule_executions_area_id_idx on public.rule_executions (area_id);
create index rule_executions_rule_id_idx on public.rule_executions (rule_id);
create index rule_executions_ran_at_idx  on public.rule_executions (ran_at);

-- ---------------------------------------------------------------------------
-- Audit log (escritas na Meta, execuções de regras, mudanças de config)
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  area_id     uuid references public.areas(id) on delete set null,
  actor_email text,                    -- usuário do painel (null para cron/sistema)
  action      text not null,
  target_type text,
  target_id   text,
  details     jsonb,
  created_at  timestamptz not null default now()
);
create index audit_log_area_id_idx    on public.audit_log (area_id);
create index audit_log_created_at_idx on public.audit_log (created_at);
create index audit_log_action_idx     on public.audit_log (action);

-- ---------------------------------------------------------------------------
-- Triggers de updated_at
-- ---------------------------------------------------------------------------
create trigger branding_set_updated_at
  before update on public.branding
  for each row execute function public.set_updated_at();
create trigger settings_set_updated_at
  before update on public.settings
  for each row execute function public.set_updated_at();
create trigger meta_ad_accounts_set_updated_at
  before update on public.meta_ad_accounts
  for each row execute function public.set_updated_at();
create trigger visitors_set_updated_at
  before update on public.visitors
  for each row execute function public.set_updated_at();
create trigger purchases_set_updated_at
  before update on public.purchases
  for each row execute function public.set_updated_at();
create trigger automation_rules_set_updated_at
  before update on public.automation_rules
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 20260721120200_rate_limit.sql
-- ---------------------------------------------------------------------
-- =============================================================================
-- Fase 1 · Rate limiting em Postgres (compatível com serverless / Vercel)
-- =============================================================================
-- Contador de janela fixa, atômico via UPSERT. Sem estado em memória.
-- Chamado pelos endpoints públicos (captura/webhooks) no servidor (service_role).
-- =============================================================================

create table public.rate_limit_counters (
  bucket_key   text not null,
  window_start timestamptz not null,
  count        integer not null default 0,
  primary key (bucket_key, window_start)
);
create index rate_limit_counters_window_idx on public.rate_limit_counters (window_start);

-- Retorna TRUE se a requisição está DENTRO do limite; FALSE se excedeu.
-- p_key: identificador do bucket (ex: "identify:<area>:<ip>")
-- p_max: máximo de hits por janela
-- p_window_seconds: tamanho da janela em segundos
create or replace function public.rate_limit_hit(
  p_key text,
  p_max integer,
  p_window_seconds integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window_start timestamptz;
  v_count integer;
begin
  v_window_start := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into public.rate_limit_counters (bucket_key, window_start, count)
  values (p_key, v_window_start, 1)
  on conflict (bucket_key, window_start)
    do update set count = public.rate_limit_counters.count + 1
  returning count into v_count;

  return v_count <= p_max;
end;
$$;

-- Limpeza de janelas antigas (chamar por Vercel Cron periodicamente).
create or replace function public.rate_limit_cleanup(p_older_than_seconds integer default 3600)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.rate_limit_counters
  where window_start < now() - make_interval(secs => p_older_than_seconds);
$$;

revoke all on function public.rate_limit_hit(text, integer, integer) from public;
revoke all on function public.rate_limit_cleanup(integer) from public;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;
grant execute on function public.rate_limit_cleanup(integer) to service_role;

-- ---------------------------------------------------------------------
-- 20260721120300_rls.sql
-- ---------------------------------------------------------------------
-- =============================================================================
-- Fase 1 · Row Level Security (single-tenant)
-- =============================================================================
-- Regra do painel: LEITURA só por usuário autenticado; ESCRITA só no servidor
-- (service_role, que faz BYPASS de RLS no Supabase). Cadastro público OFF.
-- `user_id` (visitante anônimo) NÃO entra em nenhuma política.
-- rate_limit_counters: RLS ligada e SEM policy => inacessível a anon/authenticated;
-- apenas o service_role (servidor) opera nela.
-- =============================================================================

-- Habilita RLS em TODAS as tabelas
alter table public.areas               enable row level security;
alter table public.branding            enable row level security;
alter table public.settings            enable row level security;
alter table public.meta_ad_accounts    enable row level security;
alter table public.visitors            enable row level security;
alter table public.events_log          enable row level security;
alter table public.purchases           enable row level security;
alter table public.automation_rules    enable row level security;
alter table public.rule_executions     enable row level security;
alter table public.audit_log           enable row level security;
alter table public.rate_limit_counters enable row level security;

-- Políticas de LEITURA para usuário autenticado (painel)
create policy "authenticated read" on public.areas
  for select to authenticated using (true);
create policy "authenticated read" on public.branding
  for select to authenticated using (true);
create policy "authenticated read" on public.settings
  for select to authenticated using (true);
create policy "authenticated read" on public.meta_ad_accounts
  for select to authenticated using (true);
create policy "authenticated read" on public.visitors
  for select to authenticated using (true);
create policy "authenticated read" on public.events_log
  for select to authenticated using (true);
create policy "authenticated read" on public.purchases
  for select to authenticated using (true);
create policy "authenticated read" on public.automation_rules
  for select to authenticated using (true);
create policy "authenticated read" on public.rule_executions
  for select to authenticated using (true);
create policy "authenticated read" on public.audit_log
  for select to authenticated using (true);
-- rate_limit_counters: sem policy de propósito (apenas service_role).

-- ---------------------------------------------------------------------------
-- Grants explícitos (reprodutíveis em qualquer projeto Supabase novo).
-- authenticated: apenas SELECT (a escrita é bloqueada por falta de policy).
-- service_role: acesso total (e bypass de RLS).
-- ATENÇÃO: os DEFAULT PRIVILEGES do Supabase concedem privilégios de TABELA a
-- anon/authenticated automaticamente. Quem efetivamente bloqueia a escrita é a
-- RLS, não a ausência de grant. Ver 20260725120000_function_grants_lockdown.sql.
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;

grant select on
  public.areas, public.branding, public.settings, public.meta_ad_accounts,
  public.visitors, public.events_log, public.purchases,
  public.automation_rules, public.rule_executions, public.audit_log
to authenticated;

grant all on all tables in schema public to service_role;

-- ---------------------------------------------------------------------
-- 20260722120000_capture.sql
-- ---------------------------------------------------------------------
-- =============================================================================
-- Fase 3 · Captura (snippet + /api/identify + /api/event)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Token público da área.
-- Vai no snippet das landing pages, então é VISÍVEL no fonte da página — NÃO é
-- um segredo. Serve apenas para dizer "de qual área é este hit". A proteção de
-- verdade é o CORS (allowed_origins da área) + rate limit.
-- ---------------------------------------------------------------------------
alter table public.areas
  add column public_token text not null unique
    default encode(extensions.gen_random_bytes(12), 'hex');

create index areas_public_token_idx on public.areas (public_token);

-- ---------------------------------------------------------------------------
-- UPSERT do visitante.
-- Semântica de UTM: LAST TOUCH — um valor novo sobrescreve o antigo, mas um
-- valor NULO (ex.: pageview interno sem UTM) NUNCA apaga o que já existe.
-- ---------------------------------------------------------------------------
create or replace function public.identify_visitor(
  p_area_id      uuid,
  p_user_id      text,
  p_email        text default null,
  p_telefone     text default null,
  p_nome         text default null,
  p_utm_source   text default null,
  p_utm_medium   text default null,
  p_utm_campaign text default null,
  p_utm_term     text default null,
  p_utm_content  text default null,
  p_referrer     text default null,
  p_ip           text default null,
  p_user_agent   text default null,
  p_geo_country  text default null,
  p_geo_region   text default null,
  p_geo_city     text default null
) returns void
language sql
security definer
set search_path = public
as $$
  insert into public.visitors (
    area_id, user_id, email, telefone, nome,
    utm_source, utm_medium, utm_campaign, utm_term, utm_content,
    referrer, ip, user_agent, geo_country, geo_region, geo_city
  )
  values (
    p_area_id, p_user_id, p_email, p_telefone, p_nome,
    p_utm_source, p_utm_medium, p_utm_campaign, p_utm_term, p_utm_content,
    p_referrer, p_ip, p_user_agent, p_geo_country, p_geo_region, p_geo_city
  )
  on conflict (area_id, user_id) do update set
    email        = coalesce(excluded.email,        public.visitors.email),
    telefone     = coalesce(excluded.telefone,     public.visitors.telefone),
    nome         = coalesce(excluded.nome,         public.visitors.nome),
    utm_source   = coalesce(excluded.utm_source,   public.visitors.utm_source),
    utm_medium   = coalesce(excluded.utm_medium,   public.visitors.utm_medium),
    utm_campaign = coalesce(excluded.utm_campaign, public.visitors.utm_campaign),
    utm_term     = coalesce(excluded.utm_term,     public.visitors.utm_term),
    utm_content  = coalesce(excluded.utm_content,  public.visitors.utm_content),
    referrer     = coalesce(excluded.referrer,     public.visitors.referrer),
    ip           = coalesce(excluded.ip,           public.visitors.ip),
    user_agent   = coalesce(excluded.user_agent,   public.visitors.user_agent),
    geo_country  = coalesce(excluded.geo_country,  public.visitors.geo_country),
    geo_region   = coalesce(excluded.geo_region,   public.visitors.geo_region),
    geo_city     = coalesce(excluded.geo_city,     public.visitors.geo_city);
$$;

-- ---------------------------------------------------------------------------
-- Registro de evento, ENRIQUECIDO com os dados do visitante quando o payload
-- não trouxer (ex.: pageview interno sem UTM herda a UTM de origem).
-- Este sistema apenas GRAVA — nada é disparado para plataformas externas.
-- ---------------------------------------------------------------------------
create or replace function public.log_event(
  p_area_id      uuid,
  p_user_id      text,
  p_event_name   text,
  p_utm_source   text default null,
  p_utm_medium   text default null,
  p_utm_campaign text default null,
  p_utm_term     text default null,
  p_utm_content  text default null,
  p_ip           text default null,
  p_geo_country  text default null,
  p_geo_region   text default null,
  p_geo_city     text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.visitors%rowtype;
begin
  select * into v
  from public.visitors
  where area_id = p_area_id and user_id = p_user_id;

  insert into public.events_log (
    area_id, user_id, event_name,
    utm_source, utm_medium, utm_campaign, utm_term, utm_content,
    ip, geo_country, geo_region, geo_city
  )
  values (
    p_area_id, p_user_id, p_event_name,
    coalesce(p_utm_source,   v.utm_source),
    coalesce(p_utm_medium,   v.utm_medium),
    coalesce(p_utm_campaign, v.utm_campaign),
    coalesce(p_utm_term,     v.utm_term),
    coalesce(p_utm_content,  v.utm_content),
    p_ip,
    coalesce(p_geo_country, v.geo_country),
    coalesce(p_geo_region,  v.geo_region),
    coalesce(p_geo_city,    v.geo_city)
  );
end;
$$;

-- Execução apenas pelo servidor (service_role).
revoke all on function public.identify_visitor(
  uuid, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text
) from public;
revoke all on function public.log_event(
  uuid, text, text, text, text, text, text, text, text, text, text, text
) from public;

grant execute on function public.identify_visitor(
  uuid, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text
) to service_role;
grant execute on function public.log_event(
  uuid, text, text, text, text, text, text, text, text, text, text, text
) to service_role;

-- ---------------------------------------------------------------------
-- 20260722130000_realtime.sql
-- ---------------------------------------------------------------------
-- =============================================================================
-- Fase 5 · Realtime do feed "Vendas em Tempo Real"
-- =============================================================================
-- Publica `purchases` no Realtime do Supabase para o feed do Dashboard.
-- A RLS continua valendo: só usuário AUTENTICADO recebe os eventos.
-- O painel tem fallback por polling caso o Realtime não esteja disponível.
-- =============================================================================

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'purchases'
  ) then
    alter publication supabase_realtime add table public.purchases;
  end if;
end
$$;

-- ---------------------------------------------------------------------
-- 20260722140000_checkout_platforms.sql
-- ---------------------------------------------------------------------
-- =============================================================================
-- Múltiplas plataformas de checkout
-- =============================================================================
-- Antes: `settings` tinha uma coluna de segredo por plataforma
-- (hotmart_hottok, kiwify_webhook_token). Isso não escala para 11 plataformas
-- — cada nova exigiria um ALTER TABLE.
--
-- Agora: uma linha por (área, plataforma) em `checkout_integrations`, com o
-- segredo cifrado do mesmo jeito (app_encrypt/app_decrypt, base64 TEXT).
-- Adicionar plataforma passa a ser só uma entrada no registro em
-- src/lib/checkout/platforms.ts — sem migration nova.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Integrações de checkout (N por área)
-- ---------------------------------------------------------------------------
create table if not exists public.checkout_integrations (
  area_id    uuid not null references public.areas(id) on delete cascade,
  plataforma text not null,
  secret     text,                                  -- cifrado (base64 pgcrypto)
  enabled    boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (area_id, plataforma)
);

create index if not exists checkout_integrations_area_idx
  on public.checkout_integrations (area_id);

drop trigger if exists set_checkout_integrations_updated_at
  on public.checkout_integrations;
create trigger set_checkout_integrations_updated_at
  before update on public.checkout_integrations
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2) Migra os segredos que já existiam em `settings`
--    (idempotente: só insere o que estiver preenchido)
-- ---------------------------------------------------------------------------
insert into public.checkout_integrations (area_id, plataforma, secret)
select area_id, 'hotmart', hotmart_hottok
from public.settings
where hotmart_hottok is not null
on conflict (area_id, plataforma) do nothing;

insert into public.checkout_integrations (area_id, plataforma, secret)
select area_id, 'kiwify', kiwify_webhook_token
from public.settings
where kiwify_webhook_token is not null
on conflict (area_id, plataforma) do nothing;

alter table public.settings drop column if exists hotmart_hottok;
alter table public.settings drop column if exists kiwify_webhook_token;

-- ---------------------------------------------------------------------------
-- 3) `purchases.plataforma` passa a aceitar todas as plataformas suportadas.
--    A lista espelha PLATFORM_IDS em src/lib/checkout/platforms.ts — os dois
--    precisam andar juntos.
-- ---------------------------------------------------------------------------
alter table public.purchases
  drop constraint if exists purchases_plataforma_check;

alter table public.purchases
  add constraint purchases_plataforma_check check (
    plataforma in (
      'hotmart', 'kiwify', 'kirvano', 'perfectpay', 'ticto', 'cakto', 'greenn'
    )
  );

-- ---------------------------------------------------------------------------
-- 4) RLS — mesma regra do resto: leitura só para autenticado, escrita só
--    pelo servidor (service_role, que faz bypass).
-- ---------------------------------------------------------------------------
alter table public.checkout_integrations enable row level security;

drop policy if exists "authenticated read" on public.checkout_integrations;
create policy "authenticated read" on public.checkout_integrations
  for select to authenticated using (true);

grant select on public.checkout_integrations to authenticated;
grant all on public.checkout_integrations to service_role;

-- ---------------------------------------------------------------------
-- 20260725120000_function_grants_lockdown.sql
-- ---------------------------------------------------------------------
-- =============================================================================
-- Fecha o EXECUTE das funções para anon/authenticated.
--
-- CAUSA DO FURO: projetos Supabase trazem DEFAULT PRIVILEGES que concedem
-- EXECUTE em funções novas do schema `public` aos papéis `anon` e
-- `authenticated` EXPLICITAMENTE, por nome. As migrations anteriores fizeram
-- apenas `revoke all on function ... from public`, que remove o grant do
-- pseudo-papel PUBLIC — os grants explícitos a anon/authenticated sobrevivem.
--
-- VERIFICADO contra um projeto real (2026-07-25): com a chave anon era possível
-- executar app_encrypt, app_decrypt, rate_limit_hit, identify_visitor e
-- log_event. app_decrypt ainda exige a ENCRYPTION_KEY como argumento (que vive
-- só no env), mas identify_visitor/log_event são `security definer` e escrevem
-- furando a RLS — pulando CORS, zod e rate limit dos endpoints públicos.
--
-- Nenhuma dessas funções é chamada com a chave anon pelo app: todas passam por
-- createAdminClient() (service_role). Fechar o acesso não quebra nada.
-- =============================================================================

-- 1. Impede que funções FUTURAS do schema public nasçam abertas.
alter default privileges in schema public
  revoke execute on functions from anon, authenticated;

-- 2. Fecha as funções que já existem.
revoke all on function public.app_encrypt(text, text)
  from anon, authenticated;
revoke all on function public.app_decrypt(text, text)
  from anon, authenticated;

revoke all on function public.rate_limit_hit(text, integer, integer)
  from anon, authenticated;
revoke all on function public.rate_limit_cleanup(integer)
  from anon, authenticated;

revoke all on function public.identify_visitor(
  uuid, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text
) from anon, authenticated;
revoke all on function public.log_event(
  uuid, text, text, text, text, text, text, text, text, text, text, text
) from anon, authenticated;

revoke all on function public.set_updated_at()
  from anon, authenticated;

-- 3. Reafirma quem PODE executar (idempotente).
grant execute on function public.app_encrypt(text, text) to service_role;
grant execute on function public.app_decrypt(text, text) to service_role;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;
grant execute on function public.rate_limit_cleanup(integer) to service_role;
grant execute on function public.identify_visitor(
  uuid, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text
) to service_role;
grant execute on function public.log_event(
  uuid, text, text, text, text, text, text, text, text, text, text, text
) to service_role;

-- ---------------------------------------------------------------------
-- 20260929120000_dashboard_prefs.sql
-- ---------------------------------------------------------------------
-- =============================================================================
-- Preferências do Dashboard (por área)
-- =============================================================================
-- dashboard_version: qual layout o /dashboard mostra — 'legacy' (o original)
--   ou 'v2' (grade de KPIs, funil da Meta, vendas por hora/dia/posicionamento).
-- meta_tax_rate: imposto que a Meta cobra sobre o gasto com anúncios no Brasil
--   (PIS/COFINS + ISS = 12,15%, calculado "por dentro": o valor cobrado é
--   gasto × taxa / (1 − taxa)). 0 desliga o cálculo.
--
-- Idempotente: pode rodar de novo sem erro.
-- =============================================================================

alter table public.settings
  add column if not exists dashboard_version text not null default 'legacy',
  add column if not exists meta_tax_rate numeric(5,2) not null default 12.15;

alter table public.settings
  drop constraint if exists settings_dashboard_version_check;
alter table public.settings
  add constraint settings_dashboard_version_check
    check (dashboard_version in ('legacy', 'v2'));

alter table public.settings
  drop constraint if exists settings_meta_tax_rate_check;
alter table public.settings
  add constraint settings_meta_tax_rate_check
    check (meta_tax_rate >= 0 and meta_tax_rate < 100);

-- ---------------------------------------------------------------------
-- 20260930120000_account_currency_funnel.sql
-- ---------------------------------------------------------------------
-- =============================================================================
-- Moeda por conta de anúncio + funil editável do Dashboard V2
-- =============================================================================
-- meta_ad_accounts.currency: moeda da conta na Meta (ISO, ex.: USD). NULL =
--   mesma moeda da área (sem conversão). Preenchida automaticamente ao conectar.
-- meta_ad_accounts.fx_rate: cotação FIXA para converter para a moeda da área
--   (ex.: 5.80 = 1 USD → R$ 5,80). NULL = cotação do dia, automática.
-- settings.dashboard_funnel: métricas das etapas do funil do Dashboard V2,
--   na ordem. Chaves válidas vivem em src/lib/meta/dashboard.ts.
--
-- Idempotente: pode rodar de novo sem erro.
-- =============================================================================

alter table public.meta_ad_accounts
  add column if not exists currency text,
  add column if not exists fx_rate numeric(14,6);

alter table public.meta_ad_accounts
  drop constraint if exists meta_ad_accounts_currency_check;
alter table public.meta_ad_accounts
  add constraint meta_ad_accounts_currency_check
    check (currency is null or currency ~ '^[A-Z]{3}$');

alter table public.meta_ad_accounts
  drop constraint if exists meta_ad_accounts_fx_rate_check;
alter table public.meta_ad_accounts
  add constraint meta_ad_accounts_fx_rate_check
    check (fx_rate is null or fx_rate > 0);

alter table public.settings
  add column if not exists dashboard_funnel text[] not null
    default '{link_clicks,landing_views,checkouts,payment_info,purchases}';

-- ---------------------------------------------------------------------
-- 20261001120000_campaign_columns.sql
-- ---------------------------------------------------------------------
-- =============================================================================
-- Ordem das colunas da tabela de Campanhas (por área)
-- =============================================================================
-- settings.campaign_columns: chaves das métricas na ordem escolhida. NULL =
--   ordem padrão. Chaves válidas vivem em src/lib/campaign-columns.ts; colunas
--   ausentes da lista são acrescentadas no fim pela aplicação.
--
-- Idempotente: pode rodar de novo sem erro.
-- =============================================================================

alter table public.settings
  add column if not exists campaign_columns text[];

-- ---------------------------------------------------------------------
-- 20261002120000_purchase_order_role.sql
-- ---------------------------------------------------------------------
-- =============================================================================
-- Order bump / upsell: um pedido = uma venda
-- =============================================================================
-- Algumas plataformas (ex.: Cakto) mandam cada order bump como um pedido
-- separado, marcado com o papel do item e o pedido principal:
--   purchases.order_role   → main / orderbump / upsell / downsell (NULL quando
--                            a plataforma não informa — conta como venda, como
--                            sempre foi);
--   purchases.parent_order → id do pedido principal ao qual o item pertence.
-- O VALOR de todos os itens soma no faturamento; só o principal conta como
-- venda (regra em src/lib/sales.ts).
--
-- Idempotente: pode rodar de novo sem erro.
-- =============================================================================

alter table public.purchases
  add column if not exists order_role text,
  add column if not exists parent_order text;

create index if not exists purchases_parent_order_idx
  on public.purchases (parent_order)
  where parent_order is not null;

-- ---------------------------------------------------------------------
-- 20261006190000_webhook_logs.sql
-- ---------------------------------------------------------------------
-- =============================================================================
-- Logs de Webhook (Observabilidade de eventos recebidos)
-- =============================================================================
create table if not exists public.webhook_logs (
  id             uuid primary key default gen_random_uuid(),
  area_id        uuid not null references public.areas(id) on delete cascade,
  plataforma     text not null,
  event          text,
  status         text not null check (status in ('processed', 'ignored', 'test', 'error')),
  transaction_id text,
  ad_id          text,
  produto        text,
  valor          numeric(14,2),
  email          text,
  telefone       text,
  utm_source     text,
  utm_medium     text,
  utm_campaign   text,
  utm_term       text,
  utm_content    text,
  payload        jsonb not null default '{}'::jsonb,
  error_message  text,
  created_at     timestamptz not null default now()
);

create index if not exists webhook_logs_area_id_idx on public.webhook_logs (area_id);
create index if not exists webhook_logs_plataforma_idx on public.webhook_logs (plataforma);
create index if not exists webhook_logs_event_idx on public.webhook_logs (event);
create index if not exists webhook_logs_status_idx on public.webhook_logs (status);
create index if not exists webhook_logs_created_at_idx on public.webhook_logs (created_at desc);
create index if not exists webhook_logs_transaction_id_idx on public.webhook_logs (transaction_id);

alter table public.webhook_logs enable row level security;

drop policy if exists "webhook_logs_select_authenticated" on public.webhook_logs;
create policy "webhook_logs_select_authenticated"
  on public.webhook_logs
  for select
  to authenticated
  using (true);

grant select on public.webhook_logs to authenticated;
grant all on public.webhook_logs to service_role;

-- ---------------------------------------------------------------------
-- Histórico de migrations: faz um futuro `supabase db push` saber que
-- estas já foram aplicadas, evitando reaplicar tudo por cima.
-- ---------------------------------------------------------------------
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (
  version text primary key,
  statements text[],
  name text
);
insert into supabase_migrations.schema_migrations (version, name) values
  ('20260721120000', 'extensions_and_functions'),
  ('20260721120100', 'tables'),
  ('20260721120200', 'rate_limit'),
  ('20260721120300', 'rls'),
  ('20260722120000', 'capture'),
  ('20260722130000', 'realtime'),
  ('20260722140000', 'checkout_platforms'),
  ('20260725120000', 'function_grants_lockdown'),
  ('20260929120000', 'dashboard_prefs'),
  ('20260930120000', 'account_currency_funnel'),
  ('20261001120000', 'campaign_columns'),
  ('20261002120000', 'purchase_order_role'),
  ('20261006190000', 'webhook_logs')
on conflict (version) do nothing;

commit;
