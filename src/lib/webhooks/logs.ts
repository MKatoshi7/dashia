import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export type WebhookLogStatus = "processed" | "ignored" | "test" | "error";

export type WebhookLogEntry = {
  areaId: string;
  plataforma: string;
  event: string | null;
  status: WebhookLogStatus;
  transactionId?: string | null;
  adId?: string | null;
  produto?: string | null;
  valor?: number | null;
  email?: string | null;
  telefone?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmTerm?: string | null;
  utmContent?: string | null;
  payload: unknown;
  errorMessage?: string | null;
};

/**
 * Registra um evento de webhook na tabela webhook_logs para auditoria
 * e observabilidade em tempo real. Nunca falha a execução principal.
 */
export async function recordWebhookLog(entry: WebhookLogEntry): Promise<void> {
  try {
    const admin = createAdminClient();
    const payloadObj =
      entry.payload && typeof entry.payload === "object"
        ? (entry.payload as Record<string, unknown>)
        : { raw: entry.payload };

    await admin.from("webhook_logs").insert({
      area_id: entry.areaId,
      plataforma: entry.plataforma,
      event: entry.event || "unknown",
      status: entry.status,
      transaction_id: entry.transactionId || null,
      ad_id: entry.adId || null,
      produto: entry.produto || null,
      valor: entry.valor ?? null,
      email: entry.email || null,
      telefone: entry.telefone || null,
      utm_source: entry.utmSource || null,
      utm_medium: entry.utmMedium || null,
      utm_campaign: entry.utmCampaign || null,
      utm_term: entry.utmTerm || null,
      utm_content: entry.utmContent || null,
      payload: payloadObj,
      error_message: entry.errorMessage || null,
    });
  } catch (err) {
    console.error("[webhook_logs] falha ao gravar log no banco:", err);
  }
}
