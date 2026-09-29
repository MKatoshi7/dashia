/**
 * O que conta como UMA VENDA.
 *
 * Um pedido com order bump chega da plataforma como vários itens (ex.: Cakto
 * manda o principal com offer_type "main" e cada bump com "orderbump" +
 * parent_order). Regra do painel:
 *   - o VALOR de todos os itens aprovados soma no faturamento (é o dinheiro
 *     que entrou de verdade — o pixel da Meta só vê o front);
 *   - só o item PRINCIPAL conta como venda (1 pedido = 1 venda), então o CPA e
 *     a contagem não inflam com os bumps.
 *
 * Plataformas que não informam o papel do item (order_role nulo) seguem
 * contando cada compra como venda, como sempre foi.
 */
export const SECONDARY_ROLES = ["orderbump", "order_bump", "bump", "upsell", "downsell"];

export function isPrimarySale(row: {
  order_role?: string | null;
  parent_order?: string | null;
}): boolean {
  const role = row.order_role?.trim().toLowerCase();
  if (role && SECONDARY_ROLES.includes(role)) return false;
  // Sem papel declarado, mas pendurado num pedido pai: também é complemento.
  if (!role && row.parent_order?.trim()) return false;
  return true;
}
