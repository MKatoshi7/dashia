import "server-only";

import { FUNNEL_METRIC_KEYS, FUNNEL_METRICS, type FunnelMetric } from "@/lib/funnel";
import { rateLimit } from "@/lib/rate-limit";

import { metaFetch } from "./campaigns";
import {
  cacheSecondsFor,
  firstActionCount,
  getAdAccounts,
  normalizeAccountId,
  sumActions,
  toYmd,
  type AdAccount,
} from "./client";
import { META_GRAPH_BASE, META_RATE_LIMIT } from "./config";

/**
 * Dados da Meta para o Dashboard V2. Vendas e faturamento são os que o
 * Gerenciador reporta (pixel) — a mesma fonte do modo "Vendas na Meta".
 *
 * Três chamadas por conta, todas em cache:
 *  - diária (time_increment=1): totais, funil e vendas por dia da semana;
 *  - por hora do fuso da conta: vendas por horário e o acumulado do dia;
 *  - por plataforma + posicionamento: vendas por fonte e por posicionamento.
 */

export type HourPoint = {
  hour: number;
  spend: number;
  sales: number;
  revenue: number;
};

export type BreakdownRow = {
  key: string;
  label: string;
  sales: number;
  revenue: number;
  spend: number;
};

export type MetaDashboard = {
  configured: boolean;
  errors: string[];
  /** Monetários já na moeda da área (contas em USD convertidas). */
  spend: number;
  sales: number;
  revenue: number;
  /** Total do período para cada métrica que o funil pode mostrar. */
  funnel: Record<FunnelMetric, number>;
  /** Vendas por dia da semana, 0 = domingo … 6 = sábado. */
  weekday: number[];
  /** 24 posições, hora do fuso da conta de anúncio. */
  hours: HourPoint[];
  platforms: BreakdownRow[];
  placements: BreakdownRow[];
};

function emptyHours(): HourPoint[] {
  return Array.from({ length: 24 }, (_, hour) => ({
    hour,
    spend: 0,
    sales: 0,
    revenue: 0,
  }));
}

const PLATFORM_LABELS: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  audience_network: "Audience Network",
  messenger: "Messenger",
  threads: "Threads",
  whatsapp: "WhatsApp",
};

