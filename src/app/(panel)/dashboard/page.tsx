import {
  Activity,
  BadgeDollarSign,
  Banknote,
  Globe2,
  Megaphone,
  Radio,
  ShoppingBag,
  Target,
  TrendingUp,
  TriangleAlert,
} from "lucide-react";
import type { Metadata } from "next";

import { DashboardV2 } from "@/components/panel/dashboard-v2/dashboard-v2";
import { KpiCard } from "@/components/panel/kpi-card";
import { RealtimeSales } from "@/components/panel/realtime-sales";
import { RegionBreakdown } from "@/components/panel/region-breakdown";
import { ReorderableBoxes } from "@/components/panel/reorderable-boxes";
import { RevenueChart } from "@/components/panel/revenue-chart";
import { Card } from "@/components/ui/card";
import { getActiveArea } from "@/lib/areas";
import { formatCurrency, formatNumber, formatRoas } from "@/lib/format";
import { getAreaInsights } from "@/lib/meta/client";
import { EMPTY_METRICS, getPurchaseMetrics, mergeDailySpend } from "@/lib/metrics";
import { resolvePeriod } from "@/lib/period";
import { DEFAULT_SETTINGS, getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Dashboard" };

/** Next.js 16: searchParams é assíncrono. */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const period = resolvePeriod(params);

  const activeArea = await getActiveArea();
  const settings = activeArea ? await getSettings(activeArea.id) : null;
  const currency = settings?.currency ?? DEFAULT_SETTINGS.currency;
  const taxRate = settings?.tax_rate ?? DEFAULT_SETTINGS.tax_rate;

  if (!activeArea) {
    return (
      <Card className="p-6">
        <p className="text-sm text-muted-foreground">
          Crie uma área no seletor do topo da sidebar para ver o dashboard.
        </p>
      </Card>
    );
  }

  // Layout escolhido em Configurações → Dashboard.
  if (settings?.dashboard_version === "v2") {
    return (
      <DashboardV2
        areaId={activeArea.id}
        period={period}
        settings={{ ...DEFAULT_SETTINGS, ...settings }}
      />
    );
  }

  // Dados próprios (Last Click) + mídia da Meta, em paralelo.
  const [metrics, meta] = await Promise.all([
    getPurchaseMetrics(activeArea.id, period.from, period.to),
    getAreaInsights(activeArea.id, period.from, period.to),
  ]);

  const safeMetrics = metrics ?? EMPTY_METRICS;

  const revenue = safeMetrics.revenue;
  const adSpend = meta.insights.spend;
  // Lucro = Faturamento − Gasto com Ads − Imposto (alíquota configurável).
  const tax = revenue * (Number(taxRate) / 100);
  const profit = revenue - adSpend - tax;

  const sales = safeMetrics.sales;
  const roas = adSpend > 0 ? revenue / adSpend : 0;
  const cpa = sales > 0 ? adSpend / sales : 0;

  const daily = mergeDailySpend(safeMetrics.daily, meta.dailySpend);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight">Visão geral</h2>
        <p className="font-mono text-xs text-muted-foreground">
          {period.label} · {period.from.toLocaleDateString("pt-BR")} –{" "}
          {period.to.toLocaleDateString("pt-BR")}
        </p>
      </div>

      {!meta.configured ? (
        <Card className="flex items-start gap-3 p-4">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber" />
          <p className="text-sm text-muted-foreground">
            Nenhuma conta de anúncio da Meta conectada nesta área — gasto, ROAS
            e CPA ficam zerados. Conecte em <strong>Integrações</strong>.
          </p>
        </Card>
      ) : null}

      {meta.errors.length > 0 ? (
        <Card className="flex items-start gap-3 p-4">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div className="min-w-0 text-sm">
            <p className="font-medium">Falha ao ler insights da Meta</p>
            <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
              {meta.errors.map((err) => (
                <li key={err} className="truncate font-mono">
                  {err}
                </li>
              ))}
            </ul>
          </div>
        </Card>
      ) : null}

      {/* Blocos reordenáveis do Dashboard com Grip magnético (6 pontinhos) */}
      <ReorderableBoxes
        storageKey="dashia_dashboard_boxes_order"
        className="grid-cols-1 gap-3 xl:grid-cols-3"
        items={[
          {
            id: "kpis",
            className: "xl:col-span-3",
            children: (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <KpiCard
                  label="Faturamento Bruto"
                  value={formatCurrency(revenue, currency)}
                  icon={Banknote}
                />
                <KpiCard
                  label="Gasto com Ads"
                  value={formatCurrency(adSpend, currency)}
                  icon={Megaphone}
                  sub={`Ads ${formatCurrency(adSpend, currency)} · Imposto ${formatNumber(Number(taxRate))}% (${formatCurrency(tax, currency)})`}
                />
                <KpiCard
                  label="Lucro"
                  value={formatCurrency(profit, currency)}
                  icon={TrendingUp}
                  accent={profit < 0 ? "destructive" : "primary"}
                />
                <KpiCard
                  label="Vendas Aprovadas"
                  value={formatNumber(sales)}
                  icon={ShoppingBag}
                  sensitive={false}
                />
                <KpiCard
                  label="ROAS"
                  value={formatRoas(roas)}
                  icon={Target}
                  accent={roas > 0 && roas < 1 ? "destructive" : "primary"}
                />
                <KpiCard
                  label="CPA"
                  value={formatCurrency(cpa, currency)}
                  icon={BadgeDollarSign}
                />
              </div>
            ),
          },
          {
            id: "revenue_chart",
            className: "xl:col-span-2",
            children: (
              <Card className="h-full">
                <div className="flex items-center gap-2 border-b border-border p-4">
                  <Activity className="size-4 text-muted-foreground" />
                  <span className="micro-label">Faturamento vs Gasto</span>
                </div>
                <div className="sensitive">
                  <RevenueChart data={daily} currency={currency} />
                </div>
              </Card>
            ),
          },
          {
            id: "realtime_sales",
            className: "xl:col-span-1",
            children: (
              <Card className="h-full">
                <div className="flex items-center gap-2 border-b border-border p-4">
                  <Radio className="size-4 text-muted-foreground" />
                  <span className="micro-label">Vendas em Tempo Real</span>
                </div>
                <RealtimeSales
                  areaId={activeArea.id}
                  currency={currency}
                  initial={safeMetrics.recent}
                />
              </Card>
            ),
          },
          {
            id: "region_breakdown",
            className: "xl:col-span-3",
            children: (
              <Card className="h-full">
                <div className="flex items-center gap-2 border-b border-border p-4">
                  <Globe2 className="size-4 text-muted-foreground" />
                  <span className="micro-label">Vendas por Região</span>
                </div>
                <RegionBreakdown regions={safeMetrics.regions} currency={currency} />
              </Card>
            ),
          },
        ]}
      />
    </div>
  );
}
