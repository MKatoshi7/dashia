"use server";

import { revalidatePath } from "next/cache";

import { getActiveArea } from "@/lib/areas";
import { getCurrentUser } from "@/lib/auth";
import { getPlatform, mapStatus } from "@/lib/checkout/platforms";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  extractAdId,
  firstNumber,
  firstString,
  get,
  normalizeCountry,
  pickAdId,
  savePurchase,
} from "@/lib/webhooks/common";

export type ReprocessResult = {
  ok: boolean;
  total: number;
  processed: number;
  errors: number;
  message?: string;
};

/**
 * Reprocessa logs de webhook gravados no banco que ficaram como 'ignored' ou 'error',
 * extraindo novamente os dados com as plataformas e paths atualizados e inserindo
 * em purchases.
 */
export async function reprocessWebhookLogs(): Promise<ReprocessResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, total: 0, processed: 0, errors: 0, message: "Não autorizado." };

  const activeArea = await getActiveArea();
  if (!activeArea) {
    return { ok: false, total: 0, processed: 0, errors: 0, message: "Área não encontrada." };
  }

  const admin = createAdminClient();

  const { data: logs, error } = await admin
    .from("webhook_logs")
    .select("id, plataforma, event, payload, status")
    .eq("area_id", activeArea.id)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error || !logs) {
    return { ok: false, total: 0, processed: 0, errors: 0, message: error?.message || "Sem logs." };
  }

  let processedCount = 0;
  let errorCount = 0;

  for (const log of logs) {
    const platform = getPlatform(log.plataforma);
    if (!platform) continue;

    const payload = log.payload as Record<string, unknown>;
    if (!payload || typeof payload !== "object") continue;

    const { paths } = platform;
    const eventName = log.event || firstString(payload, paths.event ?? []);

    // Identifica transação
    const transactionId = firstString(payload, paths.transaction);
    if (!transactionId) {
      errorCount++;
      continue;
    }

    const status = mapStatus(platform, firstString(payload, paths.status), eventName);
    const valor = firstNumber(payload, paths.value);
    const produto = firstString(payload, paths.product ?? []);
    const email = firstString(payload, paths.email ?? []);
    const telefone = firstString(payload, paths.phone ?? []);

    const segment = platform.adIdSegment;
    const adId =
      pickAdId(payload, paths.adId, segment) ??
      extractAdId(firstString(payload, paths.utmContent ?? []), segment);

    const utm = {
      source: firstString(payload, paths.utmSource ?? []),
      medium: firstString(payload, paths.utmMedium ?? []),
      campaign: firstString(payload, paths.utmCampaign ?? []),
      term: firstString(payload, paths.utmTerm ?? []),
      content: firstString(payload, paths.utmContent ?? []),
    };

    const geo = {
      country: normalizeCountry(firstString(payload, paths.geoCountry ?? [])),
      region: firstString(payload, paths.geoRegion ?? []),
      city: firstString(payload, paths.geoCity ?? []),
    };

    try {
      await savePurchase({
        areaId: activeArea.id,
        transactionId,
        plataforma: platform.id,
        status,
        userId: firstString(payload, paths.userId ?? []),
        email,
        telefone,
        produto,
        valor,
        moeda: firstString(payload, paths.currency ?? []),
        adId,
        orderRole: firstString(payload, paths.offerType ?? []),
        parentOrder: firstString(payload, paths.parentOrder ?? []),
        raw: payload,
        utm,
        geo,
      });

      // Atualiza o log com os campos extraídos e status processed
      await admin
        .from("webhook_logs")
        .update({
          status: "processed",
          transaction_id: transactionId,
          ad_id: adId,
          produto,
          valor,
          email,
          telefone,
          utm_source: utm.source,
          utm_medium: utm.medium,
          utm_campaign: utm.campaign,
          utm_term: utm.term,
          utm_content: utm.content,
          error_message: null,
        })
        .eq("id", log.id);

      processedCount++;
    } catch {
      errorCount++;
    }
  }

  revalidatePath("/", "layout");
  revalidatePath("/dashboard");
  revalidatePath("/campanhas");
  revalidatePath("/vendas");
  revalidatePath("/financeiro");
  revalidatePath("/logs");

  return {
    ok: true,
    total: logs.length,
    processed: processedCount,
    errors: errorCount,
    message: `${processedCount} vendas reprocessadas e importadas com sucesso!`,
  };
}
