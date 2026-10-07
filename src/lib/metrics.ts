import "server-only";

import { cache } from "react";

import { isPrimarySale } from "@/lib/sales";
import { createClient } from "@/lib/supabase/server";

/**
 * Métricas a partir dos DADOS PRÓPRIOS (purchases capturadas por webhook).
 * É a base da atribuição "Last Click". O gasto de mídia vem da Meta.
 */

export type DailyPoint = { date: string; revenue: number; spend: number };

export type RegionRow = {
  country: string | null;
  region: string | null;
  sales: number;
  revenue: number;
};

export type RecentSale = {
  id: string;
  produto: string | null;
  valor: number | null;
  created_at: string;
};

export type PurchaseMetrics = {
  revenue: number;
  sales: number;
  refundedCount: number;
  refundedValue: number;
  chargebackCount: number;
  chargebackValue: number;
  pendingCount: number;
  /** Faturamento por dia (o gasto é preenchido depois, com dados da Meta). */
  daily: DailyPoint[];
  regions: RegionRow[];
  recent: RecentSale[];
};

export const EMPTY_METRICS: PurchaseMetrics = {
  revenue: 0,
  sales: 0,
  refundedCount: 0,
  refundedValue: 0,
  chargebackCount: 0,
  chargebackValue: 0,
  pendingCount: 0,
  daily: [],
  regions: [],
  recent: [],
};

import { getTzYmd, shiftYmd } from "@/lib/period";

function toYmd(date: Date): string {
  return getTzYmd(date);
}

/** Todos os dias do intervalo no fuso de Brasília, para o gráfico não ter buracos. */
function daysBetween(from: Date, to: Date): string[] {
  const startYmd = getTzYmd(from);
  const endYmd = getTzYmd(to);
  const days: string[] = [];
  let curr = startYmd;

  while (curr <= endYmd && days.length < 400) {
    days.push(curr);
    curr = shiftYmd(curr, 1);
  }
  return days;
}

type PurchaseRow = {
  id: string;
  created_at: string;
  valor: number | null;
  status: string;
  produto: string | null;
  geo_country: string | null;
  geo_region: string | null;
  order_role: string | null;
  parent_order: string | null;
};

export async function getPurchaseMetrics(
  areaId: string,
  from: Date,
  to: Date,
): Promise<PurchaseMetrics> {
  let rows: PurchaseRow[] = [];

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("purchases")
      .select(
        "id, created_at, valor, status, produto, geo_country, geo_region, order_role, parent_order",
      )
      .eq("area_id", areaId)
      .gte("created_at", from.toISOString())
      .lte("created_at", to.toISOString())
      .order("created_at", { ascending: false })
      .limit(10_000);

    if (error || !data) return EMPTY_METRICS;
    rows = data as PurchaseRow[];
  } catch {
    return EMPTY_METRICS;
  }

  const metrics: PurchaseMetrics = {
    ...EMPTY_METRICS,
    daily: [],
    regions: [],
    recent: [],
  };

  const revenueByDay = new Map<string, number>();
  const regionMap = new Map<string, RegionRow>();

  for (const row of rows) {
    const value = Number(row.valor) || 0;

    switch (row.status) {
      case "approved": {
        // Order bump soma no faturamento, mas o pedido é UMA venda.
        const primary = isPrimarySale(row);
        metrics.revenue += value;
        if (primary) metrics.sales += 1;

        const day = toYmd(new Date(row.created_at));
        revenueByDay.set(day, (revenueByDay.get(day) ?? 0) + value);

        const key = `${row.geo_country ?? "?"}|${row.geo_region ?? "?"}`;
        const region = regionMap.get(key) ?? {
          country: row.geo_country,
          region: row.geo_region,
          sales: 0,
          revenue: 0,
        };
        if (primary) region.sales += 1;
        region.revenue += value;
        regionMap.set(key, region);
        break;
      }
      case "refunded":
        metrics.refundedCount += 1;
        metrics.refundedValue += value;
        break;
      case "chargeback":
        metrics.chargebackCount += 1;
        metrics.chargebackValue += value;
        break;
      case "pending":
        metrics.pendingCount += 1;
        break;
    }
  }

  metrics.daily = daysBetween(from, to).map((date) => ({
    date,
    revenue: revenueByDay.get(date) ?? 0,
    spend: 0,
  }));

  metrics.regions = [...regionMap.values()].sort((a, b) => b.sales - a.sales);

  metrics.recent = rows
    .filter((r) => r.status === "approved" && isPrimarySale(r))
    .slice(0, 12)
    .map((r) => ({
      id: r.id,
      produto: r.produto,
      valor: r.valor,
      created_at: r.created_at,
    }));

  return metrics;
}

