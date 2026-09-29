import "server-only";

import { cache } from "react";

import {
  DEFAULT_CAMPAIGN_COLUMNS,
  normalizeCampaignColumns,
  type CampaignColumn,
} from "@/lib/campaign-columns";
import { DEFAULT_FUNNEL, normalizeFunnel, type FunnelMetric } from "@/lib/funnel";
import { createClient } from "@/lib/supabase/server";

/**
 * Settings da área (uma linha por área). Não guarda segredos: os de webhook
 * vivem em `checkout_integrations`, cifrados.
 */
export type DashboardVersion = "legacy" | "v2";

export type Settings = {
  area_id: string;
  currency: string;
  tax_rate: number;
  revenue_goal: number;
  allowed_origins: string[];
  dashboard_version: DashboardVersion;
  /** Imposto da Meta sobre o gasto (%), calculado "por dentro". */
  meta_tax_rate: number;
  /** Métricas das etapas do funil do Dashboard V2, na ordem. */
  dashboard_funnel: FunnelMetric[];
  /** Ordem das colunas de métricas da tabela de Campanhas. */
  campaign_columns: CampaignColumn[];
};

export const DEFAULT_SETTINGS: Omit<Settings, "area_id"> = {
  currency: "BRL",
  tax_rate: 0,
  revenue_goal: 0,
  allowed_origins: [],
  dashboard_version: "legacy",
  meta_tax_rate: 12.15,
  dashboard_funnel: DEFAULT_FUNNEL,
  campaign_columns: DEFAULT_CAMPAIGN_COLUMNS,
};

export const getSettings = cache(
  async (areaId: string): Promise<Settings | null> => {
    try {
      const supabase = await createClient();
      // `*` de propósito: colunas de migrations ainda não aplicadas
      // simplesmente não vêm, e caem no default abaixo — sem erro 42703.
      const { data, error } = await supabase
        .from("settings")
        .select("*")
        .eq("area_id", areaId)
        .maybeSingle();

      if (error || !data) return null;
      const row = data as Partial<Settings> & { area_id: string };

      return {
        area_id: row.area_id,
        currency: row.currency ?? DEFAULT_SETTINGS.currency,
        tax_rate: Number(row.tax_rate ?? DEFAULT_SETTINGS.tax_rate),
        revenue_goal: Number(row.revenue_goal ?? DEFAULT_SETTINGS.revenue_goal),
        allowed_origins: row.allowed_origins ?? [],
        dashboard_version: row.dashboard_version === "v2" ? "v2" : "legacy",
        meta_tax_rate: Number(row.meta_tax_rate ?? DEFAULT_SETTINGS.meta_tax_rate),
        dashboard_funnel: normalizeFunnel(row.dashboard_funnel),
        campaign_columns: normalizeCampaignColumns(row.campaign_columns),
      };
    } catch {
      return null;
    }
  },
);

/**
 * Imposto da Meta sobre o gasto. A Meta calcula "por dentro": o total cobrado
 * é gasto / (1 − taxa), então o imposto é gasto × taxa / (1 − taxa).
 * (Ex.: 12,15% sobre R$ 58,55 → R$ 8,10.)
 */
export function metaTax(spend: number, ratePercent: number): number {
  const rate = ratePercent / 100;
  if (rate <= 0 || rate >= 1) return 0;
  return (spend * rate) / (1 - rate);
}
