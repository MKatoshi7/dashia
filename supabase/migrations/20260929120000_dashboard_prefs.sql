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
