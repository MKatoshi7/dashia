import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

/**
 * Usuário autenticado do PAINEL (auth.users do Supabase).
 * Não confundir com o `user_id` de visitante (anônimo, ver src/lib/ids.ts).
 *
 * Usa getUser(), que revalida o token no servidor de Auth — nunca confie em
 * getSession() para autorização no servidor.
 *
 * `cache`: layout e página rodam no MESMO request e ambos perguntam quem é o
 * usuário — sem isso eram duas idas ao servidor de Auth por troca de tela.
 */
export const getCurrentUser = cache(async () => {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user;
  } catch {
    return null;
  }
});

/** Nome de exibição do usuário (fallback: parte local do e-mail). */
export function displayName(user: { email?: string | null; user_metadata?: Record<string, unknown> } | null) {
  if (!user) return "";
  const name = user.user_metadata?.name;
  if (typeof name === "string" && name.trim()) return name.trim();
  return user.email?.split("@")[0] ?? "";
}
