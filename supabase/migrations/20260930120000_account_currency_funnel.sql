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
