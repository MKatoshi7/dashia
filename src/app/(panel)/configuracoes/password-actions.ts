"use server";

import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type PasswordState = { error?: string; ok?: string };

/**
 * Troca a senha do usuário LOGADO. Não pede a senha atual: a sessão válida já
 * prova quem é. Usa o cliente da sessão (não o service_role), então só altera
 * a conta de quem está logado — nunca a de outro usuário.
 */
const PasswordSchema = z
  .object({
    password: z
      .string()
      .min(12, "Use pelo menos 12 caracteres.")
      .max(72, "Senha muito longa (máx. 72 caracteres)."),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: "As duas senhas não são iguais.",
  });

export async function changePassword(
  _prev: PasswordState,
  formData: FormData,
): Promise<PasswordState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Não autenticado." };

  const parsed = PasswordSchema.safeParse({
    password: formData.get("password") ?? "",
    confirm: formData.get("confirm") ?? "",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (error) return { error: `Falha ao trocar a senha: ${error.message}` };

  // Nunca registrar a senha — só o fato de que foi trocada.
  await createAdminClient().from("audit_log").insert({
    actor_email: user.email ?? null,
    action: "config.password",
    target_type: "user",
    target_id: user.id,
  });

  return { ok: "Senha alterada. Use a nova no próximo login." };
}