/** "instagram_reels" → "Reels"; "feed" → "Feed". */
function humanize(value: string): string {
  const clean = value
    .replace(/^(facebook|instagram|messenger|threads)_/, "")
    .replace(/_/g, " ")
    .trim();
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

function insightsUrl(account: AdAccount, params: Record<string, string>) {
  const search = new URLSearchParams({
    ...params,
    limit: "500",
    access_token: account.ads_token!,
  });
  return `${META_GRAPH_BASE}/${normalizeAccountId(account.ad_account_id)}/insights?${search}`;
}

function addBreakdown(
  map: Map<string, BreakdownRow>,
  key: string,
  label: string,
  row: Record<string, unknown>,
  rate: number,
) {
  const entry = map.get(key) ?? { key, label, sales: 0, revenue: 0, spend: 0 };
  entry.sales += sumActions(row.actions, "purchase");
  entry.revenue += sumActions(row.action_values, "purchase") * rate;
  entry.spend += (Number(row.spend) || 0) * rate;
  map.set(key, entry);
}

export async function getMetaDashboard(
  areaId: string,
  from: Date,
  to: Date,
): Promise<MetaDashboard> {
  const result: MetaDashboard = {
    configured: false,
    errors: [],
    spend: 0,
    sales: 0,
    revenue: 0,
    funnel: Object.fromEntries(
      FUNNEL_METRIC_KEYS.map((key) => [key, 0]),
    ) as Record<FunnelMetric, number>,
    weekday: [0, 0, 0, 0, 0, 0, 0],
    hours: emptyHours(),
    platforms: [],
    placements: [],
  };

  const accounts = await getAdAccounts(areaId);
  if (accounts.length === 0) return result;
  result.configured = true;

  const cacheSeconds = cacheSecondsFor(to);
  const timeRange = JSON.stringify({ since: toYmd(from), until: toYmd(to) });
  const platforms = new Map<string, BreakdownRow>();
  const placements = new Map<string, BreakdownRow>();

  // Contas em PARALELO: cada uma é uma ida à Meta; em sequência o tempo somava.
  await Promise.all(accounts.map(async (account) => {
    if (!account.ads_token) {
      result.errors.push(`${account.label}: token não configurado`);
      return;
    }
    if (account.rateError) {
      result.errors.push(`${account.label}: ${account.rateError}`);
    }
    const rate = account.rate;

    // Uma checagem por carregamento (antes eram três em sequência, uma ida ao
    // banco cada). As três leituras quase sempre saem do cache, e o limite
    // já fica muito abaixo do da Meta.
    const allowed = await rateLimit(
      `meta:${account.id}`,
      META_RATE_LIMIT.max,
      META_RATE_LIMIT.windowSeconds,
    );
    if (!allowed) {
      result.errors.push(`${account.label}: rate limit interno atingido`);
      return;
    }

    const [daily, hourly, placement] = await Promise.all([
      metaFetch(
        insightsUrl(account, {
          fields:
            "spend,impressions,clicks,inline_link_clicks,actions,action_values",
          time_range: timeRange,
          time_increment: "1",
        }),
        cacheSeconds,
      ),
      metaFetch(
        insightsUrl(account, {
          fields: "spend,actions,action_values",
          time_range: timeRange,
          breakdowns: "hourly_stats_aggregated_by_advertiser_time_zone",
        }),
        cacheSeconds,
      ),
      metaFetch(
        insightsUrl(account, {
          fields: "spend,actions,action_values",
          time_range: timeRange,
          breakdowns: "publisher_platform,platform_position",
        }),
        cacheSeconds,
      ),
    ]);

    for (const error of [daily.error, hourly.error, placement.error]) {
      if (error) result.errors.push(`${account.label}: ${error}`);
    }

    for (const raw of daily.data) {
      const row = raw as Record<string, unknown>;
      const sales = sumActions(row.actions, "purchase");

      result.spend += (Number(row.spend) || 0) * rate;
      result.sales += sales;
      result.revenue += sumActions(row.action_values, "purchase") * rate;

      for (const key of FUNNEL_METRIC_KEYS) {
        const actions = FUNNEL_METRICS[key].actions;
        if (actions) {
          result.funnel[key] += firstActionCount(row.actions, [...actions]);
        }
      }
      result.funnel.impressions += Number(row.impressions) || 0;
      result.funnel.clicks += Number(row.clicks) || 0;
      result.funnel.link_clicks += Number(row.inline_link_clicks) || 0;

      // date_start é o dia no fuso da conta ("YYYY-MM-DD"); meio-dia UTC
      // evita que o fuso do servidor empurre a data para o dia vizinho.
      if (typeof row.date_start === "string") {
        const weekday = new Date(`${row.date_start}T12:00:00Z`).getUTCDay();
        result.weekday[weekday] += sales;
      }
    }

    for (const raw of hourly.data) {
      const row = raw as Record<string, unknown>;
      // Formato: "13:00:00 - 13:59:59".
      const bucket = String(
        row.hourly_stats_aggregated_by_advertiser_time_zone ?? "",
      );
      const hour = Number.parseInt(bucket.slice(0, 2), 10);
      if (!Number.isInteger(hour) || hour < 0 || hour > 23) continue;

      const point = result.hours[hour];
      point.spend += (Number(row.spend) || 0) * rate;
      point.sales += sumActions(row.actions, "purchase");
      point.revenue += sumActions(row.action_values, "purchase") * rate;
    }

    for (const raw of placement.data) {
      const row = raw as Record<string, unknown>;
      const platform = String(row.publisher_platform ?? "outros");
      const position = String(row.platform_position ?? "");
      const platformLabel = PLATFORM_LABELS[platform] ?? humanize(platform);

      addBreakdown(platforms, platform, platformLabel, row, rate);
      addBreakdown(
        placements,
        `${platform}:${position}`,
        position ? `${platformLabel} · ${humanize(position)}` : platformLabel,
        row,
        rate,
      );
    }
  }));

  const bySales = (a: BreakdownRow, b: BreakdownRow) =>
    b.sales - a.sales || b.revenue - a.revenue || b.spend - a.spend;
  result.platforms = [...platforms.values()].sort(bySales);
  result.placements = [...placements.values()].sort(bySales);

  return result;
}
