import "server-only";

import { isPrimarySale } from "@/lib/sales";
import { createClient } from "@/lib/supabase/server";

/**
 * Atribuição LAST CLICK a partir dos DADOS PRÓPRIOS, sempre por `ad_id` exato
 * (nunca por nome de campanha).
 *
 * - Vendas/Faturamento: `purchases` aprovadas com ad_id.
 * - Checkouts: eventos `initiate_checkout` cujo utm_content é o ad_id.
 */
export type LastClickRow = {
  sales: number;
  revenue: number;
  checkouts: number;
};

export type LastClickMap = Map<string, LastClickRow>;

function emptyRow(): LastClickRow {
  return { sales: 0, revenue: 0, checkouts: 0 };
}

export async function getLastClickByAd(
  areaId: string,
  from: Date,
  to: Date,
): Promise<LastClickMap> {
  const map: LastClickMap = new Map();

  try {
    const supabase = await createClient();

    const [purchases, events] = await Promise.all([
      supabase
        .from("purchases")
        .select("ad_id, valor, order_role, parent_order")
        .eq("area_id", areaId)
        .eq("status", "approved")
        .not("ad_id", "is", null)
        .gte("created_at", from.toISOString())
        .lte("created_at", to.toISOString())
        .limit(20_000),
      supabase
        .from("events_log")
        .select("utm_content")
        .eq("area_id", areaId)
        .eq("event_name", "initiate_checkout")
        .not("utm_content", "is", null)
        .gte("created_at", from.toISOString())
        .lte("created_at", to.toISOString())
        .limit(50_000),
    ]);

    for (const row of purchases.data ?? []) {
      const adId = row.ad_id as string | null;
      if (!adId) continue;
      const entry = map.get(adId) ?? emptyRow();
      // Order bump soma no faturamento do anúncio, mas não é venda nova.
      if (isPrimarySale(row)) entry.sales += 1;
      entry.revenue += Number(row.valor) || 0;
      map.set(adId, entry);
    }

    for (const row of events.data ?? []) {
      const adId = row.utm_content as string | null;
      // Só conta como checkout de anúncio se o utm_content for um ad_id.
      if (!adId || !/^\d{5,25}$/.test(adId)) continue;
      const entry = map.get(adId) ?? emptyRow();
      entry.checkouts += 1;
      map.set(adId, entry);
    }
  } catch {
    return map;
  }

  return map;
}

/** Totais de page_view e checkouts do período (para o funil). */
export async function getFunnelBase(
  areaId: string,
  from: Date,
  to: Date,
): Promise<{ views: number; checkouts: number }> {
  try {
    const supabase = await createClient();

    const [views, checkouts] = await Promise.all([
      supabase
        .from("events_log")
        .select("id", { count: "exact", head: true })
        .eq("area_id", areaId)
        .eq("event_name", "page_view")
        .gte("created_at", from.toISOString())
        .lte("created_at", to.toISOString()),
      supabase
        .from("events_log")
        .select("id", { count: "exact", head: true })
        .eq("area_id", areaId)
        .eq("event_name", "initiate_checkout")
        .gte("created_at", from.toISOString())
        .lte("created_at", to.toISOString()),
    ]);

    return {
      views: views.count ?? 0,
      checkouts: checkouts.count ?? 0,
    };
  } catch {
    return { views: 0, checkouts: 0 };
  }
}
