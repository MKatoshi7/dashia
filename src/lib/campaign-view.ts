/**
 * Filtros da tela Campanhas lembrados entre abas (status, atribuição, nível,
 * conta — a busca por nome fica de fora). Guardados num cookie que o proxy
 * grava e reaplica, e que a própria página também lê: assim o filtro vale
 * mesmo quando o Next reaproveita um prefetch antigo do link do menu.
 */
export const CAMPAIGN_VIEW_COOKIE = "campaign_view";
export const CAMPAIGN_VIEW_PARAMS = ["status", "attr", "level", "account"] as const;

export type CampaignView = Partial<
  Record<(typeof CAMPAIGN_VIEW_PARAMS)[number], string>
>;

/** Status padrão da tela: só o que está veiculando. */
export const DEFAULT_CAMPAIGN_STATUS = "active";

/** Lê o valor do cookie (pode vir codificado uma ou duas vezes). */
export function parseCampaignView(raw: string | undefined): CampaignView {
  if (!raw) return {};
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return {};
  }
  const params = new URLSearchParams(decoded);
  const view: CampaignView = {};
  for (const key of CAMPAIGN_VIEW_PARAMS) {
    const value = params.get(key);
    if (value) view[key] = value;
  }
  return view;
}

export function serializeCampaignView(view: CampaignView): string {
  const params = new URLSearchParams();
  for (const key of CAMPAIGN_VIEW_PARAMS) {
    const value = view[key];
    if (value) params.set(key, value);
  }
  return encodeURIComponent(params.toString());
}
