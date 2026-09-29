"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getActiveArea } from "@/lib/areas";
import { getCurrentUser } from "@/lib/auth";
import { getPlatform } from "@/lib/checkout/platforms";
import { encryptSecret } from "@/lib/crypto";
import {
  discoverAdAccounts,
  type DiscoveredAccount,
} from "@/lib/meta/discover";
import { testAdAccountConnection } from "@/lib/meta/test-connection";
import { createAdminClient } from "@/lib/supabase/admin";

export type FormState = { error?: string; ok?: string };

/** Estado do fluxo "colar token → listar contas → escolher". */
export type DiscoverState = {
  error?: string;
  ok?: string;
  accounts?: DiscoveredAccount[];
};

/**
 * Configuração das integrações. Todo segredo é CIFRADO (pgcrypto) antes de ir
 * para o banco; o painel nunca exibe o valor em claro, só se está configurado.
 */
async function requireArea() {
  const user = await getCurrentUser();
  if (!user) return { error: "Não autenticado." as const };
  const area = await getActiveArea();
  if (!area) return { error: "Nenhuma área ativa." as const };
  return { user, area };
}

async function audit(
  areaId: string,
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
      target_type: "integration",
      details,
    });
  } catch {
    // auditoria não derruba a operação
  }
}

/* ------------------------------------------------------------- settings */

const SettingsSchema = z.object({
  currency: z.string().trim().length(3, "Use o código de 3 letras (ex.: BRL)."),
  tax_rate: z.coerce.number().min(0).max(100),
  meta_tax_rate: z.coerce.number().min(0).max(99.99),
  revenue_goal: z.coerce.number().min(0),
  allowed_origins: z.string(),
});

