"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatCurrency, formatNumber } from "@/lib/format";

import { useThemeColors } from "../use-theme-colors";

/**
 * Gráficos do Dashboard V2. Cores do tema RESOLVIDAS (useThemeColors) — nunca
 * `hsl(var(--x))` em atributo SVG, que o Safari do iPhone pinta de preto (era
 * o destaque preto ao tocar numa hora do gráfico de horário).
 */
function useChartTheme() {
  const color = useThemeColors();

  return {
    color,
    tooltip: {
      cursor: { fill: color("foreground", 0.06), stroke: color("foreground", 0.15) },
      contentStyle: {
        background: color("card"),
        border: `1px solid ${color("border")}`,
        borderRadius: "0.75rem",
        fontSize: "0.78rem",
        boxShadow: "0 20px 40px -12px rgb(0 0 0 / 0.6)",
      },
      labelStyle: { color: color("muted-foreground") },
      itemStyle: { color: color("foreground") },
    },
    axis: {
      tickLine: false,
      axisLine: false,
      tick: { fontSize: 11, fill: color("muted-foreground") },
    },
    grid: color("muted-foreground", 0.15),
  } as const;
}

function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

/* ------------------------------------------------------------ pagamento */

const PAYMENT_SLICES = [
  { key: "pix", label: "Pix", token: "primary" },
  { key: "cartao", label: "Cartão", token: "accent-cyan" },
  { key: "boleto", label: "Boleto", token: "accent-amber" },
  { key: "outros", label: "Outros", token: "destructive" },
] as const;

export function PaymentDonut({
  counts,
}: {
  counts: Record<(typeof PAYMENT_SLICES)[number]["key"], number>;
}) {
  const { color, tooltip } = useChartTheme();
  const total = PAYMENT_SLICES.reduce((sum, s) => sum + counts[s.key], 0);
  const data = PAYMENT_SLICES.map((s) => ({
    label: s.label,
    value: counts[s.key],
    color: color(s.token),
  }));
  const slices = total > 0 ? data : [{ label: "vazio", value: 1, color: color("muted") }];

  return (
    <div className="flex h-72 flex-col px-5 pb-4">
      <div className="relative flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="label"
              innerRadius="62%"
              outerRadius="82%"
              stroke="none"
              isAnimationActive={false}
            >
              {slices.map((slice) => (
                <Cell key={slice.label} fill={slice.color} />
              ))}
            </Pie>
            {total > 0 ? (
              <Tooltip
                {...tooltip}
                formatter={(value, name) => [formatNumber(Number(value) || 0), String(name ?? "")]}
              />
            ) : null}
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-sm text-muted-foreground">Total</span>
          <span className="stat-value text-xl">{formatNumber(total)}</span>
        </div>
      </div>
      <div className="flex flex-wrap justify-center gap-4 text-xs text-muted-foreground">
        {data.map((s) => (
          <span key={s.label} className="flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/* --------------------------------------------------- vendas por período */

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
/** Semana começando na segunda, como no Gerenciador. */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function WeekdayChart({ sales }: { sales: number[] }) {
  const data = WEEK_ORDER.map((d) => ({ label: WEEKDAYS[d], sales: sales[d] ?? 0 }));
  return <SalesBars data={data} />;
}

export function HourChart({ sales }: { sales: number[] }) {
  const data = sales.map((value, hour) => ({ label: hourLabel(hour), sales: value }));
  return <SalesBars data={data} />;
}

function SalesBars({ data }: { data: { label: string; sales: number }[] }) {
  const { color, tooltip, axis, grid } = useChartTheme();

  return (
    <div className="h-56 w-full px-3 pb-3 pt-2">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -24 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
          <XAxis dataKey="label" {...axis} interval="preserveStartEnd" minTickGap={8} />
          <YAxis {...axis} allowDecimals={false} width={48} />
          <Tooltip
            {...tooltip}
            formatter={(value) => [formatNumber(Number(value) || 0), "Vendas"]}
          />
          <Bar
            dataKey="sales"
            name="Vendas"
            fill={color("primary")}
            activeBar={{ fill: color("primary", 0.8) }}
            radius={[4, 4, 0, 0]}
            maxBarSize={40}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* --------------------------------------------- acumulado por hora */

export type CumulativePoint = {
  hour: number;
  spend: number;
  revenue: number;
  profit: number;
};

const CUMULATIVE_SERIES = [
  { key: "spend", name: "Investimento", token: "accent-amber" },
  { key: "revenue", name: "Faturamento", token: "primary" },
  { key: "profit", name: "Lucro", token: "accent-emerald" },
] as const;

export function CumulativeChart({
  data,
  currency,
}: {
  data: CumulativePoint[];
  currency: string;
}) {
  const { color, tooltip, axis, grid } = useChartTheme();
  const rows = data.map((p) => ({ ...p, label: hourLabel(p.hour) }));

  return (
    <div className="h-80 w-full px-3 pb-3 pt-2">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <defs>
            {CUMULATIVE_SERIES.map((s) => (
              <linearGradient key={s.key} id={`cum-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color(s.token)} stopOpacity={0.3} />
                <stop offset="100%" stopColor={color(s.token)} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
          <XAxis dataKey="label" {...axis} minTickGap={16} />
          <YAxis
            {...axis}
            width={72}
            tickFormatter={(value: number) => formatCurrency(value, currency)}
          />
          <Tooltip
            {...tooltip}
            formatter={(value, name) => [
              formatCurrency(Number(value) || 0, currency),
              String(name ?? ""),
            ]}
          />
          <Legend
            wrapperStyle={{ fontSize: "0.72rem", paddingTop: 8, color: color("muted-foreground") }}
            iconType="circle"
            verticalAlign="top"
          />
          {CUMULATIVE_SERIES.map((s) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.name}
              stroke={color(s.token)}
              strokeWidth={2}
              fill={`url(#cum-${s.key})`}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
