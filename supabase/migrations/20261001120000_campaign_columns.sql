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