export async function saveSettings(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireArea();
  if ("error" in ctx) return { error: ctx.error };

  const parsed = SettingsSchema.safeParse({
    currency: formData.get("currency"),
    tax_rate: formData.get("tax_rate"),
    meta_tax_rate: formData.get("meta_tax_rate"),
    revenue_goal: formData.get("revenue_goal"),
    allowed_origins: formData.get("allowed_origins") ?? "",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  // Uma origem por linha.
  const origins = parsed.data.allowed_origins
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const admin = createAdminClient();
  const { error } = await admin
    .from("settings")
    .update({
      currency: parsed.data.currency.toUpperCase(),
      tax_rate: parsed.data.tax_rate,
      meta_tax_rate: parsed.data.meta_tax_rate,
      revenue_goal: parsed.data.revenue_goal,
      allowed_origins: origins,
    })
    .eq("area_id", ctx.area.id);

  if (error) return { error: `Falha ao salvar: ${error.message}` };

  await audit(ctx.area.id, ctx.user.email, "config.settings", {
    currency: parsed.data.currency,
    tax_rate: parsed.data.tax_rate,
    meta_tax_rate: parsed.data.meta_tax_rate,
    origins: origins.length,
  });

  revalidatePath("/integracoes");
  return { ok: "Preferências salvas." };
}

/* ------------------------------------------------ versão do dashboard */

export async function saveDashboardVersion(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireArea();
  if ("error" in ctx) return { error: ctx.error };

  const version = formData.get("dashboard_version");
  if (version !== "legacy" && version !== "v2") {
    return { error: "Versão inválida." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("settings")
    .update({ dashboard_version: version })
    .eq("area_id", ctx.area.id);

  if (error) return { error: `Falha ao salvar: ${error.message}` };

  await audit(ctx.area.id, ctx.user.email, "config.dashboard", { version });

  revalidatePath("/dashboard");
  revalidatePath("/configuracoes");
  return { ok: version === "v2" ? "Dashboard V2 ativado." : "Dashboard Legacy ativado." };
}

/* ------------------------------------------------- segredos de webhook */

/**
 * Salva (ou remove) o segredo do webhook de UMA plataforma de checkout.
 * Uma linha por (área, plataforma) em `checkout_integrations`, com o valor
 * cifrado. A lista de plataformas válidas vem do registro.
 */
export async function saveCheckoutSecret(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireArea();
  if ("error" in ctx) return { error: ctx.error };

  const plataforma = String(formData.get("plataforma") ?? "");
  const platform = getPlatform(plataforma);
  if (!platform) return { error: "Plataforma inválida." };

  const value = String(formData.get("value") ?? "").trim();
  const admin = createAdminClient();

  // Campo vazio remove o segredo (desconecta a integração).
  if (!value) {
    const { error } = await admin
      .from("checkout_integrations")
      .delete()
      .eq("area_id", ctx.area.id)
      .eq("plataforma", plataforma);

    if (error) return { error: `Falha ao remover: ${error.message}` };

    await audit(ctx.area.id, ctx.user.email, "config.checkout_secret", {
      plataforma,
      removed: true,
    });
    revalidatePath("/integracoes");
    return { ok: `${platform.label} desconectada.` };
  }

  const { error } = await admin.from("checkout_integrations").upsert(
    {
      area_id: ctx.area.id,
      plataforma,
      secret: await encryptSecret(value),
      enabled: true,
    },
    { onConflict: "area_id,plataforma" },
  );

  if (error) return { error: `Falha ao salvar: ${error.message}` };

  await audit(ctx.area.id, ctx.user.email, "config.checkout_secret", {
    plataforma,
    removed: false,
  });

  revalidatePath("/integracoes");
  return { ok: `${platform.label} conectada — segredo cifrado.` };
}

/* --------------------------------------- Meta: descobrir e conectar contas */

/**
 * Etapa 1: cola o token → lista TODAS as contas de anúncio que ele enxerga.
 *
 * O token não volta para o cliente por aqui — quem o mantém é o próprio campo
 * do formulário, que o usuário acabou de digitar. Nada é gravado nesta etapa.
 */
export async function discoverAccounts(
  _prev: DiscoverState,
  formData: FormData,
): Promise<DiscoverState> {
  const ctx = await requireArea();
  if ("error" in ctx) return { error: ctx.error };

  const token = String(formData.get("ads_token") ?? "").trim();
  if (!token) return { error: "Cole o token do System User." };

  const result = await discoverAdAccounts(token);
  if (!result.ok) return { error: result.error };

  return {
    accounts: result.accounts,
    ok: `${result.accounts.length} conta(s) encontrada(s).`,
  };
}

/**
 * Etapa 2: grava as contas marcadas, todas com o mesmo token (cifrado).
 *
 * Revalida o token contra a Meta antes de gravar e confirma que as contas
 * escolhidas realmente estão entre as que ele enxerga — não confiamos no que
 * voltou do formulário.
 */
export async function connectAccounts(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireArea();
  if ("error" in ctx) return { error: ctx.error };

  const token = String(formData.get("ads_token") ?? "").trim();
  const selected = formData.getAll("selected").map(String).filter(Boolean);

  if (!token) return { error: "Token ausente. Busque as contas novamente." };
  if (selected.length === 0) {
    return { error: "Marque ao menos uma conta para conectar." };
  }

  const result = await discoverAdAccounts(token);
  if (!result.ok) return { error: result.error };

  const byId = new Map(result.accounts.map((a) => [a.id, a]));
  const invalid = selected.filter((id) => !byId.has(id));
  if (invalid.length > 0) {
    return {
      error: `Este token não enxerga: ${invalid.join(", ")}. Busque as contas novamente.`,
    };
  }

  const encrypted = await encryptSecret(token);
  const admin = createAdminClient();

  // Uma linha por conta; o mesmo token cifrado se repete em cada uma.
  const rows = selected.map((id) => ({
    area_id: ctx.area.id,
    label: byId.get(id)?.name ?? id,
    ad_account_id: id,
    ads_token: encrypted,
  }));

  // Remove as que já existiam para não duplicar ao reconectar.
  await admin
    .from("meta_ad_accounts")
    .delete()
    .eq("area_id", ctx.area.id)
    .in("ad_account_id", selected);

  const { error } = await admin.from("meta_ad_accounts").insert(rows);
  if (error) return { error: `Falha ao salvar: ${error.message}` };

  await audit(ctx.area.id, ctx.user.email, "config.meta_accounts_connect", {
    accounts: selected,
    count: selected.length,
  });

  revalidatePath("/integracoes");
  return {
    ok: `${selected.length} conta(s) conectada(s) e validada(s).`,
  };
}

/* ------------------------------------------------ contas de anúncio Meta */

const AccountSchema = z.object({
  label: z.string().trim().min(1, "Informe um rótulo."),
  ad_account_id: z
    .string()
    .trim()
    .regex(/^(act_)?\d{5,25}$/, "ID da conta inválido (ex.: act_1234567890)."),
  ads_token: z.string().trim().min(20, "Informe o token de System User."),
});

export async function saveAdAccount(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireArea();
  if ("error" in ctx) return { error: ctx.error };

  const parsed = AccountSchema.safeParse({
    label: formData.get("label"),
    ad_account_id: formData.get("ad_account_id"),
    ads_token: formData.get("ads_token"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  // Valida token e escopos ANTES de salvar.
  const test = await testAdAccountConnection(
    parsed.data.ads_token,
    parsed.data.ad_account_id,
  );
  if (!test.ok) {
    return { error: test.error ?? "Não foi possível validar a conexão." };
  }

  const admin = createAdminClient();
  const id = String(formData.get("id") ?? "");
  const encrypted = await encryptSecret(parsed.data.ads_token);

  const row = {
    area_id: ctx.area.id,
    label: parsed.data.label,
    ad_account_id: parsed.data.ad_account_id,
    ads_token: encrypted,
  };

  const { error } = id
    ? await admin.from("meta_ad_accounts").update(row).eq("id", id)
    : await admin.from("meta_ad_accounts").insert(row);

  if (error) return { error: `Falha ao salvar: ${error.message}` };

  await audit(ctx.area.id, ctx.user.email, "config.meta_account", {
    label: parsed.data.label,
    account: parsed.data.ad_account_id,
    updated: Boolean(id),
  });

  revalidatePath("/integracoes");
  return {
    ok: `Conta “${test.accountName ?? parsed.data.label}” conectada e validada.`,
  };
}

export async function deleteAdAccount(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireArea();
  if ("error" in ctx) return { error: ctx.error };

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Conta não informada." };

  const admin = createAdminClient();
  const { error } = await admin.from("meta_ad_accounts").delete().eq("id", id);
  if (error) return { error: `Falha ao remover: ${error.message}` };

  await audit(ctx.area.id, ctx.user.email, "config.meta_account_delete", { id });

  revalidatePath("/integracoes");
  return { ok: "Conta removida." };
}

/** Testa a conexão sem salvar (botão "Testar conexão"). */
export async function testConnection(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireArea();
  if ("error" in ctx) return { error: ctx.error };

  const token = String(formData.get("ads_token") ?? "").trim();
  const account = String(formData.get("ad_account_id") ?? "").trim();

  if (!token || !account) {
    return { error: "Informe o ID da conta e o token para testar." };
  }

  const test = await testAdAccountConnection(token, account);

  if (!test.ok) return { error: test.error ?? "Falha na conexão." };

  return {
    ok: `OK — ${test.accountName ?? account} (${test.accountCurrency ?? "?"}). Escopos: ${test.scopes?.join(", ")}`,
  };
}
