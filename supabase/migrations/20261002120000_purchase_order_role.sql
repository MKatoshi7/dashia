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