/**
 * Faturamento aprovado no intervalo — versão leve, para a barra de progresso
 * da meta no header (que é mensal e independe do período selecionado).
 */
export const getRevenueTotal = cache(
  async (areaId: string, from: Date, to: Date): Promise<number> => {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("purchases")
        .select("valor")
        .eq("area_id", areaId)
        .eq("status", "approved")
        .gte("created_at", from.toISOString())
        .lte("created_at", to.toISOString())
        .limit(10_000);

      if (error || !data) return 0;
      return data.reduce((sum, row) => sum + (Number(row.valor) || 0), 0);
    } catch {
      return 0;
    }
  },
);

/** Junta o gasto diário da Meta na série de faturamento. */
export function mergeDailySpend(
  daily: DailyPoint[],
  dailySpend: Record<string, number>,
): DailyPoint[] {
  return daily.map((point) => ({
    ...point,
    spend: dailySpend[point.date] ?? 0,
  }));
}

/* ------------------------------------------------ checkout (Dashboard V2) */

export type PaymentMethod = "pix" | "cartao" | "boleto" | "outros";

export type PaymentStats = {
  /** Vendas iniciadas no checkout (todos os status). */
  total: number;
  approved: number;
  approvedValue: number;
};

export type CheckoutBreakdown = {
  /** Existe ao menos uma compra vinda do webhook no período? */
  hasData: boolean;
  byMethod: Record<PaymentMethod, PaymentStats>;
  pendingValue: number;
  /** Reembolsos + chargebacks. */
  returnedValue: number;
};

/**
 * Onde cada plataforma costuma mandar o método de pagamento. Lido direto do
 * `raw_webhook` (via caminho JSON do PostgREST), sem coluna própria: um caminho
 * errado aqui só deixa a venda em "outros", nunca perde dado.
 */
const PAYMENT_PATHS = [
  "raw_webhook->data->purchase->payment->>type", // Hotmart
  "raw_webhook->>payment_method", // Kiwify / Kirvano
  "raw_webhook->data->>paymentMethod", // Cakto
  "raw_webhook->>paymentMethod",
  "raw_webhook->data->>payment_method",
  "raw_webhook->payment->>method",
];

export function normalizePaymentMethod(value: unknown): PaymentMethod {
  const v = String(value ?? "").toLowerCase();
  if (!v) return "outros";
  if (v.includes("pix")) return "pix";
  if (/(card|credit|cartao|cartão|credito|crédito)/.test(v)) return "cartao";
  if (/(billet|boleto|bank_slip|ticket)/.test(v)) return "boleto";
  return "outros";
}

function emptyPaymentStats(): Record<PaymentMethod, PaymentStats> {
  const blank = () => ({ total: 0, approved: 0, approvedValue: 0 });
  return { pix: blank(), cartao: blank(), boleto: blank(), outros: blank() };
}

export async function getCheckoutBreakdown(
  areaId: string,
  from: Date,
  to: Date,
): Promise<CheckoutBreakdown> {
  const result: CheckoutBreakdown = {
    hasData: false,
    byMethod: emptyPaymentStats(),
    pendingValue: 0,
    returnedValue: 0,
  };

  try {
    const supabase = await createClient();
    const select = [
      "status",
      "valor",
      "order_role",
      "parent_order",
      ...PAYMENT_PATHS.map((path, i) => `pm${i}:${path}`),
    ].join(", ");

    const { data, error } = await supabase
      .from("purchases")
      .select(select)
      .eq("area_id", areaId)
      .gte("created_at", from.toISOString())
      .lte("created_at", to.toISOString())
      .limit(10_000);

    if (error || !data) return result;

    for (const raw of data as unknown as Record<string, unknown>[]) {
      result.hasData = true;
      const value = Number(raw.valor) || 0;
      const method = normalizePaymentMethod(
        PAYMENT_PATHS.map((_, i) => raw[`pm${i}`]).find(Boolean),
      );
      const stats = result.byMethod[method];
      // Taxa de aprovação e contagem por método: por PEDIDO (o bump segue o
      // pagamento do principal). Valores somam todos os itens.
      const primary = isPrimarySale({
        order_role: raw.order_role as string | null,
        parent_order: raw.parent_order as string | null,
      });
      if (primary) stats.total += 1;

      switch (raw.status) {
        case "approved":
          if (primary) stats.approved += 1;
          stats.approvedValue += value;
          break;
        case "pending":
          result.pendingValue += value;
          break;
        case "refunded":
        case "chargeback":
          result.returnedValue += value;
          break;
      }
    }
  } catch {
    // Mantém o resultado vazio: o card mostra N/A em vez de derrubar a página.
  }

  return result;
}
