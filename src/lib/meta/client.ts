import "server-only";

import { decryptSecret } from "@/lib/crypto";
import { rateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

import {
  META_CACHE,
  META_GRAPH_BASE,
  META_RATE_LIMIT,
} from "./config";

/**
 * Cliente da Meta Ads — SOMENTE LEITURA de insights nesta fase.
 * Este sistema NUNCA envia eventos de conversão (sem Conversions API).
 */

export type MetaInsights = {
  spend: number;
  impressions: number;
  clicks: number;
  /** Conversões que a Meta reporta (modo "Vendas na Meta"). */
  metaPurchases: number;
  metaRevenue: number;
};

export const EMPTY_INSIGHTS: MetaInsights = {
  spend: 0,
  impressions: 0,
  clicks: 0,
  metaPurchases: 0,
  metaRevenue: 0,
};

export type MetaResult = {
  insights: MetaInsights;
  /** Gasto por dia (YYYY-MM-DD → spend), para o gráfico. */
  dailySpend: Record<string, number>;
  /** Há pelo menos uma conta de anúncio configurada na área? */
  configured: boolean;
  /** Mensagens de erro por conta (exibidas discretamente no painel). */
  errors: string[];
};

export type AdAccount = {
  id: string;
  label: string;
  ad_account_id: string;
  ads_token: string | null;
};

export function toYmd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Normaliza "123" ou "act_123" para "act_123". */
export function normalizeAccountId(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith("act_") ? trimmed : `act_${trimmed}`;
}

/** Períodos que tocam os últimos dias mudam (atribuição retroativa da Meta). */
export function cacheSecondsFor(until: Date): number {
  const daysAgo = (Date.now() - until.getTime()) / 86_400_000;
  return daysAgo > META_CACHE.recentWindowDays
    ? META_CACHE.historicalSeconds
    : META_CACHE.recentSeconds;
}

/** Soma um tipo de action do payload de insights. */
export function sumActions(list: unknown, type: string): number {
  if (!Array.isArray(list)) return 0;
  return list.reduce<number>((total, item) => {
    if (
      item &&
      typeof item === "object" &&
      (item as { action_type?: string }).action_type === type
    ) {
      const value = Number((item as { value?: unknown }).value);
      return total + (Number.isFinite(value) ? value : 0);
    }
    return total;
  }, 0);
}

/**
 * Primeiro tipo de action com valor. A Meta repete o MESMO evento sob vários
 * nomes (agregado, omni, pixel) — somá-los contaria em dobro.
 */
export function firstActionCount(list: unknown, types: string[]): number {
  for (const type of types) {
    const value = sumActions(list, type);
    if (value > 0) return value;
  }
  return 0;
}

/** "Finalizações de compra iniciadas" do Gerenciador, em ordem de preferência. */
export const INITIATE_CHECKOUT_ACTIONS = [
  "initiate_checkout",
  "omni_initiated_checkout",
  "offsite_conversion.fb_pixel_initiate_checkout",
];

/** "Visualizações da página de destino" do Gerenciador, em ordem de preferência. */
export const LANDING_PAGE_VIEW_ACTIONS = [
  "landing_page_view",
  "omni_landing_page_view",
];

/** Contas de anúncio da área, com o ads_token já decifrado. SOMENTE no servidor. */
export async function getAdAccounts(areaId: string): Promise<AdAccount[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("meta_ad_accounts")
    .select("id, label, ad_account_id, ads_token")
    .eq("area_id", areaId);

  if (error || !data) return [];

  const accounts = await Promise.all(
    data.map(async (row) => {
      const cipher = row.ads_token as string | null;
      let token: string | null = null;
      if (cipher) {
        try {
          token = await decryptSecret(cipher);
        } catch (err) {
          console.error("[meta] falha ao decifrar ads_token:", err);
        }
      }
      return { ...row, ads_token: token } as AdAccount;
    }),
  );

  return accounts;
}

/**
 * Insights agregados da área no período (todas as contas, ou uma específica).
 * Nunca lança: em caso de falha devolve zeros + a mensagem de erro, para o
 * painel continuar funcionando com os dados próprios.
 */
export async function getAreaInsights(
  areaId: string,
  from: Date,
  to: Date,
  accountFilter?: string,
): Promise<MetaResult> {
  const all = await getAdAccounts(areaId);
  const accounts = accountFilter
    ? all.filter((a) => a.id === accountFilter)
    : all;

  if (accounts.length === 0) {
    return {
      insights: EMPTY_INSIGHTS,
      dailySpend: {},
      configured: all.length > 0,
      errors: [],
    };
  }

  const totals: MetaInsights = { ...EMPTY_INSIGHTS };
  const dailySpend: Record<string, number> = {};
  const errors: string[] = [];

  for (const account of accounts) {
    if (!account.ads_token) {
      errors.push(`${account.label}: token não configurado`);
      continue;
    }

    // Rate limit conservador por conta.
    const allowed = await rateLimit(
      `meta:${account.id}`,
      META_RATE_LIMIT.max,
      META_RATE_LIMIT.windowSeconds,
    );
    if (!allowed) {
      errors.push(`${account.label}: rate limit interno atingido`);
      continue;
    }

    const params = new URLSearchParams({
      fields: "spend,impressions,clicks,actions,action_values",
      time_range: JSON.stringify({ since: toYmd(from), until: toYmd(to) }),
      // Uma linha por dia: a mesma chamada serve para o total e para o gráfico.
      time_increment: "1",
      access_token: account.ads_token,
    });

    const url = `${META_GRAPH_BASE}/${normalizeAccountId(account.ad_account_id)}/insights?${params}`;

    try {
      const response = await fetch(url, {
        next: { revalidate: cacheSecondsFor(to) },
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        errors.push(
          `${account.label}: ${body?.error?.message ?? `HTTP ${response.status}`}`,
        );
        continue;
      }

      const payload = (await response.json()) as { data?: unknown[] };

      for (const row of payload.data ?? []) {
        const r = row as Record<string, unknown>;
        const spend = Number(r.spend) || 0;

        totals.spend += spend;
        totals.impressions += Number(r.impressions) || 0;
        totals.clicks += Number(r.clicks) || 0;
        totals.metaPurchases += sumActions(r.actions, "purchase");
        totals.metaRevenue += sumActions(r.action_values, "purchase");

        // Com time_increment=1 cada linha traz date_start (YYYY-MM-DD).
        const day = typeof r.date_start === "string" ? r.date_start : null;
        if (day) dailySpend[day] = (dailySpend[day] ?? 0) + spend;
      }
    } catch (err) {
      errors.push(
        `${account.label}: ${err instanceof Error ? err.message : "falha na requisição"}`,
      );
    }
  }

  return { insights: totals, dailySpend, configured: true, errors };
}
