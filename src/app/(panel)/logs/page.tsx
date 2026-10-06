import {
  AlertCircle,
  CheckCircle2,
  Search,
  Sparkles,
  Webhook,
} from "lucide-react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";

import { Card } from "@/components/ui/card";
import { getActiveArea } from "@/lib/areas";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

import { WebhookLogsTable, type WebhookLogRow } from "./webhook-logs-table";

export const metadata: Metadata = { title: "Logs" };
export const dynamic = "force-dynamic";

type SearchParams = {
  tab?: string;
  plataforma?: string;
  status?: string;
  q?: string;
};

async function getBaseUrl(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export default async function LogsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const activeArea = await getActiveArea();

  if (!activeArea) {
    return (
      <Card className="p-6">
        <p className="text-sm text-muted-foreground">
          Crie uma área para visualizar os logs de webhooks.
        </p>
      </Card>
    );
  }

  const supabase = await createClient();
  const baseUrl = await getBaseUrl();

  const { data: areaRow } = await supabase
    .from("areas")
    .select("public_token")
    .eq("id", activeArea.id)
    .maybeSingle();

  const publicToken = (areaRow?.public_token as string) ?? "";

  // Busca logs de webhook
  let query = supabase
    .from("webhook_logs")
    .select(
      "id, created_at, plataforma, event, status, transaction_id, ad_id, produto, valor, email, telefone, utm_source, utm_medium, utm_campaign, utm_term, utm_content, payload, error_message",
    )
    .eq("area_id", activeArea.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (params.plataforma) {
    query = query.eq("plataforma", params.plataforma);
  }
  if (params.status) {
    query = query.eq("status", params.status);
  }
  if (params.q) {
    query = query.or(
      `transaction_id.ilike.%${params.q}%,event.ilike.%${params.q}%,produto.ilike.%${params.q}%,email.ilike.%${params.q}%`,
    );
  }

  // Estatísticas agregadas
  const [logsResult, totalCount, processedCount, testCount, errorCount] =
    await Promise.all([
      query,
      supabase
        .from("webhook_logs")
        .select("id", { count: "exact", head: true })
        .eq("area_id", activeArea.id),
      supabase
        .from("webhook_logs")
        .select("id", { count: "exact", head: true })
        .eq("area_id", activeArea.id)
        .eq("status", "processed"),
      supabase
        .from("webhook_logs")
        .select("id", { count: "exact", head: true })
        .eq("area_id", activeArea.id)
        .eq("status", "test"),
      supabase
        .from("webhook_logs")
        .select("id", { count: "exact", head: true })
        .eq("area_id", activeArea.id)
        .eq("status", "error"),
    ]);

  const rows = (logsResult.data ?? []) as WebhookLogRow[];

  const total = totalCount.count ?? 0;
  const processed = processedCount.count ?? 0;
  const test = testCount.count ?? 0;
  const error = errorCount.count ?? 0;

  function buildHref(patch: Record<string, string | undefined>) {
    const search = new URLSearchParams();
    const current = { ...params, ...patch };
    for (const [k, v] of Object.entries(current)) {
      if (v) search.set(k, v);
    }
    const q = search.toString();
    return q ? `/logs?${q}` : "/logs";
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h2 className="display-title text-3xl text-foreground md:text-4xl">
            Logs do Sistema
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Acompanhe em tempo real todos os webhooks recebidos das plataformas de checkout (Cakto, etc.), eventos de compras e assinaturas.
          </p>
        </div>
      </div>

      {/* Cards de Métricas de Webhook */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <span className="micro-label">Total Recebido</span>
            <Webhook className="size-4 text-muted-foreground/60" />
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight">{total}</p>
          <p className="mt-0.5 text-[0.7rem] text-muted-foreground">Eventos capturados</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <span className="micro-label">Processados</span>
            <CheckCircle2 className="size-4 text-emerald-400" />
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-emerald-400">{processed}</p>
          <p className="mt-0.5 text-[0.7rem] text-muted-foreground">Vendas e assinaturas</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <span className="micro-label">Testes</span>
            <Sparkles className="size-4 text-sky-400" />
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-sky-400">{test}</p>
          <p className="mt-0.5 text-[0.7rem] text-muted-foreground">Eventos de teste</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <span className="micro-label">Erros</span>
            <AlertCircle className="size-4 text-destructive" />
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-destructive">{error}</p>
          <p className="mt-0.5 text-[0.7rem] text-muted-foreground">Falha ou assinatura</p>
        </div>
      </div>

      {/* Barra de Filtros */}
      <Card className="p-4">
        <form action="/logs" className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-56">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              name="q"
              defaultValue={params.q ?? ""}
              placeholder="Buscar por ID de transação, evento, produto..."
              className="h-9 w-full rounded-lg border border-border bg-[hsl(var(--muted)/0.3)] pl-9 pr-3 text-xs placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none"
            />
          </div>

          {/* Filtro Plataforma */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Plataforma:</span>
            <div className="flex gap-1 rounded-lg border border-border bg-[hsl(var(--muted)/0.4)] p-0.5">
              {[
                { id: "", label: "Todas" },
                { id: "cakto", label: "Cakto" },
                { id: "kiwify", label: "Kiwify" },
                { id: "hotmart", label: "Hotmart" },
              ].map((p) => (
                <Link
                  key={p.id}
                  href={buildHref({ plataforma: p.id || undefined })}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs transition-colors",
                    (params.plataforma ?? "") === p.id
                      ? "bg-[hsl(var(--primary)/0.15)] font-medium text-primary"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {p.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Filtro Status */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Status:</span>
            <div className="flex gap-1 rounded-lg border border-border bg-[hsl(var(--muted)/0.4)] p-0.5">
              {[
                { id: "", label: "Todos" },
                { id: "processed", label: "Processados" },
                { id: "test", label: "Testes" },
                { id: "ignored", label: "Ignorados" },
              ].map((s) => (
                <Link
                  key={s.id}
                  href={buildHref({ status: s.id || undefined })}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs transition-colors",
                    (params.status ?? "") === s.id
                      ? "bg-[hsl(var(--primary)/0.15)] font-medium text-primary"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {s.label}
                </Link>
              ))}
            </div>
          </div>
        </form>
      </Card>

      {/* Tabela de Logs de Webhook */}
      <Card>
        <div className="flex items-center justify-between border-b border-border p-4">
          <div className="flex items-center gap-2">
            <Webhook className="size-4 text-primary" />
            <h3 className="text-sm font-semibold tracking-tight">Logs de Webhook</h3>
          </div>
          <span className="micro-label">Últimos {rows.length} eventos</span>
        </div>
        <WebhookLogsTable rows={rows} publicToken={publicToken} baseUrl={baseUrl} />
      </Card>
    </div>
  );
}
