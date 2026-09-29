"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatCurrency } from "@/lib/format";
import type { DailyPoint } from "@/lib/metrics";

import { useThemeColors } from "./use-theme-colors";

/**
 * Faturamento (dados próprios) vs Gasto com Ads (Meta).
 * Ciano para faturamento, roxo para gasto — o par de acentos da referência,
 * distinguíveis também por posição na legenda.
 *
 * As cores saem das variáveis CSS (useThemeColors), já resolvidas: acompanham
 * o tema e o override de cor do branding, e não viram preto no Safari (que não
 * resolve var() em atributo SVG).
 */

function shortDate(value: string): string {
  const [, month, day] = value.split("-");
  return `${day}/${month}`;
}

export function RevenueChart({
  data,
  currency,
}: {
  data: DailyPoint[];
  currency: string;
}) {
  const color = useThemeColors();
  const COLOR_REVENUE = color("primary");
  const COLOR_SPEND = color("accent-purple");
  const axisTick = { fontSize: 11, fill: color("muted-foreground") };

  return (
    <div className="h-72 w-full p-3">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="fillRevenue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={COLOR_REVENUE} stopOpacity={0.35} />
              <stop offset="100%" stopColor={COLOR_REVENUE} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="fillSpend" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={COLOR_SPEND} stopOpacity={0.25} />
              <stop offset="100%" stopColor={COLOR_SPEND} stopOpacity={0} />
            </linearGradient>
          </defs>

          <CartesianGrid
            strokeDasharray="3 3"
            stroke={color("muted-foreground", 0.15)}
            vertical={false}
          />
          <XAxis
            dataKey="date"
            tickFormatter={shortDate}
            tickLine={false}
            axisLine={false}
            minTickGap={24}
            tick={axisTick}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={64}
            tick={axisTick}
            tickFormatter={(value: number) =>
              new Intl.NumberFormat("pt-BR", {
                notation: "compact",
                maximumFractionDigits: 1,
              }).format(value)
            }
          />
          <Tooltip
            cursor={{ stroke: color("foreground", 0.15) }}
            contentStyle={{
              background: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "0.75rem",
              fontSize: "0.78rem",
              boxShadow: "0 20px 40px -12px rgb(0 0 0 / 0.6)",
            }}
            labelStyle={{ color: "hsl(var(--muted-foreground))" }}
            itemStyle={{ color: "hsl(var(--foreground))" }}
            labelFormatter={(label) =>
              typeof label === "string" ? shortDate(label) : String(label ?? "")
            }
            formatter={(value, name) => [
              formatCurrency(Number(value) || 0, currency),
              String(name ?? ""),
            ]}
          />
          <Legend
            wrapperStyle={{ fontSize: "0.72rem", paddingTop: 8 }}
            iconType="circle"
          />

          <Area
            type="monotone"
            dataKey="revenue"
            name="Faturamento"
            stroke={COLOR_REVENUE}
            strokeWidth={2}
            fill="url(#fillRevenue)"
          />
          <Area
            type="monotone"
            dataKey="spend"
            name="Gasto com Ads"
            stroke={COLOR_SPEND}
            strokeWidth={2}
            fill="url(#fillSpend)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
