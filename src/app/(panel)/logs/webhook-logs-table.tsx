"use client";

import * as Dialog from "@radix-ui/react-dialog";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Clock,
  Code2,
  Copy,
  Eye,
  Info,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { formatCurrency, maskEmail, maskPhone } from "@/lib/format";
import { cn } from "@/lib/utils";

export type WebhookLogRow = {
  id: string;
  created_at: string;
  plataforma: string;
  event: string | null;
  status: "processed" | "ignored" | "test" | "error";
  transaction_id: string | null;
  ad_id: string | null;
  produto: string | null;
  valor: number | null;
  email: string | null;
  telefone: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  payload: unknown;
  error_message: string | null;
};

const STATUS_CONFIG: Record<
  WebhookLogRow["status"],
  { label: string; bg: string; text: string; icon: React.ComponentType<{ className?: string }> }
> = {
  processed: {
    label: "Processado",
    bg: "bg-emerald-500/10 border-emerald-500/20",
    text: "text-emerald-400",
    icon: CheckCircle2,
  },
  ignored: {
    label: "Ignorado",
    bg: "bg-muted/80 border-border",
    text: "text-muted-foreground",
    icon: Info,
  },
  test: {
    label: "Teste",
    bg: "bg-sky-500/10 border-sky-500/20",
    text: "text-sky-400",
    icon: Sparkles,
  },
  error: {
    label: "Erro",
    bg: "bg-destructive/10 border-destructive/20",
    text: "text-destructive",
    icon: AlertCircle,
  },
};

const PLATFORM_LABELS: Record<string, string> = {
  cakto: "Cakto",
  kiwify: "Kiwify",
  hotmart: "Hotmart",
  kirvano: "Kirvano",
  perfectpay: "Perfect Pay",
  ticto: "Ticto",
  greenn: "Greenn",
};

import { reprocessWebhookLogs } from "./actions";

