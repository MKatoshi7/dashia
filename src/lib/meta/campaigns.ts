import "server-only";

import { rateLimit } from "@/lib/rate-limit";

import {
  cacheSecondsFor,
  firstActionCount,
  getAdAccounts,
  INITIATE_CHECKOUT_ACTIONS,
  LANDING_PAGE_VIEW_ACTIONS,
  normalizeAccountId,
  sumActions,
  toYmd,
  type AdAccount,
} from "./client";
import { META_GRAPH_BASE, META_RATE_LIMIT } from "./config";

/**
 * Hierarquia campanha → conjunto → anúncio, vinda da Ads API.
 * O cruzamento com os dados próprios é SEMPRE por ID exato (nunca por nome).
 */

export type MetaLevel = "campaign" | "adset" | "ad";

export type MetaEntity = {
  id: string;
  name: string;
  level: MetaLevel;
  /** Status configurado (ACTIVE/PAUSED) — é o que a edição inline altera. */
  status: string;
  effectiveStatus: string;
  /** Orçamento na unidade da moeda (a Meta trabalha em centavos). */
  budgetAmount: number | null;
  budgetType: "daily" | "lifetime" | null;
  /** Moeda do orçamento = moeda da CONTA (ele volta para a Meta sem conversão). */
  budgetCurrency: string;
  /** Conta interna (meta_ad_accounts.id) e rótulo, para filtro e escrita. */
  accountId: string;
  accountLabel: string;
  spend: number;
  impressions: number;
  clicks: number;
  metaPurchases: number;
  metaRevenue: number;
  /** "Finalizações de compra iniciadas" que o pixel reportou à Meta. */
  metaCheckouts: number;
  /** "Visualizações da página de destino" que o pixel reportou à Meta. */
  metaLandingViews: number;
  /** ad_ids que compõem a linha — base da atribuição Last Click. */
  adIds: string[];
};

export type CampaignsResult = {
  rows: MetaEntity[];
  configured: boolean;
  errors: string[];
};

const LEVEL_EDGE: Record<MetaLevel, string> = {
  campaign: "campaigns",
  adset: "adsets",
  ad: "ads",
};

const LEVEL_ID_FIELD: Record<MetaLevel, string> = {
  campaign: "campaign_id",
  adset: "adset_id",
  ad: "ad_id",
};

/** A Meta devolve orçamento em centavos (string). */
function centsToAmount(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed / 100 : null;
}

export async function metaFetch(
  url: string,
  cacheSeconds: number,
): Promise<{ data: unknown[]; error: string | null }> {
  try {
    const response = await fetch(url, { next: { revalidate: cacheSeconds } });

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      return {
        data: [],
        error: body?.error?.message ?? `HTTP ${response.status}`,
      };
    }

    const payload = (await response.json()) as { data?: unknown[] };
    return { data: payload.data ?? [], error: null };
  } catch (err) {
    return {
      data: [],
      error: err instanceof Error ? err.message : "falha na requisição",
    };
  }
}

/**
 * Insights no nível de ANÚNCIO — uma chamada só resolve as métricas e a
 * hierarquia (ad → adset → campaign), que depois é agregada para cima.
 */
async function fetchAdInsights(
  account: AdAccount,
  from: Date,
  to: Date,
  cacheSeconds: number,
) {
  const params = new URLSearchParams({
    level: "ad",
    fields:
      "ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,spend,impressions,clicks,actions,action_values",
    time_range: JSON.stringify({ since: toYmd(from), until: toYmd(to) }),
    limit: "500",
    access_token: account.ads_token!,
  });

  return metaFetch(
    `${META_GRAPH_BASE}/${normalizeAccountId(account.ad_account_id)}/insights?${params}`,
    cacheSeconds,
  );
}

/** Metadados (nome, status, orçamento) do nível pedido. */
async function fetchEntities(
  account: AdAccount,
  level: MetaLevel,
  cacheSeconds: number,
) {
  const fields =
    level === "ad"
      ? "id,name,status,effective_status"
      : "id,name,status,effective_status,daily_budget,lifetime_budget";

  const params = new URLSearchParams({
    fields,
    limit: "500",
    access_token: account.ads_token!,
  });

  return metaFetch(
    `${META_GRAPH_BASE}/${normalizeAccountId(account.ad_account_id)}/${LEVEL_EDGE[level]}?${params}`,
    cacheSeconds,
  );
}

