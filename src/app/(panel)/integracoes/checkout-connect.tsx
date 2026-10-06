"use client";

import { AlertTriangle, Check, Loader2, ShieldCheck } from "lucide-react";
import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { CHECKOUT_PLATFORMS } from "@/lib/checkout/platforms";
import { cn } from "@/lib/utils";

import { saveCheckoutSecret, type FormState } from "./actions";
import { CopyBox } from "./integration-forms";

/**
 * Seleção de plataforma de checkout → instruções de conexão daquela
 * plataforma → URL do webhook → campo do segredo.
 *
 * Tudo que aparece aqui (rótulos, passos, ressalvas, nome do campo de segredo)
 * vem do registro em `src/lib/checkout/platforms.ts`. Esta tela não sabe nada
 * sobre plataforma nenhuma.
 */
export function CheckoutConnect({
  baseUrl,
  publicToken,
  configured,
}: {
  baseUrl: string;
  publicToken: string;
  /** ids das plataformas que já têm segredo salvo. */
  configured: string[];
}) {
  const connected = new Set(configured);

  // Abre já na primeira conectada, se houver.
  const [selectedId, setSelectedId] = useState<string>(
    () => configured[0] ?? "",
  );

  const platform = CHECKOUT_PLATFORMS.find((p) => p.id === selectedId) ?? null;

  const [state, action, pending] = useActionState<FormState, FormData>(
    saveCheckoutSecret,
    {},
  );

  return (
    <div className="space-y-5 p-5">
      {/* Grade de plataformas */}
      <div>
        <p className="micro-label mb-2">Escolha a plataforma</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {CHECKOUT_PLATFORMS.map((item) => {
            const isConnected = connected.has(item.id);
            const isSelected = item.id === selectedId;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedId(isSelected ? "" : item.id)}
                aria-pressed={isSelected}
                className={cn(
                  "list-tile flex items-center justify-between gap-2 p-3 text-left",
                  isSelected &&
                    "border-[hsl(var(--primary)/0.35)] bg-[hsl(var(--primary)/0.08)]",
                )}
              >
                <span
                  className={cn(
                    "truncate text-sm tracking-tight",
                    isSelected
                      ? "font-medium text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {item.label}
                </span>
                {isConnected ? (
                  <Check className="size-3.5 shrink-0 text-primary" />
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {/* Detalhe da plataforma escolhida */}
      {platform ? (
        <div className="space-y-4 rounded-xl border border-border bg-[hsl(var(--foreground)/0.02)] p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold tracking-tight">
              Conectar {platform.label}
            </h3>
            {connected.has(platform.id) ? (
              <span className="micro-label inline-flex items-center gap-1 rounded bg-[hsl(var(--primary)/0.15)] px-2 py-0.5 font-medium text-primary">
                <Check className="size-3" /> Configurada e Conectada
              </span>
            ) : platform.confirmed ? (
              <span className="micro-label inline-flex items-center gap-1 text-primary">
                <ShieldCheck className="size-3" /> payload confirmado
              </span>
            ) : (
              <span className="micro-label inline-flex items-center gap-1 text-amber">
                <AlertTriangle className="size-3" /> não confirmado
              </span>
            )}
          </div>

          {/* URL do webhook desta plataforma */}
          <CopyBox
            label={`URL do webhook — ${platform.label}`}
            value={`${baseUrl}/api/webhook/${platform.id}?a=${publicToken}`}
          />

          {/* Passo a passo */}
          <div>
            <p className="micro-label mb-2">Como conectar</p>
            <ol className="ml-4 list-decimal space-y-1 text-xs text-muted-foreground">
              {platform.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>

          {/* Parâmetro de rastreio */}
          <div className="rounded-lg border border-border bg-[hsl(var(--foreground)/0.02)] p-3">
            <p className="micro-label mb-1.5">Rastreio do anúncio</p>
            <p className="text-xs text-muted-foreground">
              Seu código externo precisa enviar{" "}
              <code className="font-mono text-foreground">
                {platform.trackingParam}=&lt;ad_id&gt;
              </code>{" "}
              no link do checkout. O valor tem que ser o{" "}
              <code className="font-mono text-foreground">
                &#123;&#123;ad.id&#125;&#125;
              </code>{" "}
              da Meta — <strong>só dígitos</strong>. Qualquer outra coisa é
              descartada e a venda entra como orgânico.
            </p>
          </div>

          {/* Ressalvas honestas */}
          {platform.caveats?.length ? (
            <div
              className={cn(
                "rounded-lg border p-3",
                platform.confirmed
                  ? "border-border bg-[hsl(var(--foreground)/0.02)]"
                  : "border-[hsl(var(--accent-amber)/0.25)] bg-[hsl(var(--accent-amber)/0.06)]",
              )}
            >
              <p className="micro-label mb-1.5">Antes de confiar nos números</p>
              <ul className="ml-4 list-disc space-y-1 text-xs text-muted-foreground">
                {platform.caveats.map((caveat) => (
                  <li key={caveat}>{caveat}</li>
                ))}
              </ul>
              {!platform.confirmed ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  O payload bruto é <strong>sempre salvo</strong> em{" "}
                  <code className="font-mono">raw_webhook</code>, mesmo quando um
                  campo não é lido. A primeira venda real revela os caminhos
                  certos — nada se perde no caminho.
                </p>
              ) : null}
            </div>
          ) : null}

          {/* Segredo */}
          <form action={action} className="space-y-2">
            <input type="hidden" name="plataforma" value={platform.id} />
            <Label htmlFor={`secret-${platform.id}`}>
              {platform.secretLabel}
            </Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id={`secret-${platform.id}`}
                name="value"
                type="password"
                autoComplete="off"
                placeholder={
                  connected.has(platform.id)
                    ? "•••••••••••••••• (segredo salvo e ativo)"
                    : platform.secretHint
                }
              />
              <Button
                type="submit"
                variant="primary"
                disabled={pending}
                className="shrink-0"
              >
                {pending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Check className="size-4" />
                )}
                Salvar
              </Button>
            </div>
            {connected.has(platform.id) ? (
              <p className="flex items-center gap-1.5 text-xs text-primary">
                <Check className="size-3.5 shrink-0" />
                <span>
                  Segredo salvo com sucesso no banco de dados. Para alterar, digite um novo valor e clique em Salvar. Deixe em branco e salve para desconectar.
                </span>
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Cifrado antes de ir para o banco. Deixe em branco e salve para
                desconectar.
              </p>
            )}
            {state.error ? (
              <p role="alert" className="text-xs text-destructive">
                {state.error}
              </p>
            ) : null}
            {state.ok ? <p className="text-xs text-primary">{state.ok}</p> : null}
          </form>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Selecione a plataforma que você usa para ver as instruções de conexão.
        </p>
      )}
    </div>
  );
}
