"use server";

import { revalidatePath, updateTag } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { AREA_COOKIE } from "@/lib/areas";
import { getCurrentUser } from "@/lib/auth";
import { META_CACHE_TAG } from "@/lib/meta/config";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type AreaState = { error?: string };

const YEAR = 60 * 60 * 24 * 365;

/** Grava a área ativa no cookie (propagada ao servidor em toda navegação). */
async function setAreaCookie(areaId: string) {
  const store = await cookies();
  store.set(AREA_COOKIE, areaId, {
    path: "/",
    sameSite: "lax",
    maxAge: YEAR,
  });
}

/** Registra uma mudança de configuração no log de auditoria. */
async function audit(
  areaId: string | null,
  actorEmail: string | undefined,
  action: string,
  details: Record<string, unknown>,
) {
  try {
    const admin = createAdminClient();
    await admin.from("audit_log").insert({
      area_id: areaId,
      actor_email: actorEmail ?? null,
      action,
      target_type: "area",
      target_id: areaId,
      details,
    });
  } catch {
    // Auditoria nunca deve derrubar a operação principal.
  }
}

/**
 * Botão "Atualizar" do header: expira o cache da Meta (senão os números podem
 * ter até 5 min) e a página é renderizada de novo com dados frescos.
 */
export async function refreshMetaData() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  updateTag(META_CACHE_TAG);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

/** Troca a área ativa do painel. */
export async function selectArea(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const areaId = String(formData.get("areaId") ?? "");
  if (!areaId) return;

  await setAreaCookie(areaId);
  revalidatePath("/", "layout");
}

const NameSchema = z
  .string()
  .trim()
  .min(1, "Informe o nome da área.")
  .max(60, "Nome muito longo.");

/** Cria uma área (+ a linha de settings) e a define como ativa. */
export async function createArea(
  _prev: AreaState,
  formData: FormData,
): Promise<AreaState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Não autenticado." };

  const parsed = NameSchema.safeParse(formData.get("nome") ?? "");
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Nome inválido." };
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("areas")
    .insert({ nome: parsed.data })
    .select("id")
    .single();

  if (error || !data) {
    return { error: `Não foi possível criar a área: ${error?.message}` };
  }

  const { error: settingsError } = await admin
    .from("settings")
    .insert({ area_id: data.id });
  if (settingsError) {
    return { error: `Área criada, mas falhou ao criar settings: ${settingsError.message}` };
  }

  await audit(data.id, user.email, "area.create", { nome: parsed.data });
  await setAreaCookie(data.id);
  revalidatePath("/", "layout");
  return {};
}

/** Renomeia uma área. */
export async function renameArea(
  _prev: AreaState,
  formData: FormData,
): Promise<AreaState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Não autenticado." };

  const areaId = String(formData.get("areaId") ?? "");
  const parsed = NameSchema.safeParse(formData.get("nome") ?? "");
  if (!areaId) return { error: "Área não informada." };
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Nome inválido." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("areas")
    .update({ nome: parsed.data })
    .eq("id", areaId);

  if (error) return { error: `Falha ao renomear: ${error.message}` };

  await audit(areaId, user.email, "area.rename", { nome: parsed.data });
  revalidatePath("/", "layout");
  return {};
}

/**
 * Exclui uma área. CUIDADO: remove em cascata visitantes, eventos e compras
 * daquela área. Nunca deixa a instância sem nenhuma área.
 */
export async function deleteArea(
  _prev: AreaState,
  formData: FormData,
): Promise<AreaState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Não autenticado." };

  const areaId = String(formData.get("areaId") ?? "");
  if (!areaId) return { error: "Área não informada." };

  const admin = createAdminClient();

  const { count } = await admin
    .from("areas")
    .select("id", { count: "exact", head: true });
  if ((count ?? 0) <= 1) {
    return { error: "Não é possível excluir a única área da instância." };
  }

  const { error } = await admin.from("areas").delete().eq("id", areaId);
  if (error) return { error: `Falha ao excluir: ${error.message}` };

  await audit(null, user.email, "area.delete", { area_id: areaId });

  const store = await cookies();
  if (store.get(AREA_COOKIE)?.value === areaId) {
    store.delete(AREA_COOKIE);
  }

  revalidatePath("/", "layout");
  return {};
}
