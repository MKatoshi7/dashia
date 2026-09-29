"use client";

import { Check, Copy } from "lucide-react";
import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

import { saveSettings, type FormState } from "./actions";

/**
 * Formulários auxiliares da tela de Integrações.
 *
 * A conexão da Meta vive em `meta-connect.tsx` e a de checkout em
 * `checkout-connect.tsx` — cada uma no seu arquivo.
 */

function Feedback({ state }: { state: FormState }) {
  if (state.error) {
    return (
      <p role="alert" className="text-xs text-destructive">
        {state.error}
      </p>
    );
  }
  if (state.ok) {
    return <p className="text-xs text-primary">{state.ok}</p>;
  }
  return null;
}

/* ------------------------------------------------------------ settings */

export function SettingsForm({
  currency,
  taxRate,
  metaTaxRate,
  revenueGoal,
  allowedOrigins,
}: {
  currency: string;
  taxRate: number;
  metaTaxRate: number;
  revenueGoal: number;
  allowedOrigins: string[];
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    saveSettings,
    {},
  );

  return (
    <form action={formAction} className="space-y-4 p-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Label htmlFor="currency">Moeda</Label>
          <Input
            id="currency"
            name="currency"
            defaultValue={currency}
            maxLength={3}
            required
          />
        </div>
        <div>
          <Label htmlFor="tax_rate">Alíquota de imposto (%)</Label>
          <Input
            id="tax_rate"
            name="tax_rate"
            type="number"
            step="0.01"
            min="0"
            max="100"
            defaultValue={taxRate}
            required
          />
        </div>
        <div>
          <Label htmlFor="meta_tax_rate">Imposto Meta Ads (%)</Label>
          <Input
            id="meta_tax_rate"
            name="meta_tax_rate"
            type="number"
            step="0.01"
            min="0"
            max="99.99"
            defaultValue={metaTaxRate}
            required
          />
        </div>
        <div>
          <Label htmlFor="revenue_goal">Meta de faturamento</Label>
          <Input
            id="revenue_goal"
            name="revenue_goal"
            type="number"
            step="0.01"
            min="0"
            defaultValue={revenueGoal}
            required
          />
        </div>
      </div>

      {/*
        Origens permitidas só valem para a captura própria (snippet). Fica
        recolhido para não poluir a tela de quem — como esta instância — recebe
        as UTMs pelo webhook do checkout.
      */}
      <details className="rounded-xl border border-border">
        <summary className="cursor-pointer px-3 py-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground">
          Origens permitidas (CORS) — só para a captura própria
        </summary>
        <div className="border-t border-border p-3">
          <textarea
            id="allowed_origins"
            name="allowed_origins"
            rows={4}
            defaultValue={allowedOrigins.join("\n")}
            placeholder={"https://sua-lp.com\n*.seudominio.com"}
            className="w-full rounded-xl border border-border bg-[hsl(var(--foreground)/0.02)] p-3 font-mono text-xs focus-visible:border-[hsl(var(--primary)/0.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            Uma por linha. Deixe vazio se você não usa o snippet — a atribuição
            por anúncio não depende disto.
          </p>
        </div>
      </details>

      <div className="flex items-center justify-between gap-3">
        <Feedback state={state} />
        <Button type="submit" variant="primary" size="sm" disabled={pending}>
          {pending ? "Salvando..." : "Salvar preferências"}
        </Button>
      </div>
    </form>
  );
}

/* -------------------------------------------------------------- copiar */

export function CopyBox({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <span className="micro-label">{label}</span>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            navigator.clipboard.writeText(value).then(
              () => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              },
              () => setCopied(false),
            );
          }}
        >
          {copied ? (
            <Check className="size-3.5 text-primary" />
          ) : (
            <Copy className="size-3.5" />
          )}
          {copied ? "Copiado" : "Copiar"}
        </Button>
      </div>
      <pre className="overflow-x-auto rounded-xl border border-border bg-[hsl(var(--foreground)/0.03)] p-3 font-mono text-xs text-muted-foreground">
        {value}
      </pre>
    </div>
  );
}
