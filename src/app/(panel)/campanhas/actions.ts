"use server";

import { revalidatePath } from "next/cache";

import { getActiveArea } from "@/lib/areas";
import { getCurrentUser } from "@/lib/auth";
import {
  DEFAULT_CAMPAIGN_COLUMNS,
  isCampaignColumn,
} from "@/lib/campaign-columns";
import { updateEntityBudget, updateEntityStatus } from "@/lib/meta/write";
import { createAdminClient } from "@/lib/supabase/admin";

export type MetaWriteState = { error?: string; ok?: boolean };

/**
 * Escritas de GESTÃO na Meta, disparadas pela edição inline de Campanhas.
 * Sempre: checa sessão → escreve → registra em audit_log.
 * A confirmação em modal acontece na UI antes de chamar estas actions.
 */
async function audit(
  areaId: string,
  actorEmail: string | undefined,
  action: string,
  targetId: string,
  details: Record<string, unknown>,
) {
  try {
    const admin = createAdminClient();
    await admin.from("audit_log").insert({
      area_id: areaId,
      actor_email: actorEmail ?? null,
      action,
      target_type: "meta_entity",
      target_id: targetId,
      details,
    });
  } catch {
    // Auditoria nunca derruba a operação principal.
  }
}

export async function setEntityStatus(
  _prev: MetaWriteState,
  formData: FormData,
): Promise<MetaWriteState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Não autenticado." };

  const area = await getActiveArea();
  if (!area) return { error: "Nenhuma área ativa." };

  const accountId = String(formData.get("accountId") ?? "");
  const entityId = String(formData.get("entityId") ?? "");
  const status = String(formData.get("status") ?? "");
  const level = String(formData.get("level") ?? "");

  if (!accountId || !entityId) return { error: "Dados incompletos." };
  if (status !== "ACTIVE" && status !== "PAUSED") {
    return { error: "Status inválido." };
  }

  const result = await updateEntityStatus(
    area.id,
    accountId,
    entityId,
    status,
  );

  await audit(area.id, user.email, "meta.update_status", entityId, {
    level,
    status,
    ok: result.ok,
    error: result.error ?? null,
  });

  if (!result.ok) return { error: result.error ?? "Falha ao atualizar." };

  revalidatePath("/campanhas");
  return { ok: true };
}

export async function setEntityBudget(
  _prev: MetaWriteState,
  formData: FormData,
): Promise<MetaWriteState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Não autenticado." };

  const area = await getActiveArea();
  if (!area) return { error: "Nenhuma área ativa." };

  const accountId = String(formData.get("accountId") ?? "");
  const entityId = String(formData.get("entityId") ?? "");
  const level = String(formData.get("level") ?? "");
  const budgetType = String(formData.get("budgetType") ?? "daily");
  const amount = Number(
    String(formData.get("amount") ?? "").replace(",", "."),
  );

  if (!accountId || !entityId) return { error: "Dados incompletos." };
  if (budgetType !== "daily" && budgetType !== "lifetime") {
    return { error: "Tipo de orçamento inválido." };
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: "Informe um orçamento maior que zero." };
  }

  const result = await updateEntityBudget(
    area.id,
    accountId,
    entityId,
    budgetType,
    amount,
  );

  await audit(area.id, user.email, "meta.update_budget", entityId, {
    level,
    budgetType,
    amount,
    ok: result.ok,
    error: result.error ?? null,
  });

  if (!result.ok) return { error: result.error ?? "Falha ao atualizar." };

  revalidatePath("/campanhas");
  return { ok: true };
}

/* ------------------------------------------------ ordem das colunas */

export type ColumnsState = { error?: string; ok?: string };

/** Ordem das colunas da tabela (campo `columns` repetido, na ordem). */
export async function saveCampaignColumns(
  _prev: ColumnsState,
  formData: FormData,
): Promise<ColumnsState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Não autenticado." };
  const area = await getActiveArea();
  if (!area) return { error: "Nenhuma área ativa." };

  const raw = formData.getAll("columns").map(String);
  const columns = [...new Set(raw.filter(isCampaignColumn))];
  if (columns.length !== raw.length || columns.length !== DEFAULT_CAMPAIGN_COLUMNS.length) {
    return { error: "Lista de colunas inválida." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("settings")
    .update({ campaign_columns: columns })
    .eq("area_id", area.id);

  if (error) return { error: `Falha ao salvar: ${error.message}` };

  revalidatePath("/campanhas");
  return { ok: "Ordem salva." };
}
