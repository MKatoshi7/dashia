/**
 * Colunas de métricas da tabela de Campanhas, na ordem padrão. O "Nome" é
 * fixo na primeira posição e "Ações" na última; só estas são reordenáveis.
 * A ordem escolhida fica por área em settings.campaign_columns.
 *
 * Sem `server-only`: a tabela (cliente) e a action (servidor) usam a lista.
 */
export const CAMPAIGN_COLUMNS = {
  spend: "Gasto",
  sales: "Vendas",
  revenue: "Faturamento",
  profit: "Lucro",
  roas: "ROAS",
  checkouts: "Checkouts",
  cpa: "CPA",
  impressions: "Impressões",
  cpm: "CPM",
  ctr: "CTR",
  cpc: "CPC",
  landingViews: "Visitas no site",
  clicks: "Cliques",
} as const;

export type CampaignColumn = keyof typeof CAMPAIGN_COLUMNS;

export const DEFAULT_CAMPAIGN_COLUMNS = Object.keys(
  CAMPAIGN_COLUMNS,
) as CampaignColumn[];

export function isCampaignColumn(value: unknown): value is CampaignColumn {
  return typeof value === "string" && value in CAMPAIGN_COLUMNS;
}

/**
 * Ordem salva → ordem usável: descarta chaves desconhecidas e repetidas e
 * acrescenta no fim as colunas que não estavam na lista (ex.: uma coluna nova
 * criada depois que a ordem foi salva nunca some da tabela).
 */
export function normalizeCampaignColumns(value: unknown): CampaignColumn[] {
  const saved = Array.isArray(value)
    ? [...new Set(value.filter(isCampaignColumn))]
    : [];
  return [
    ...saved,
    ...DEFAULT_CAMPAIGN_COLUMNS.filter((key) => !saved.includes(key)),
  ];
}
