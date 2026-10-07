"use client";

import { BarChart3, TrendingUp, Sparkles, DollarSign, Wallet } from "lucide-react";
import { useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatCurrency, formatRoas } from "@/lib/format";
import type { DailyPoint } from "@/lib/metrics";

import { useThemeColors } from "./use-theme-colors";

function shortDate(value: string): string {
  if (!value) return "";
  const parts = value.split("-");
  if (parts.length < 3) return value;
  const [, month, day] = parts;
  return `${day}/${month}`;
}

export function RevenueChart({
  data,
  currency,
}: {
  data: DailyPoint[];
  currency: string;
}) {
  const [chartType, setChartType] = useState<"area" | "bar">("area");
  const color = useThemeColors();

  const COLOR_REVENUE = color("primary");
  const COLOR_SPEND = color("accent-purple");
  const COLOR_PROFIT = "#10b981"; // Emerald

  const totalRevenue = data.reduce((s, p) => s + (p.revenue || 0), 0);
  const totalSpend = data.reduce((s, p) => s + (p.spend || 0), 0);
  const totalProfit = totalRevenue - totalSpend;
  const avgRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0;

  // Enriquecemos os dados com o lucro do dia
  const enrichedData = data.map((d) => ({
    ...d,
    profit: (d.revenue || 0) - (d.spend || 0),
  }));

  const axisTick = { fontSize: 11, fill: color("muted-foreground") };

  return (
    <div className="flex flex-col space-y-4 p-4">
      {/* Header com métricas rápidas e seletor de visualização */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/50 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Chip Faturamento */}
          <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/10 px-3 py-1.5 backdrop-blur-xs">
            <span className="size-2 rounded-full bg-primary animate-pulse" />
            <div className="flex flex-col">
              <span className="font-mono text-[0.62rem] uppercase tracking-wider text-muted-foreground">
                Faturamento Total
              </span>
              <span className="sensitive font-mono text-xs font-bold text-foreground tabular">
                {formatCurrency(totalRevenue, currency)}
              </span>
            </div>
          </div>

          {/* Chip Investimento */}
          <div className="flex items-center gap-2 rounded-lg border border-purple-500/20 bg-purple-500/10 px-3 py-1.5 backdrop-blur-xs">
            <span className="size-2 rounded-full bg-purple-400" />
            <div className="flex flex-col">
              <span className="font-mono text-[0.62rem] uppercase tracking-wider text-muted-foreground">
                Investimento Ads
              </span>
              <span className="sensitive font-mono text-xs font-bold text-foreground tabular">
                {formatCurrency(totalSpend, currency)}
              </span>
            </div>
          </div>

          {/* Chip Lucro & ROAS */}
          <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 backdrop-blur-xs">
            <TrendingUp className="size-3 text-emerald-400" />
            <div className="flex flex-col">
              <span className="font-mono text-[0.62rem] uppercase tracking-wider text-muted-foreground">
                Lucro Líquido · ROAS
              </span>
              <span className="sensitive font-mono text-xs font-bold text-emerald-400 tabular">
                {formatCurrency(totalProfit, currency)} ({formatRoas(avgRoas)})
              </span>
            </div>
          </div>
        </div>

        {/* Toggle Área vs Barras */}
        <div className="flex items-center rounded-lg border border-border bg-muted/30 p-0.5">
          <button
            type="button"
            onClick={() => setChartType("area")}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
              chartType === "area"
                ? "bg-background text-foreground shadow-xs font-semibold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Sparkles className="size-3" />
            <span>Linhas com Brilho</span>
          </button>
          <button
            type="button"
            onClick={() => setChartType("bar")}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
              chartType === "bar"
                ? "bg-background text-foreground shadow-xs font-semibold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <BarChart3 className="size-3" />
            <span>Barras</span>
          </button>
        </div>
      </div>

      {/* Gráfico Recharts Interativo */}
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {chartType === "area" ? (
            <AreaChart
              data={enrichedData}
              margin={{ top: 12, right: 12, bottom: 4, left: 0 }}
            >
              <defs>
                <linearGradient id="glowRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLOR_REVENUE} stopOpacity={0.4} />
                  <stop offset="60%" stopColor={COLOR_REVENUE} stopOpacity={0.1} />
                  <stop offset="100%" stopColor={COLOR_REVENUE} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="glowSpend" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLOR_SPEND} stopOpacity={0.35} />
                  <stop offset="60%" stopColor={COLOR_SPEND} stopOpacity={0.08} />
                  <stop offset="100%" stopColor={COLOR_SPEND} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="glowProfit" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLOR_PROFIT} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={COLOR_PROFIT} stopOpacity={0} />
                </linearGradient>
              </defs>

              <CartesianGrid
                strokeDasharray="3 3"
                stroke={color("muted-foreground", 0.12)}
                vertical={false}
              />

              <XAxis
                dataKey="date"
                tickFormatter={shortDate}
                tickLine={false}
                axisLine={false}
                minTickGap={20}
                tick={axisTick}
              />

              <YAxis
                tickLine={false}
                axisLine={false}
                width={65}
                tick={axisTick}
                tickFormatter={(value: number) =>
                  new Intl.NumberFormat("pt-BR", {
                    notation: "compact",
                    maximumFractionDigits: 1,
                  }).format(value)
                }
              />

              <Tooltip
                cursor={{
                  stroke: color("primary", 0.4),
                  strokeWidth: 1.5,
                  strokeDasharray: "4 4",
                }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const rev = Number(payload.find((p) => p.dataKey === "revenue")?.value || 0);
                  const spd = Number(payload.find((p) => p.dataKey === "spend")?.value || 0);
                  const pft = rev - spd;
                  const roas = spd > 0 ? rev / spd : 0;

                  return (
                    <div className="rounded-xl border border-border/80 bg-background/95 p-3.5 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150">
                      <p className="border-b border-border/60 pb-1.5 font-mono text-xs font-semibold text-muted-foreground">
                        {shortDate(String(label))}
                      </p>
                      <div className="mt-2 space-y-1.5 text-xs">
                        <div className="flex items-center justify-between gap-4">
                          <span className="flex items-center gap-1.5 text-foreground font-medium">
                            <span className="size-2 rounded-full bg-primary" />
                            Faturamento:
                          </span>
                          <span className="font-mono font-bold text-primary tabular">
                            {formatCurrency(rev, currency)}
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-4">
                          <span className="flex items-center gap-1.5 text-foreground font-medium">
                            <span className="size-2 rounded-full bg-purple-400" />
                            Investimento:
                          </span>
                          <span className="font-mono font-bold text-purple-400 tabular">
                            {formatCurrency(spd, currency)}
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-4 pt-1 border-t border-border/40">
                          <span className="flex items-center gap-1.5 text-foreground font-medium">
                            <span className="size-2 rounded-full bg-emerald-400" />
                            Lucro do Dia:
                          </span>
                          <span
                            className={`font-mono font-bold tabular ${
                              pft >= 0 ? "text-emerald-400" : "text-destructive"
                            }`}
                          >
                            {formatCurrency(pft, currency)}
                          </span>
                        </div>

                        {spd > 0 ? (
                          <div className="flex items-center justify-between gap-4 text-[0.7rem] text-muted-foreground">
                            <span>ROAS diário:</span>
                            <span className="font-mono font-bold text-foreground tabular">
                              {formatRoas(roas)}
                            </span>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                }}
              />

              <Legend
                wrapperStyle={{ fontSize: "0.75rem", paddingTop: 10 }}
                iconType="circle"
              />

              <Area
                type="monotone"
                dataKey="revenue"
                name="Faturamento"
                stroke={COLOR_REVENUE}
                strokeWidth={2.5}
                fill="url(#glowRevenue)"
                activeDot={{
                  r: 6,
                  stroke: "#fff",
                  strokeWidth: 2,
                  fill: COLOR_REVENUE,
                }}
              />

              <Area
                type="monotone"
                dataKey="spend"
                name="Investimento Ads"
                stroke={COLOR_SPEND}
                strokeWidth={2.5}
                fill="url(#glowSpend)"
                activeDot={{
                  r: 6,
                  stroke: "#fff",
                  strokeWidth: 2,
                  fill: COLOR_SPEND,
                }}
              />
            </AreaChart>
          ) : (
            <BarChart
              data={enrichedData}
              margin={{ top: 12, right: 12, bottom: 4, left: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={color("muted-foreground", 0.12)}
                vertical={false}
              />
              <XAxis
                dataKey="date"
                tickFormatter={shortDate}
                tickLine={false}
                axisLine={false}
                minTickGap={20}
                tick={axisTick}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={65}
                tick={axisTick}
                tickFormatter={(value: number) =>
                  new Intl.NumberFormat("pt-BR", {
                    notation: "compact",
                    maximumFractionDigits: 1,
                  }).format(value)
                }
              />
              <Tooltip
                cursor={{ fill: color("muted-foreground", 0.08) }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const rev = Number(payload.find((p) => p.dataKey === "revenue")?.value || 0);
                  const spd = Number(payload.find((p) => p.dataKey === "spend")?.value || 0);
                  const pft = rev - spd;

                  return (
                    <div className="rounded-xl border border-border/80 bg-background/95 p-3.5 shadow-2xl backdrop-blur-xl">
                      <p className="border-b border-border/60 pb-1 font-mono text-xs font-semibold text-muted-foreground">
                        {shortDate(String(label))}
                      </p>
                      <div className="mt-2 space-y-1 text-xs">
                        <div className="flex justify-between gap-3 text-primary font-bold">
                          <span>Faturamento:</span>
                          <span>{formatCurrency(rev, currency)}</span>
                        </div>
                        <div className="flex justify-between gap-3 text-purple-400 font-bold">
                          <span>Investimento:</span>
                          <span>{formatCurrency(spd, currency)}</span>
                        </div>
                        <div className="flex justify-between gap-3 text-emerald-400 font-bold pt-1 border-t border-border/30">
                          <span>Lucro:</span>
                          <span>{formatCurrency(pft, currency)}</span>
                        </div>
                      </div>
                    </div>
                  );
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: "0.75rem", paddingTop: 10 }}
                iconType="circle"
              />
              <Bar
                dataKey="revenue"
                name="Faturamento"
                fill={COLOR_REVENUE}
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="spend"
                name="Investimento Ads"
                fill={COLOR_SPEND}
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
