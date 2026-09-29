"use client";

import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowDown,
  ArrowUp,
  Pause,
  Pencil,
  Play,
  TriangleAlert,
} from "lucide-react";
import { useActionState, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import {
  formatCurrency,
  formatNumber,
  formatPercent,
  formatRoas,
} from "@/lib/format";
import {
  CAMPAIGN_COLUMNS,
  type CampaignColumn,
} from "@/lib/campaign-columns";
import { cn } from "@/lib/utils";

import {
  setEntityBudget,
  setEntityStatus,
  type MetaWriteState,
} from "./actions";
import { ColumnEditor } from "./column-editor";

export type TableRow = {
  id: string;
  name: string;
  level: string;
  status: string;
  effectiveStatus: string;
  budgetAmount: number | null;
  budgetType: "daily" | "lifetime" | null;
  /** Moeda da conta — o orçamento não é convertido (volta para a Meta). */
  budgetCurrency: string;
  accountId: string;
  accountLabel: string;
  spend: number;
  impressions: number;
  clicks: number;
  landingViews: number;
  sales: number;
  revenue: number;
  checkouts: number;
  profit: number;
  roas: number;
  cpa: number;
  cpm: number;
  ctr: number;
  cpc: number;
};

type SortKey = "name" | CampaignColumn;

/**
 * Formatação de cada métrica — a MESMA para a linha e para o total, então a
 * ordem das colunas (configurável) nunca desalinha corpo e rodapé.
 */
const COLUMN_FORMAT: Record<
  CampaignColumn,
  {
    format: (value: number, currency: string) => string;
    sensitive?: boolean;
    tone?: (value: number) => string;
  }
> = {
  spend: { format: formatCurrency, sensitive: true },
  sales: { format: (v) => formatNumber(v) },
  revenue: { format: formatCurrency, sensitive: true },
  profit: { format: formatCurrency, sensitive: true, tone: profitTone },
  roas: { format: (v) => formatRoas(v), tone: roasTone },
  checkouts: { format: (v) => formatNumber(v) },
  cpa: { format: formatCurrency, sensitive: true },
  impressions: { format: (v) => formatNumber(v) },
  cpm: { format: formatCurrency, sensitive: true },
  ctr: { format: (v) => formatPercent(v, 2) },
  cpc: { format: formatCurrency, sensitive: true },
  landingViews: { format: (v) => formatNumber(v) },
  clicks: { format: (v) => formatNumber(v) },
};

const PAGE_SIZE = 25;

/** Lucro: vermelho quando negativo, verde quando positivo. */
function profitTone(value: number) {
  if (value < 0) return "text-destructive";
  if (value > 0) return "text-emerald";
  return "";
}

/** ROAS: verde a partir de 1 (pagou o gasto), vermelho entre 0 e 1. */
function roasTone(value: number) {
  if (value >= 1) return "text-emerald";
  if (value > 0) return "text-destructive";
  return "";
}

export function CampaignsTable({
  rows,
  currency,
  canEdit,
  columnOrder,
}: {
  rows: TableRow[];
  currency: string;
  canEdit: boolean;
  /** Ordem das métricas salva para a área (já normalizada). */
  columnOrder: CampaignColumn[];
}) {
  // Local: ao salvar no editor a tabela já muda, sem esperar o servidor.
  const [order, setOrder] = useState<CampaignColumn[]>(columnOrder);
  const [sortKey, setSortKey] = useState<SortKey>("spend");
  const [asc, setAsc] = useState(false);
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const x = a[sortKey];
      const y = b[sortKey];
      if (typeof x === "string" || typeof y === "string") {
        return asc
          ? String(x).localeCompare(String(y), "pt-BR")
          : String(y).localeCompare(String(x), "pt-BR");
      }
      return asc ? Number(x) - Number(y) : Number(y) - Number(x);
    });
    return copy;
  }, [rows, sortKey, asc]);

  const totals = useMemo(() => {
    const t = rows.reduce(
      (acc, r) => ({
        spend: acc.spend + r.spend,
        sales: acc.sales + r.sales,
        revenue: acc.revenue + r.revenue,
        profit: acc.profit + r.profit,
        checkouts: acc.checkouts + r.checkouts,
        impressions: acc.impressions + r.impressions,
        clicks: acc.clicks + r.clicks,
        landingViews: acc.landingViews + r.landingViews,
      }),
      {
        spend: 0,
        sales: 0,
        revenue: 0,
        profit: 0,
        checkouts: 0,
        impressions: 0,
        clicks: 0,
        landingViews: 0,
      },
    );
    return {
      ...t,
      roas: t.spend > 0 ? t.revenue / t.spend : 0,
      cpa: t.sales > 0 ? t.spend / t.sales : 0,
      cpm: t.impressions > 0 ? (t.spend / t.impressions) * 1000 : 0,
      ctr: t.impressions > 0 ? (t.clicks / t.impressions) * 100 : 0,
      cpc: t.clicks > 0 ? t.spend / t.clicks : 0,
    };
  }, [rows]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const visible = sorted.slice(
    current * PAGE_SIZE,
    current * PAGE_SIZE + PAGE_SIZE,
  );

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setAsc((prev) => !prev);
    } else {
      setSortKey(key);
      setAsc(false);
    }
    setPage(0);
  }

  if (rows.length === 0) {
    return (
      <p className="p-6 text-center text-sm text-muted-foreground">
        Nenhuma linha para os filtros selecionados.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <ColumnEditor order={order} onSaved={setOrder} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[68rem] text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <SortHeader
                label="Nome"
                active={sortKey === "name"}
                asc={asc}
                onClick={() => toggleSort("name")}
              />
              {order.map((key) => (
                <SortHeader
                  key={key}
                  label={CAMPAIGN_COLUMNS[key]}
                  numeric
                  active={sortKey === key}
                  asc={asc}
                  onClick={() => toggleSort(key)}
                />
              ))}
              {canEdit ? (
                <th className="px-3 py-2 text-right micro-label">
                  Ações
                </th>
              ) : null}
            </tr>
          </thead>

          <tbody className="divide-y divide-border">
            {visible.map((row) => (
              <tr key={row.id} className="hover:bg-muted/40">
                <td className="max-w-72 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <StatusDot status={row.effectiveStatus || row.status} />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{row.name}</p>
                      <p className="truncate font-mono text-[0.65rem] text-muted-foreground">
                        {row.accountLabel}
                        {row.budgetAmount !== null
                          ? ` · ${formatCurrency(row.budgetAmount, row.budgetCurrency)}${row.budgetType === "daily" ? "/dia" : " total"}`
                          : ""}
                      </p>
                    </div>
                  </div>
                </td>
                {order.map((key) => (
                  <MetricCell key={key} column={key} value={row[key]} currency={currency} />
                ))}

                {canEdit ? (
                  <td className="px-3 py-2">
                    <RowActions row={row} />
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>

          <tfoot>
            <tr className="border-t-2 border-border font-semibold">
              <td className="px-3 py-2 text-[0.7rem] uppercase tracking-wider text-muted-foreground">
                Total ({formatNumber(rows.length)})
              </td>
              {order.map((key) => (
                <MetricCell key={key} column={key} value={totals[key]} currency={currency} />
              ))}
              {canEdit ? <td /> : null}
            </tr>
          </tfoot>
        </table>
      </div>

      {pageCount > 1 ? (
        <div className="flex items-center justify-between gap-3 px-3 pb-3 text-xs text-muted-foreground">
          <span>
            Página {current + 1} de {pageCount}
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={current === 0}
              onClick={() => setPage(current - 1)}
            >
              Anterior
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={current >= pageCount - 1}
              onClick={() => setPage(current + 1)}
            >
              Próxima
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MetricCell({
  column,
  value,
  currency,
}: {
  column: CampaignColumn;
  value: number;
  currency: string;
}) {
  const f = COLUMN_FORMAT[column];
  return (
    <Num className={cn(f.sensitive && "sensitive", f.tone?.(value))}>
      {f.format(value, currency)}
    </Num>
  );
}

function SortHeader({
  label,
  numeric = false,
  active,
  asc,
  onClick,
}: {
  label: string;
  numeric?: boolean;
  active: boolean;
  asc: boolean;
  onClick: () => void;
}) {
  return (
    <th
      className={cn(
        "whitespace-nowrap px-3 py-2 micro-label",
        numeric && "text-right",
      )}
    >
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "inline-flex items-center gap-1 hover:text-foreground",
          numeric && "flex-row-reverse",
        )}
      >
        {label}
        {active ? (
          asc ? (
            <ArrowUp className="size-3" />
          ) : (
            <ArrowDown className="size-3" />
          )
        ) : null}
      </button>
    </th>
  );
}

function Num({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <td
      className={cn(
        "whitespace-nowrap px-3 py-2 text-right font-mono text-xs tabular",
        className,
      )}
    >
      {children}
    </td>
  );
}

function StatusDot({ status }: { status: string }) {
  const active = status.toUpperCase() === "ACTIVE";
  return (
    <span
      title={status}
      className={cn(
        "size-2 shrink-0 rounded-full",
        active ? "bg-primary" : "bg-muted-foreground/50",
      )}
    />
  );
}

/* --------------------------------------------------------- edição inline */

function RowActions({ row }: { row: TableRow }) {
  const isActive = row.status.toUpperCase() === "ACTIVE";

  return (
    <div className="flex justify-end gap-1">
      <StatusDialog row={row} isActive={isActive} />
      <BudgetDialog row={row} />
    </div>
  );
}

/** Ativar/pausar — SEMPRE com confirmação antes de escrever na Meta. */
function StatusDialog({ row, isActive }: { row: TableRow; isActive: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<MetaWriteState, FormData>(
    setEntityStatus,
    {},
  );

  const next = isActive ? "PAUSED" : "ACTIVE";

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button
          size="icon"
          variant="ghost"
          title={isActive ? "Pausar" : "Ativar"}
        >
          {isActive ? (
            <Pause className="size-3.5" />
          ) : (
            <Play className="size-3.5" />
          )}
        </Button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-card p-5 shadow-2xl">
          <Dialog.Title className="flex items-center gap-2 text-base font-semibold">
            <TriangleAlert className="size-4 text-amber" />
            {isActive ? "Pausar" : "Ativar"} na Meta?
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-muted-foreground">
            Esta ação altera <strong>de verdade</strong> o status de “{row.name}”
            na sua conta de anúncios ({row.accountLabel}) e fica registrada no
            log de auditoria.
          </Dialog.Description>

          {state.error ? (
            <p className="mt-3 text-xs text-destructive">{state.error}</p>
          ) : null}

          <form
            action={(fd) => {
              formAction(fd);
              setOpen(false);
            }}
            className="mt-5 flex justify-end gap-2"
          >
            <input type="hidden" name="accountId" value={row.accountId} />
            <input type="hidden" name="entityId" value={row.id} />
            <input type="hidden" name="level" value={row.level} />
            <input type="hidden" name="status" value={next} />
            <Dialog.Close asChild>
              <Button type="button" variant="ghost" size="sm">
                Cancelar
              </Button>
            </Dialog.Close>
            <Button
              type="submit"
              variant={isActive ? "destructive" : "primary"}
              size="sm"
              disabled={pending}
            >
              {pending ? "Enviando..." : isActive ? "Pausar" : "Ativar"}
            </Button>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Edição de orçamento — também com confirmação explícita. */
/** O orçamento fica na moeda da CONTA: é o valor que vai para a Meta. */
function BudgetDialog({ row }: { row: TableRow }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<MetaWriteState, FormData>(
    setEntityBudget,
    {},
  );

  const disabled = row.budgetType === null;

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button
          size="icon"
          variant="ghost"
          disabled={disabled}
          title={
            disabled
              ? "Sem orçamento próprio neste nível"
              : "Editar orçamento"
          }
        >
          <Pencil className="size-3.5" />
        </Button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-card p-5 shadow-2xl">
          <Dialog.Title className="text-base font-semibold">
            Editar orçamento
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-muted-foreground">
            “{row.name}” · orçamento{" "}
            {row.budgetType === "daily" ? "diário" : "total"}. A alteração é
            aplicada na Meta e registrada no log de auditoria.
          </Dialog.Description>

          <form
            action={(fd) => {
              formAction(fd);
              setOpen(false);
            }}
            className="mt-4 space-y-4"
          >
            <input type="hidden" name="accountId" value={row.accountId} />
            <input type="hidden" name="entityId" value={row.id} />
            <input type="hidden" name="level" value={row.level} />
            <input
              type="hidden"
              name="budgetType"
              value={row.budgetType ?? "daily"}
            />

            <div>
              <Label htmlFor={`budget-${row.id}`}>
                Novo orçamento ({row.budgetCurrency})
              </Label>
              <Input
                id={`budget-${row.id}`}
                name="amount"
                type="number"
                step="0.01"
                min="1"
                required
                defaultValue={row.budgetAmount ?? undefined}
              />
            </div>

            {state.error ? (
              <p className="text-xs text-destructive">{state.error}</p>
            ) : null}

            <div className="flex justify-end gap-2">
              <Dialog.Close asChild>
                <Button type="button" variant="ghost" size="sm">
                  Cancelar
                </Button>
              </Dialog.Close>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={pending}
              >
                {pending ? "Salvando..." : "Confirmar alteração"}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
