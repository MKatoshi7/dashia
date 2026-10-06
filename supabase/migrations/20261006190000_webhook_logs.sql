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
