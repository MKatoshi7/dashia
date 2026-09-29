/**
 * Métricas que podem ocupar uma etapa do funil do Dashboard V2. Sem
 * `server-only`: o editor do funil (cliente) usa os rótulos.
 *
 * `actions` lista os nomes do MESMO evento na Meta em ordem de preferência —
 * só o primeiro com valor conta (somar todos contaria em dobro).
 */
export const FUNNEL_METRICS = {
  impressions: { label: "Impressões", actions: null },
  clicks: { label: "Cliques (todos)", actions: null },
  link_clicks: { label: "Cliques", actions: null },
  landing_views: {
    label: "Vis. Página",
    actions: ["landing_page_view", "omni_landing_page_view"],
  },
  view_content: {
    label: "Vis. Conteúdo",
    actions: [
      "view_content",
      "omni_view_content",
      "offsite_conversion.fb_pixel_view_content",
    ],
  },
  leads: {
    label: "Leads",
    actions: ["lead", "offsite_conversion.fb_pixel_lead", "onsite_web_lead"],
  },
  registrations: {
    label: "Cadastros",
    actions: [
      "complete_registration",
      "omni_complete_registration",
      "offsite_conversion.fb_pixel_complete_registration",
    ],
  },
  add_to_cart: {
    label: "Carrinho",
    actions: [
      "add_to_cart",
      "omni_add_to_cart",
      "offsite_conversion.fb_pixel_add_to_cart",
    ],
  },
  checkouts: {
    label: "ICs",
    actions: [
      "initiate_checkout",
      "omni_initiated_checkout",
      "offsite_conversion.fb_pixel_initiate_checkout",
    ],
  },
  payment_info: {
    label: "Vendas Inic.",
    actions: [
      "add_payment_info",
      "omni_add_payment_info",
      "offsite_conversion.fb_pixel_add_payment_info",
    ],
  },
  purchases: { label: "Vendas Apr.", actions: ["purchase"] },
} as const satisfies Record<
  string,
  { label: string; actions: readonly string[] | null }
>;

export type FunnelMetric = keyof typeof FUNNEL_METRICS;

export const FUNNEL_METRIC_KEYS = Object.keys(FUNNEL_METRICS) as FunnelMetric[];

export const DEFAULT_FUNNEL: FunnelMetric[] = [
  "link_clicks",
  "landing_views",
  "checkouts",
  "payment_info",
  "purchases",
];

export const FUNNEL_MIN_STEPS = 2;
export const FUNNEL_MAX_STEPS = 7;

export function isFunnelMetric(value: unknown): value is FunnelMetric {
  return typeof value === "string" && value in FUNNEL_METRICS;
}

/** Sanitiza o que veio do banco: só chaves válidas, sem repetição, no limite. */
export function normalizeFunnel(value: unknown): FunnelMetric[] {
  if (!Array.isArray(value)) return DEFAULT_FUNNEL;
  const steps = [...new Set(value.filter(isFunnelMetric))].slice(
    0,
    FUNNEL_MAX_STEPS,
  );
  return steps.length >= FUNNEL_MIN_STEPS ? steps : DEFAULT_FUNNEL;
}