export function WebhookLogsTable({
  rows,
  publicToken,
  baseUrl,
}: {
  rows: WebhookLogRow[];
  publicToken: string;
  baseUrl: string;
}) {
  const router = useRouter();
  const [selectedLog, setSelectedLog] = useState<WebhookLogRow | null>(null);
  const [copiedJson, setCopiedJson] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isReprocessing, setIsReprocessing] = useState(false);
  const [reprocessMsg, setReprocessMsg] = useState<string | null>(null);

  function handleCopyPayload(payload: unknown) {
    void navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  }

  function handleRefresh() {
    setIsRefreshing(true);
    router.refresh();
    setTimeout(() => setIsRefreshing(false), 600);
  }

  async function handleReprocess() {
    setIsReprocessing(true);
    setReprocessMsg(null);
    try {
      const res = await reprocessWebhookLogs();
      if (res.ok) {
        setReprocessMsg(res.message || "Vendas reprocessadas com sucesso!");
        router.refresh();
      } else {
        setReprocessMsg(res.message || "Erro ao reprocessar.");
      }
    } catch {
      setReprocessMsg("Falha ao executar reprocessamento.");
    } finally {
      setIsReprocessing(false);
      setTimeout(() => setReprocessMsg(null), 5000);
    }
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl border border-border bg-[hsl(var(--foreground)/0.03)] text-muted-foreground">
          <Code2 className="size-6 text-primary" />
        </div>
        <h3 className="mt-4 text-base font-semibold">Nenhum evento de webhook recebido ainda</h3>
        <p className="mt-1.5 max-w-md text-xs text-muted-foreground">
          Assim que a plataforma (Cakto, Kiwify, etc.) enviar uma notificação de compra, assinatura ou teste para a sua URL, ela será registrada aqui com detalhes completos em tempo real.
        </p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="gap-2"
          >
            <RefreshCw className={cn("size-3.5", isRefreshing && "animate-spin")} />
            Verificar novamente
          </Button>
          <div className="rounded-lg border border-border bg-[hsl(var(--muted)/0.4)] px-3 py-1.5 font-mono text-[0.7rem] text-muted-foreground">
            URL: {baseUrl}/api/webhook/cakto?a={publicToken}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 bg-muted/20 px-4 py-2.5">
        <div className="flex items-center gap-3">
          <Button
            variant="primary"
            size="sm"
            onClick={handleReprocess}
            disabled={isReprocessing}
            className="h-8 gap-1.5 px-3 text-xs shadow-xs"
          >
            <RefreshCw className={cn("size-3.5", isReprocessing && "animate-spin")} />
            {isReprocessing ? "Reprocessando vendas..." : "Reprocessar e Importar Vendas"}
          </Button>
          {reprocessMsg ? (
            <span className="font-mono text-xs font-semibold text-emerald-400 animate-in fade-in">
              {reprocessMsg}
            </span>
          ) : null}
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className={cn("size-3", isRefreshing && "animate-spin")} />
          Atualizar Lista
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[58rem] text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="px-3.5 py-2.5 micro-label">Data e Hora</th>
              <th className="px-3.5 py-2.5 micro-label">Plataforma</th>
              <th className="px-3.5 py-2.5 micro-label">Evento</th>
              <th className="px-3.5 py-2.5 micro-label">Status</th>
              <th className="px-3.5 py-2.5 micro-label">Transação / Pedido</th>
              <th className="px-3.5 py-2.5 micro-label">Valor</th>
              <th className="px-3.5 py-2.5 micro-label">Cliente</th>
              <th className="px-3.5 py-2.5 micro-label">UTM / Anúncio</th>
              <th className="px-3.5 py-2.5 text-right micro-label">Ação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => {
              const statusCfg = STATUS_CONFIG[row.status] ?? STATUS_CONFIG.processed;
              const StatusIcon = statusCfg.icon;
              const platformLabel = PLATFORM_LABELS[row.plataforma] ?? row.plataforma;

              return (
                <tr
                  key={row.id}
                  onClick={() => setSelectedLog(row)}
                  className="group cursor-pointer transition-colors hover:bg-[hsl(var(--foreground)/0.02)]"
                >
                  <td className="whitespace-nowrap px-3.5 py-3 font-mono text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Clock className="size-3 text-muted-foreground/60" />
                      {new Date(row.created_at).toLocaleString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </span>
                  </td>

                  <td className="whitespace-nowrap px-3.5 py-3">
                    <span className="inline-flex items-center rounded-md border border-border bg-[hsl(var(--muted)/0.5)] px-2 py-0.5 text-xs font-medium text-foreground">
                      {platformLabel}
                    </span>
                  </td>

                  <td className="whitespace-nowrap px-3.5 py-3">
                    <span className="font-mono text-xs font-semibold text-foreground">
                      {row.event || "desconhecido"}
                    </span>
                  </td>

                  <td className="whitespace-nowrap px-3.5 py-3">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.7rem] font-medium",
                        statusCfg.bg,
                        statusCfg.text,
                      )}
                    >
                      <StatusIcon className="size-3" />
                      {statusCfg.label}
                    </span>
                  </td>

                  <td className="max-w-44 truncate px-3.5 py-3 font-mono text-xs text-muted-foreground">
                    {row.transaction_id ? (
                      <span className="truncate" title={row.transaction_id}>
                        {row.transaction_id}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>

                  <td className="whitespace-nowrap px-3.5 py-3 font-mono text-xs font-medium text-foreground">
                    {row.valor !== null && row.valor !== undefined
                      ? formatCurrency(row.valor, "BRL")
                      : "—"}
                  </td>

                  <td className="max-w-40 truncate px-3.5 py-3 text-xs text-muted-foreground">
                    {row.email ? maskEmail(row.email) : "—"}
                  </td>

                  <td className="max-w-48 truncate px-3.5 py-3 text-xs text-muted-foreground">
                    {row.ad_id ? (
                      <span className="inline-flex items-center rounded bg-[hsl(var(--primary)/0.08)] px-1.5 py-0.5 font-mono text-[0.68rem] text-primary">
                        ad:{row.ad_id}
                      </span>
                    ) : row.utm_source ? (
                      <span className="font-mono text-[0.68rem]">
                        src:{row.utm_source}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>

                  <td className="whitespace-nowrap px-3.5 py-3 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedLog(row);
                      }}
                      className="size-8 p-0 text-muted-foreground hover:text-foreground"
                      title="Ver Payload JSON"
                    >
                      <Eye className="size-4" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modal de Detalhes e Payload do Webhook */}
      <Dialog.Root open={Boolean(selectedLog)} onOpenChange={(open) => !open && setSelectedLog(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm animate-in fade-in" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[min(50rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-card p-6 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <Dialog.Title className="text-base font-semibold tracking-tight">
                    Evento de Webhook
                  </Dialog.Title>
                  {selectedLog ? (
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.7rem] font-medium",
                        STATUS_CONFIG[selectedLog.status]?.bg,
                        STATUS_CONFIG[selectedLog.status]?.text,
                      )}
                    >
                      {STATUS_CONFIG[selectedLog.status]?.label}
                    </span>
                  ) : null}
                </div>
                <Dialog.Description className="mt-1 font-mono text-xs text-muted-foreground">
                  {selectedLog?.plataforma?.toUpperCase()} · Evento:{" "}
                  <strong className="text-foreground">{selectedLog?.event}</strong> ·{" "}
                  {selectedLog ? new Date(selectedLog.created_at).toLocaleString("pt-BR") : ""}
                </Dialog.Description>
              </div>

              <Dialog.Close asChild>
                <button
                  type="button"
                  className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              </Dialog.Close>
            </div>

            {selectedLog ? (
              <div className="mt-5 space-y-6">
                {/* Alerta de erro se houver */}
                {selectedLog.error_message ? (
                  <div className="flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                    <AlertCircle className="size-4 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold">Erro no processamento:</p>
                      <p className="mt-0.5 font-mono">{selectedLog.error_message}</p>
                    </div>
                  </div>
                ) : null}

                {/* Dados principais extraídos */}
                <div>
                  <p className="micro-label mb-2.5">Dados Extraídos</p>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <DetailField label="Transação / ID" value={selectedLog.transaction_id ?? "—"} />
                    <DetailField
                      label="Valor"
                      value={
                        selectedLog.valor !== null && selectedLog.valor !== undefined
                          ? formatCurrency(selectedLog.valor, "BRL")
                          : "—"
                      }
                    />
                    <DetailField label="Produto" value={selectedLog.produto ?? "—"} />
                    <DetailField label="E-mail" value={maskEmail(selectedLog.email)} />
                    <DetailField label="Telefone" value={maskPhone(selectedLog.telefone)} />
                    <DetailField label="ad_id (Anúncio)" value={selectedLog.ad_id ?? "—"} />
                  </div>
                </div>

                {/* UTMs e Rastreamento */}
                <div>
                  <p className="micro-label mb-2.5">Rastreamento e UTMs</p>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                    <DetailField label="utm_source" value={selectedLog.utm_source ?? "—"} />
                    <DetailField label="utm_medium" value={selectedLog.utm_medium ?? "—"} />
                    <DetailField label="utm_campaign" value={selectedLog.utm_campaign ?? "—"} />
                    <DetailField label="utm_term" value={selectedLog.utm_term ?? "—"} />
                    <DetailField label="utm_content" value={selectedLog.utm_content ?? "—"} />
                  </div>
                </div>

                {/* Payload JSON bruto */}
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="micro-label">Payload Bruto (JSON)</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCopyPayload(selectedLog.payload)}
                      className="h-7 gap-1.5 px-2 text-xs"
                    >
                      {copiedJson ? (
                        <>
                          <Check className="size-3.5 text-primary" />
                          <span>Copiado!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="size-3.5" />
                          <span>Copiar JSON</span>
                        </>
                      )}
                    </Button>
                  </div>
                  <pre className="max-h-80 overflow-auto rounded-lg border border-border bg-[hsl(var(--muted)/0.4)] p-4 font-mono text-[0.72rem] leading-relaxed text-foreground/90 selection:bg-primary/20">
                    {JSON.stringify(selectedLog.payload, null, 2)}
                  </pre>
                </div>
              </div>
            ) : null}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-[hsl(var(--foreground)/0.02)] p-2.5">
      <p className="text-[0.62rem] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 truncate font-mono text-xs text-foreground" title={value}>
        {value}
      </p>
    </div>
  );
}