export async function getMetaEntities(
  areaId: string,
  level: MetaLevel,
  from: Date,
  to: Date,
  accountFilter?: string,
): Promise<CampaignsResult> {
  const all = await getAdAccounts(areaId);
  const accounts = accountFilter
    ? all.filter((a) => a.id === accountFilter)
    : all;

  if (accounts.length === 0) {
    return { rows: [], configured: all.length > 0, errors: [] };
  }

  const cacheSeconds = cacheSecondsFor(to);
  const rows: MetaEntity[] = [];
  const errors: string[] = [];

  for (const account of accounts) {
    if (!account.ads_token) {
      errors.push(`${account.label}: token não configurado`);
      continue;
    }
    if (account.rateError) errors.push(`${account.label}: ${account.rateError}`);

    // Duas chamadas por conta (insights + metadados) — respeitando o limite.
    const allowed = await rateLimit(
      `meta:${account.id}`,
      META_RATE_LIMIT.max,
      META_RATE_LIMIT.windowSeconds,
    );
    if (!allowed) {
      errors.push(`${account.label}: rate limit interno atingido`);
      continue;
    }

    const [insights, entities] = await Promise.all([
      fetchAdInsights(account, from, to, cacheSeconds),
      fetchEntities(account, level, cacheSeconds),
    ]);

    if (insights.error) errors.push(`${account.label}: ${insights.error}`);
    if (entities.error) errors.push(`${account.label}: ${entities.error}`);

    // Agrega os insights de anúncio para o nível pedido.
    const idField = LEVEL_ID_FIELD[level];
    const aggregated = new Map<
      string,
      Omit<MetaEntity, "id" | "name" | "level" | "status" | "effectiveStatus" | "budgetAmount" | "budgetType" | "budgetCurrency" | "accountId" | "accountLabel">
    >();

    for (const raw of insights.data) {
      const row = raw as Record<string, unknown>;
      const id = row[idField];
      if (typeof id !== "string") continue;

      const entry = aggregated.get(id) ?? {
        spend: 0,
        impressions: 0,
        clicks: 0,
        metaPurchases: 0,
        metaRevenue: 0,
        metaCheckouts: 0,
        metaLandingViews: 0,
        adIds: [] as string[],
      };

      // Monetários convertidos para a moeda da área (conta em USD → R$).
      entry.spend += (Number(row.spend) || 0) * account.rate;
      entry.impressions += Number(row.impressions) || 0;
      entry.clicks += Number(row.clicks) || 0;
      entry.metaPurchases += sumActions(row.actions, "purchase");
      entry.metaRevenue +=
        sumActions(row.action_values, "purchase") * account.rate;
      entry.metaCheckouts += firstActionCount(
        row.actions,
        INITIATE_CHECKOUT_ACTIONS,
      );
      entry.metaLandingViews += firstActionCount(
        row.actions,
        LANDING_PAGE_VIEW_ACTIONS,
      );

      const adId = row.ad_id;
      if (typeof adId === "string" && !entry.adIds.includes(adId)) {
        entry.adIds.push(adId);
      }

      aggregated.set(id, entry);
    }

    for (const raw of entities.data) {
      const entity = raw as Record<string, unknown>;
      const id = entity.id;
      if (typeof id !== "string") continue;

      const metrics = aggregated.get(id) ?? {
        spend: 0,
        impressions: 0,
        clicks: 0,
        metaPurchases: 0,
        metaRevenue: 0,
        metaCheckouts: 0,
        metaLandingViews: 0,
        adIds: level === "ad" ? [id] : [],
      };

      const daily = centsToAmount(entity.daily_budget);
      const lifetime = centsToAmount(entity.lifetime_budget);

      rows.push({
        id,
        name: typeof entity.name === "string" ? entity.name : id,
        level,
        status: typeof entity.status === "string" ? entity.status : "UNKNOWN",
        effectiveStatus:
          typeof entity.effective_status === "string"
            ? entity.effective_status
            : "",
        budgetAmount: daily ?? lifetime,
        budgetType: daily ? "daily" : lifetime ? "lifetime" : null,
        budgetCurrency: account.currency,
        accountId: account.id,
        accountLabel: account.label,
        ...metrics,
        adIds: level === "ad" ? [id] : metrics.adIds,
      });
    }
  }

  return { rows, configured: true, errors };
}

/** Contas da área para o filtro do topo (sem expor tokens). */
export async function getAccountOptions(
  areaId: string,
): Promise<{ id: string; label: string }[]> {
  const accounts = await getAdAccounts(areaId);
  return accounts.map((a) => ({ id: a.id, label: a.label }));
}
