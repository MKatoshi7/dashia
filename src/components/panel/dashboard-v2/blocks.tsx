import { Info } from "lucide-react";
import type * as React from "react";

import { Card } from "@/components/ui/card";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import type { BreakdownRow } from "@/lib/meta/dashboard";
import { cn } from "@/lib/utils";

/**
 * Blocos de SERVIDOR do Dashboard V2 (sem estado, sem hooks). Os gráficos
 * interativos ficam em ./charts.tsx, que é cliente.
 */

/** Título de card com o "i" de explicação no canto (tooltip nativo). */
export function PanelTitle({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 pt-4">
      <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
      <div className="flex items-center gap-2">
        {children}
        {hint ? (
          <span title={hint} className="text-muted-foreground">
            <Info className="size-4" />
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** KPI compacto: rótulo em cima, valor embaixo. `tone` pinta os dois. */
export function StatTile({
  label,
  value,
  hint,
  tone = "default",
  sensitive = true,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "negative" | "positive";
  sensitive?: boolean;
}) {
  const color =
    tone === "negative"
      ? "text-destructive"
      : tone === "positive"
        ? "text-emerald"
        : "text-foreground";

  return (
    <Card className="flex min-h-24 flex-col justify-between p-4">
      <div className="flex items-start justify-between gap-2">
        <span className={cn("text-xs font-medium", tone === "negative" ? color : "text-muted-foreground")}>
          {label}
        </span>
        {hint ? (
          <span title={hint} className={cn("shrink-0", tone === "negative" ? color : "text-muted-foreground")}>
            <Info className="size-3.5" />
          </span>
        ) : null}
      </div>
      <span className={cn("stat-value text-2xl", color, sensitive && "sensitive")}>
        {value}
      </span>
    </Card>
  );
}

/**
 * Anel de progresso em SVG (0–100). Vazio quando não há dado.
 * Cores via `style` (CSS resolve var()); como ATRIBUTO o Safari pinta preto.
 */
function Ring({ value }: { value: number | null }) {
  const radius = 9;
  const circumference = 2 * Math.PI * radius;
  const filled = value === null ? 0 : (Math.min(Math.max(value, 0), 100) / 100) * circumference;

  return (
    <svg viewBox="0 0 24 24" className="size-6 -rotate-90" aria-hidden="true">
      <circle cx="12" cy="12" r={radius} fill="none" style={{ stroke: "hsl(var(--muted))" }} strokeWidth="3" />
      <circle
        cx="12"
        cy="12"
        r={radius}
        fill="none"
        style={{ stroke: "hsl(var(--primary))" }}
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={`${filled} ${circumference}`}
      />
    </svg>
  );
}

export function ApprovalRate({
  rows,
}: {
  rows: { label: string; rate: number | null }[];
}) {
  return (
    <Card className="h-full pb-4">
      <PanelTitle
        title="Taxa de Aprovação"
        hint="Vendas aprovadas ÷ vendas iniciadas no checkout, por método de pagamento. Vem do webhook do checkout — N/A enquanto ele não enviar vendas."
      />
      <ul className="mt-3 space-y-2.5 px-5">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">{row.label}</span>
            <span className="flex items-center gap-2.5">
              <Ring value={row.rate} />
              <span className="w-12 text-right font-mono text-xs tabular">
                {row.rate === null ? "N/A" : formatPercent(row.rate, 0)}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/**
 * Funil em forma de "fita" que afunila (SVG). Cada etapa ocupa uma coluna; a
 * altura é proporcional à primeira etapa, e o percentual também é sobre ela.
 */
export function ConversionFunnel({
  steps,
}: {
  steps: { label: string; value: number }[];
}) {
  const width = 1000;
  const height = 180;
  const column = width / steps.length;
  const base = steps[0]?.value ?? 0;

  // Meia-altura de cada etapa; piso de 1 para a fita nunca sumir.
  const half = steps.map((step) =>
    base > 0 ? Math.max((step.value / base) * (height / 2 - 4), 1) : 1,
  );
  const mid = height / 2;

  let top = `M 0 ${mid - half[0]}`;
  let bottom = `L ${width} ${mid + half[half.length - 1]}`;
  for (let i = 0; i < steps.length; i++) {
    const x0 = i * column;
    const plateau = x0 + column * 0.35;
    top += ` L ${plateau} ${mid - half[i]}`;
    if (i < steps.length - 1) {
      const x1 = (i + 1) * column;
      const c = (plateau + x1) / 2;
      top += ` C ${c} ${mid - half[i]}, ${c} ${mid - half[i + 1]}, ${x1} ${mid - half[i + 1]}`;
    } else {
      top += ` L ${width} ${mid - half[i]}`;
    }
  }
  for (let i = steps.length - 1; i >= 0; i--) {
    const x0 = i * column;
    const plateau = x0 + column * 0.35;
    if (i < steps.length - 1) {
      const x1 = (i + 1) * column;
      const c = (plateau + x1) / 2;
      bottom += ` L ${x1} ${mid + half[i + 1]} C ${c} ${mid + half[i + 1]}, ${c} ${mid + half[i]}, ${plateau} ${mid + half[i]}`;
    }
    bottom += ` L ${x0} ${mid + half[i]}`;
  }

  return (
    <div className="px-5 pb-4 pt-3">
      <div
        className="grid text-center text-xs font-semibold"
        style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
      >
        {steps.map((step) => (
          <span key={step.label} className="truncate px-1">
            {step.label}
          </span>
        ))}
      </div>

      <div className="relative mt-2 h-44">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="funnelFill" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" style={{ stopColor: "hsl(var(--primary))" }} />
              <stop offset="100%" style={{ stopColor: "hsl(var(--accent-purple))" }} />
            </linearGradient>
          </defs>
          <path d={`${top} ${bottom} Z`} fill="url(#funnelFill)" />
          {steps.slice(1).map((step, i) => (
            <line
              key={step.label}
              x1={(i + 1) * column}
              x2={(i + 1) * column}
              y1={0}
              y2={height}
              style={{ stroke: "hsl(var(--border))" }}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>

        <div
          className="absolute inset-0 grid items-center text-center"
          style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
        >
          {steps.map((step) => (
            <span
              key={step.label}
              className="font-mono text-sm font-semibold tabular text-foreground drop-shadow"
            >
              {base > 0 ? formatPercent((step.value / base) * 100, 1) : "0%"}
            </span>
          ))}
        </div>
      </div>

      <div
        className="mt-2 grid text-center font-mono text-xs tabular text-muted-foreground"
        style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
      >
        {steps.map((step) => (
          <span key={step.label}>{formatNumber(step.value)}</span>
        ))}
      </div>
    </div>
  );
}

/** Lista com barra de participação (vendas por fonte / posicionamento). */
export function BreakdownList({
  rows,
  currency,
  limit = 8,
}: {
  rows: BreakdownRow[];
  currency: string;
  limit?: number;
}) {
  const withSales = rows.filter((r) => r.sales > 0).slice(0, limit);
  const max = Math.max(...withSales.map((r) => r.sales), 0);

  if (withSales.length === 0) {
    return (
      <p className="px-5 pb-5 pt-3 text-xs text-muted-foreground">
        Nenhuma venda por aqui
      </p>
    );
  }

  return (
    <ul className="space-y-3 px-5 pb-5 pt-3">
      {withSales.map((row) => (
        <li key={row.key}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate">{row.label}</span>
            <span className="shrink-0 font-mono text-xs tabular">
              {formatNumber(row.sales)}
              <span className="sensitive ml-2 text-muted-foreground">
                {formatCurrency(row.revenue, currency)}
              </span>
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="fill-neon h-full rounded-full"
              style={{ width: `${max > 0 ? Math.max((row.sales / max) * 100, 2) : 0}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
