import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

/**
 * Settings da área (uma linha por área).
 * ATENÇÃO: nunca selecionar aqui as colunas de segredo (hotmart_hottok,
 * kiwify_webhook_token) — elas só são lidas/decifradas no servidor, nas rotas
 * que realmente precisam (Fase 4/7).
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
};

export const DEFAULT_SETTINGS: Omit<Settings, "area_id"> = {
  currency: "BRL",
  tax_rate: 0,
  revenue_goal: 0,
  allowed_origins: [],
  dashboard_version: "legacy",
  meta_tax_rate: 12.15,
};

const BASE_COLUMNS = "area_id, currency, tax_rate, revenue_goal, allowed_origins";

export const getSettings = cache(
  async (areaId: string): Promise<Settings | null> => {
    try {
      const supabase = await createClient();
      const full = await supabase
        .from("settings")
        .select(`${BASE_COLUMNS}, dashboard_version, meta_tax_rate`)
        .eq("area_id", areaId)
        .maybeSingle();

      // 42703 = coluna inexistente: a migration dashboard_prefs ainda não foi
      // aplicada. Cai para as colunas antigas em vez de zerar a área inteira.
      if (full.error?.code === "42703") {
        const base = await supabase
          .from("settings")
          .select(BASE_COLUMNS)
          .eq("area_id", areaId)
          .maybeSingle();
        if (base.error || !base.data) return null;
        return {
          ...DEFAULT_SETTINGS,
          ...(base.data as Omit<Settings, "dashboard_version" | "meta_tax_rate">),
        };
      }

      if (full.error || !full.data) return null;
      const data = full.data as Settings;
      return {
        ...data,
        dashboard_version: data.dashboard_version === "v2" ? "v2" : "legacy",
        meta_tax_rate: Number(data.meta_tax_rate ?? DEFAULT_SETTINGS.meta_tax_rate),
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
