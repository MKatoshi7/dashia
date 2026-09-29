import { Check, CircleDashed } from "lucide-react";
import type { Metadata } from "next";
import { headers } from "next/headers";

import { Card, CardHeader, CardLabel } from "@/components/ui/card";
import { getActiveArea } from "@/lib/areas";
import { getPlatform } from "@/lib/checkout/platforms";
import { DEFAULT_SETTINGS, getSettings } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

import { CheckoutConnect } from "./checkout-connect";
import { MetaConnect, type AccountRow } from "./meta-connect";

export const metadata: Metadata = { title: "Integrações" };
export const dynamic = "force-dynamic";

/** Base pública da instância (para montar as URLs de webhook). */
async function getBaseUrl(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export default async function IntegracoesPage() {
  const activeArea = await getActiveArea();
  if (!activeArea) {
    return (
      <Card className="p-6">
        <p className="text-sm text-muted-foreground">
          Crie uma área para configurar as integrações.
        </p>
      </Card>
    );
  }

  const supabase = await createClient();
  const baseUrl = await getBaseUrl();

  const [
    { data: accountsData },
    { data: areaRow },
    { data: integrations },
    settings,
  ] = await Promise.all([
      // `*`: currency/fx_rate só existem depois da migration
      // account_currency_funnel — antes dela, simplesmente não vêm.
      supabase
        .from("meta_ad_accounts")
        .select("*")
        .eq("area_id", activeArea.id)
        .order("created_at", { ascending: true }),
      supabase
        .from("areas")
        .select("public_token")
        .eq("id", activeArea.id)
        .maybeSingle(),
      supabase
        .from("checkout_integrations")
        .select("plataforma, secret, enabled")
        .eq("area_id", activeArea.id),
      getSettings(activeArea.id),
    ]);

  const areaCurrency = settings?.currency ?? DEFAULT_SETTINGS.currency;

  const accounts: AccountRow[] = (accountsData ?? []).map((row) => ({
    id: row.id as string,
    label: row.label as string,
    ad_account_id: row.ad_account_id as string,
    // Nunca expomos o ciphertext: só se existe ou não.
    hasToken: Boolean(row.ads_token),
    currency: (row.currency as string | null) ?? null,
    fxRate: row.fx_rate === null || row.fx_rate === undefined ? null : Number(row.fx_rate),
  }));

  const publicToken = (areaRow?.public_token as string) ?? "";

  const configured = (integrations ?? [])
    .filter((row) => row.secret && row.enabled !== false)
    .map((row) => row.plataforma as string);

  const metaOn = accounts.some((a) => a.hasToken);
  const checkoutOn = configured.length > 0;

  const connectedLabels = configured
    .map((id) => getPlatform(id)?.label ?? id)
    .join(", ");

  const status = [
    {
      label: metaOn
        ? `Meta conectada · ${accounts.length} conta(s)`
        : "Conectar conta de anúncios da Meta",
      done: metaOn,
    },
    {
      label: checkoutOn
        ? `Checkout conectado · ${connectedLabels}`
        : "Conectar a plataforma de checkout",
      done: checkoutOn,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="display-title text-3xl text-foreground md:text-4xl">
          Integrações
        </h2>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          Duas conexões e o painel funciona: a{" "}
          <strong className="text-foreground">Meta</strong> traz o gasto dos
          anúncios, o <strong className="text-foreground">checkout</strong> traz
          as vendas. Tudo vale para a área{" "}
          <strong className="text-foreground">{activeArea.nome}</strong>, e os
          segredos são cifrados antes de ir para o banco.
        </p>
      </div>

      {/* Status enxuto — duas linhas, nada mais */}
      <Card className="p-5">
        <ul className="space-y-2.5">
          {status.map((item) => (
            <li key={item.label} className="flex items-center gap-2.5 text-sm">
              {item.done ? (
                <Check className="size-4 shrink-0 text-primary" />
              ) : (
                <CircleDashed className="size-4 shrink-0 text-muted-foreground" />
              )}
              <span className={cn(item.done && "text-muted-foreground")}>
                {item.label}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      {/* 1 — Meta Ads */}
      <Card>
        <CardHeader>
          <CardLabel>Meta Ads</CardLabel>
          <span className="micro-label">leitura de insights</span>
        </CardHeader>
        <MetaConnect accounts={accounts} areaCurrency={areaCurrency} />
      </Card>

      {/* 2 — Checkout */}
      <Card>
        <CardHeader>
          <CardLabel>Checkout</CardLabel>
          <span className="micro-label">webhooks de compra</span>
        </CardHeader>
        <CheckoutConnect
          baseUrl={baseUrl}
          publicToken={publicToken}
          configured={configured}
        />
      </Card>
    </div>
  );
}
