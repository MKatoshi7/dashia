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
import { cn } from "@/lib/utils";

import {
  setEntityBudget,
  setEntityStatus,
  type MetaWriteState,
} from "./actions";

export type TableRow = {
  id: string;
  name: string;
  level: string;
  status: string;
  effectiveStatus: string;
  budgetAmount: number | null;
  budgetType: "daily" | "lifetime" | null;
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

type SortKey = keyof Pick<
  TableRow,
  | "name"
  | "spend"
  | "sales"
  | "revenue"
  | "profit"
  | "roas"
  | "checkouts"
  | "cpa"
  | "impressions"
  | "cpm"
  | "ctr"
  | "cpc"
  | "landingViews"
  | "clicks"
>;

const COLUMNS: { key: SortKey; label: string; numeric: boolean }[] = [
  { key: "name", label: "Nome", numeric: false },
  { key: "spend", label: "Gasto", numeric: true },
  { key: "sales", label: "Vendas", numeric: true },
  { key: "revenue", label: "Faturamento", numeric: true },
  { key: "profit", label: "Lucro", numeric: true },
  { key: "roas", label: "ROAS", numeric: true },
  { key: "checkouts", label: "Checkouts", numeric: true },
  { key: "cpa", label: "CPA", numeric: true },
  { key: "impressions", label: "Impressões", numeric: true },
  { key: "cpm", label: "CPM", numeric: true },
  { key: "ctr", label: "CTR", numeric: true },
  { key: "cpc", label: "CPC", numeric: true },
  { key: "landingViews", label: "Visitas no site", numeric: true },
  { key: "clicks", label: "Cliques", numeric: true },
];

const PAGE_SIZE = 25;

/** Vermelho para valores negativos (lucro). */
function negative(value: number) {
  return value < 0 ? "text-destructive" : "";
}

export function CampaignsTable({
  rows,
  currency,
  canEdit,
}: {
  rows: TableRow[];
  currency: string;
  canEdit: boolean;
}) {
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
      <div className="overflow-x-auto">
        <table className="w-full min-w-[68rem] text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    "whitespace-nowrap px-3 py-2 micro-label",
                    col.numeric && "text-right",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => toggleSort(col.key)}
                    className={cn(
                      "inline-flex items-center gap-1 hover:text-foreground",
                      col.numeric && "flex-row-reverse",
                    )}
                  >
                    {col.label}
                    {sortKey === col.key ? (
                      asc ? (
                        <ArrowUp className="size-3" />
                      ) : (
                        <ArrowDown className="size-3" />
                      )
                    ) : null}
                  </button>
                </th>
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
                          ? ` · ${formatCurrency(row.budgetAmount, currency)}${row.budgetType === "daily" ? "/dia" : " total"}`
                          : ""}
                      </p>
                    </div>
                  </div>
                </td>
                <Num className="sensitive">{formatCurrency(row.spend, currency)}</Num>
                <Num>{formatNumber(row.sales)}</Num>
                <Num className="sensitive">
                  {formatCurrency(row.revenue, currency)}
                </Num>
                <Num className={cn("sensitive", negative(row.profit))}>
                  {formatCurrency(row.profit, currency)}
                </Num>
                <Num className={negative(row.roas > 0 && row.roas < 1 ? -1 : 0)}>
                  {formatRoas(row.roas)}
                </Num>
                <Num>{formatNumber(row.checkouts)}</Num>
                <Num className="sensitive">{formatCurrency(row.cpa, currency)}</Num>
                <Num>{formatNumber(row.impressions)}</Num>
                <Num className="sensitive">{formatCurrency(row.cpm, currency)}</Num>
                <Num>{formatPercent(row.ctr, 2)}</Num>
                <Num className="sensitive">{formatCurrency(row.cpc, currency)}</Num>
                <Num>{formatNumber(row.landingViews)}</Num>
                <Num>{formatNumber(row.clicks)}</Num>

                {canEdit ? (
                  <td className="px-3 py-2">
                    <RowActions row={row} currency={currency} />
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
              <Num className="sensitive">{formatCurrency(totals.spend, currency)}</Num>
              <Num>{formatNumber(totals.sales)}</Num>
              <Num className="sensitive">
                {formatCurrency(totals.revenue, currency)}
              </Num>
              <Num className={cn("sensitive", negative(totals.profit))}>
                {formatCurrency(totals.profit, currency)}
              </Num>
              <Num>{formatRoas(totals.roas)}</Num>
              <Num>{formatNumber(totals.checkouts)}</Num>
              <Num className="sensitive">{formatCurrency(totals.cpa, currency)}</Num>
              <Num>{formatNumber(totals.impressions)}</Num>
              <Num className="sensitive">{formatCurrency(totals.cpm, currency)}</Num>
              <Num>{formatPercent(totals.ctr, 2)}</Num>
              <Num className="sensitive">{formatCurrency(totals.cpc, currency)}</Num>
              <Num>{formatNumber(totals.landingViews)}</Num>
              <Num>{formatNumber(totals.clicks)}</Num>
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

function RowActions({ row, currency }: { row: TableRow; currency: string }) {
  const isActive = row.status.toUpperCase() === "ACTIVE";

  return (
    <div className="flex justify-end gap-1">
      <StatusDialog row={row} isActive={isActive} />
      <BudgetDialog row={row} currency={currency} />
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
function BudgetDialog({ row, currency }: { row: TableRow; currency: string }) {
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
                Novo orçamento ({currency})
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
