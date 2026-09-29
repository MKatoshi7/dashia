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

/**
 * Gráficos do Dashboard V2. Cores sempre das variáveis CSS (tema + branding),
 * nunca fixas — mesmo padrão do RevenueChart.
 */
const COLORS = {
  primary: "hsl(var(--primary))",
  purple: "hsl(var(--accent-purple))",
  cyan: "hsl(var(--accent-cyan))",
  amber: "hsl(var(--accent-amber))",
  emerald: "hsl(var(--accent-emerald))",
  destructive: "hsl(var(--destructive))",
};

const tooltipProps = {
  cursor: { fill: "hsl(var(--foreground) / 0.05)", stroke: "hsl(var(--foreground) / 0.15)" },
  contentStyle: {
    background: "hsl(var(--card))",
    border: "1px solid hsl(var(--border))",
    borderRadius: "0.75rem",
    fontSize: "0.78rem",
    boxShadow: "0 20px 40px -12px rgb(0 0 0 / 0.6)",
  },
  labelStyle: { color: "hsl(var(--muted-foreground))" },
  itemStyle: { color: "hsl(var(--foreground))" },
} as const;

const axisProps = {
  tickLine: false,
  axisLine: false,
  tick: { fontSize: 11, fill: "currentColor" },
  className: "text-muted-foreground",
} as const;

function Grid() {
  return (
    <CartesianGrid
      strokeDasharray="3 3"
      stroke="currentColor"
      className="text-muted-foreground/15"
      vertical={false}
    />
  );
}

function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

/* ------------------------------------------------------------ pagamento */

const PAYMENT_SLICES = [
  { key: "pix", label: "Pix", color: COLORS.primary },
  { key: "cartao", label: "Cartão", color: COLORS.cyan },
  { key: "boleto", label: "Boleto", color: COLORS.amber },
  { key: "outros", label: "Outros", color: COLORS.destructive },
] as const;

export function PaymentDonut({
  counts,
}: {
  counts: Record<(typeof PAYMENT_SLICES)[number]["key"], number>;
}) {
  const total = PAYMENT_SLICES.reduce((sum, s) => sum + counts[s.key], 0);
  const data = PAYMENT_SLICES.map((s) => ({ ...s, value: counts[s.key] }));

  return (
    <div className="flex h-72 flex-col px-5 pb-4">
      <div className="relative flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={total > 0 ? data : [{ label: "vazio", value: 1, color: "hsl(var(--muted))" }]}
              dataKey="value"
              nameKey="label"
              innerRadius="62%"
              outerRadius="82%"
              stroke="none"
              isAnimationActive={false}
            >
              {(total > 0 ? data : [{ color: "hsl(var(--muted))" }]).map((slice, i) => (
                <Cell key={i} fill={slice.color} />
              ))}
            </Pie>
            {total > 0 ? (
              <Tooltip
                {...tooltipProps}
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
        {PAYMENT_SLICES.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
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
  return (
    <div className="h-56 w-full px-3 pb-3 pt-2">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -24 }}>
          <Grid />
          <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={8} />
          <YAxis {...axisProps} allowDecimals={false} width={48} />
          <Tooltip
            {...tooltipProps}
            formatter={(value) => [formatNumber(Number(value) || 0), "Vendas"]}
          />
          <Bar dataKey="sales" name="Vendas" fill={COLORS.primary} radius={[4, 4, 0, 0]} maxBarSize={40} />
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

export function CumulativeChart({
  data,
  currency,
}: {
  data: CumulativePoint[];
  currency: string;
}) {
  const rows = data.map((p) => ({ ...p, label: hourLabel(p.hour) }));

  return (
    <div className="h-80 w-full px-3 pb-3 pt-2">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <defs>
            {(["amber", "primary", "emerald"] as const).map((key) => (
              <linearGradient key={key} id={`cum-${key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COLORS[key]} stopOpacity={0.3} />
                <stop offset="100%" stopColor={COLORS[key]} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <Grid />
          <XAxis dataKey="label" {...axisProps} minTickGap={16} />
          <YAxis
            {...axisProps}
            width={72}
            tickFormatter={(value: number) => formatCurrency(value, currency)}
          />
          <Tooltip
            {...tooltipProps}
            formatter={(value, name) => [
              formatCurrency(Number(value) || 0, currency),
              String(name ?? ""),
            ]}
          />
          <Legend wrapperStyle={{ fontSize: "0.72rem", paddingTop: 8 }} iconType="circle" verticalAlign="top" />
          <Area type="monotone" dataKey="spend" name="Investimento" stroke={COLORS.amber} strokeWidth={2} fill="url(#cum-amber)" />
          <Area type="monotone" dataKey="revenue" name="Faturamento" stroke={COLORS.primary} strokeWidth={2} fill="url(#cum-primary)" />
          <Area type="monotone" dataKey="profit" name="Lucro" stroke={COLORS.emerald} strokeWidth={2} fill="url(#cum-emerald)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
