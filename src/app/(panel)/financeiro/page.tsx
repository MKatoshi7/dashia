import { Banknote, Percent, RotateCcw, ShieldAlert, Ticket } from "lucide-react";
import type { Metadata } from "next";

import { KpiCard } from "@/components/panel/kpi-card";
import { RevenueChart } from "@/components/panel/revenue-chart";
import { Card } from "@/components/ui/card";
import { getActiveArea } from "@/lib/areas";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import { getPurchaseMetrics } from "@/lib/metrics";
import { formatTzDate, resolvePeriod } from "@/lib/period";
import { DEFAULT_SETTINGS, getSettings } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Financeiro" };
export const dynamic = "force-dynamic";

type Breakdown = { key: string; sales: number; revenue: number };

export default async function FinanceiroPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const period = resolvePeriod(params);

  const activeArea = await getActiveArea();
  if (!activeArea) {
    return (
      <Card className="p-6">
        <p className="text-sm text-muted-foreground">
          Crie uma área para ver o financeiro.
        </p>
      </Card>
    );
  }

  const settings = await getSettings(activeArea.id);
  const currency = settings?.currency ?? DEFAULT_SETTINGS.currency;
  const taxRate = Number(settings?.tax_rate ?? DEFAULT_SETTINGS.tax_rate);

  const metrics = await getPurchaseMetrics(
    activeArea.id,
    period.from,
    period.to,
  );

  // Recortes por produto e plataforma.
  const supabase = await createClient();
  const { data } = await supabase
    .from("purchases")
    .select("produto, plataforma, valor")
    .eq("area_id", activeArea.id)
    .eq("status", "approved")
    .gte("created_at", period.from.toISOString())
    .lte("created_at", period.to.toISOString())
    .limit(10_000);

  const byProduct = new Map<string, Breakdown>();
  const byPlatform = new Map<string, Breakdown>();

  for (const row of data ?? []) {
    const value = Number(row.valor) || 0;

    for (const [map, key] of [
      [byProduct, (row.produto as string) ?? "—"],
      [byPlatform, (row.plataforma as string) ?? "—"],
    ] as const) {
      const entry = map.get(key) ?? { key, sales: 0, revenue: 0 };
      entry.sales += 1;
      entry.revenue += value;
      map.set(key, entry);
    }
  }

  const gross = metrics.revenue;
  const tax = gross * (taxRate / 100);
  const net = gross - tax;
  const ticket = metrics.sales > 0 ? gross / metrics.sales : 0;

  // Taxas sobre o total de transações do ciclo (aprovadas + revertidas).
  const cycleTotal =
    metrics.sales + metrics.refundedCount + metrics.chargebackCount;
  const refundRate =
    cycleTotal > 0 ? (metrics.refundedCount / cycleTotal) * 100 : 0;
  const chargebackRate =
    cycleTotal > 0 ? (metrics.chargebackCount / cycleTotal) * 100 : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight">Financeiro</h2>
        <p className="font-mono text-xs text-muted-foreground">
          {period.label} · {formatTzDate(period.from)} – {formatTzDate(period.to)}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard
          label="Receita Bruta"
          value={formatCurrency(gross, currency)}
          icon={Banknote}
        />
        <KpiCard
          label="Receita Líquida"
          value={formatCurrency(net, currency)}
          icon={Percent}
          accent="primary"
          sub={`Descontado imposto de ${formatNumber(taxRate)}% (${formatCurrency(tax, currency)})`}
        />
        <KpiCard
          label="Ticket Médio"
          value={formatCurrency(ticket, currency)}
          icon={Ticket}
        />
        <KpiCard
          label="Reembolsos"
          value={formatCurrency(metrics.refundedValue, currency)}
          icon={RotateCcw}
          sub={`${formatNumber(metrics.refundedCount)} transações · ${formatPercent(refundRate)}`}
        />
        <KpiCard
          label="Chargebacks"
          value={formatCurrency(metrics.chargebackValue, currency)}
          icon={ShieldAlert}
          accent={metrics.chargebackCount > 0 ? "destructive" : "default"}
          sub={`${formatNumber(metrics.chargebackCount)} transações · ${formatPercent(chargebackRate)}`}
        />
        <KpiCard
          label="Pendentes"
          value={formatNumber(metrics.pendingCount)}
          icon={Ticket}
          sensitive={false}
        />
      </div>

      <Card>
        <div className="border-b border-border p-4">
          <span className="micro-label">
            Evolução do faturamento
          </span>
        </div>
        <div className="sensitive">
          <RevenueChart data={metrics.daily} currency={currency} />
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <BreakdownCard
          title="Por produto"
          rows={[...byProduct.values()].sort((a, b) => b.revenue - a.revenue)}
          currency={currency}
          total={gross}
        />
        <BreakdownCard
          title="Por plataforma"
          rows={[...byPlatform.values()].sort((a, b) => b.revenue - a.revenue)}
          currency={currency}
          total={gross}
        />
      </div>
    </div>
  );
}

function BreakdownCard({
  title,
  rows,
  currency,
  total,
}: {
  title: string;
  rows: Breakdown[];
  currency: string;
  total: number;
}) {
  return (
    <Card>
      <div className="border-b border-border p-4">
        <span className="micro-label">
          {title}
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="p-6 text-center text-sm text-muted-foreground">
          Sem vendas aprovadas no período.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.slice(0, 10).map((row) => {
            const share = total > 0 ? (row.revenue / total) * 100 : 0;
            return (
              <li key={row.key} className="px-4 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-sm capitalize">{row.key}</span>
                  <span className="sensitive shrink-0 font-mono text-xs tabular">
                    {formatCurrency(row.revenue, currency)}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="fill-neon h-full rounded-full"
                      style={{ width: `${share}%` }}
                    />
                  </div>
                  <span className="shrink-0 font-mono text-[0.65rem] text-muted-foreground tabular">
                    {formatNumber(row.sales)} · {formatPercent(share)}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
