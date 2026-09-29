import { TriangleAlert } from "lucide-react";

import { Card } from "@/components/ui/card";
import { formatCurrency, formatRoas } from "@/lib/format";
import { getMetaDashboard } from "@/lib/meta/dashboard";
import { getCheckoutBreakdown } from "@/lib/metrics";
import type { Period } from "@/lib/period";
import { metaTax, type Settings } from "@/lib/settings";

import { ApprovalRate, BreakdownList, PanelTitle, StatTile } from "./blocks";
import {
  CumulativeChart,
  HourChart,
  PaymentDonut,
  WeekdayChart,
  type CumulativePoint,
} from "./charts";
import { EditableFunnel } from "./editable-funnel";

/**
 * Dashboard V2. Vendas e faturamento vêm do Gerenciador (pixel da Meta) — a
 * mesma fonte do modo "Vendas na Meta" das Campanhas. O que só o checkout sabe
 * (método de pagamento, pendentes, devolvidas) vem do webhook e fica em N/A
 * enquanto ele não mandar vendas.
 */
export async function DashboardV2({
  areaId,
  period,
  settings,
}: {
  areaId: string;
  period: Period;
  settings: Omit<Settings, "area_id">;
}) {
  const [meta, checkout] = await Promise.all([
    getMetaDashboard(areaId, period.from, period.to),
    getCheckoutBreakdown(areaId, period.from, period.to),
  ]);

  const currency = settings.currency;
  const salesTaxRate = Number(settings.tax_rate) / 100;
  const metaTaxRate = Number(settings.meta_tax_rate);

  const { spend, revenue, sales } = meta;
  const salesTax = revenue * salesTaxRate;
  const adsTax = metaTax(spend, metaTaxRate);
  const investment = spend + adsTax;
  const profit = revenue - investment - salesTax;
  const roi = investment > 0 ? profit / investment : 0;
  const roas = spend > 0 ? revenue / spend : 0;
  const cpa = sales > 0 ? investment / sales : null;

  const rate = (method: keyof typeof checkout.byMethod) => {
    const s = checkout.byMethod[method];
    return s.total > 0 ? (s.approved / s.total) * 100 : null;
  };

  // Acumulado hora a hora, com os mesmos impostos do topo.
  const cumulative = meta.hours.reduce<CumulativePoint[]>((acc, h) => {
    const prev = acc[acc.length - 1];
    const cumSpend = (prev?.spend ?? 0) + h.spend;
    const cumRevenue = (prev?.revenue ?? 0) + h.revenue;
    acc.push({
      hour: h.hour,
      spend: cumSpend,
      revenue: cumRevenue,
      profit:
        cumRevenue - cumSpend - metaTax(cumSpend, metaTaxRate) - cumRevenue * salesTaxRate,
    });
    return acc;
  }, []);

  const fromMeta = "Fonte: Gerenciador de Anúncios (pixel da Meta).";

  return (
    <div className="space-y-3">
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
            Nenhuma conta de anúncio da Meta conectada nesta área. Conecte em{" "}
            <strong>Integrações</strong>.
          </p>
        </Card>
      ) : null}

      {meta.errors.length > 0 ? (
        <Card className="flex items-start gap-3 p-4">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div className="min-w-0 text-sm">
            <p className="font-medium">Falha ao ler parte dos dados da Meta</p>
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

      {/* Topo: KPIs 3×3 + taxa de aprovação */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:col-span-3">
          <StatTile label="Gastos com anúncios" value={formatCurrency(spend, currency)} hint={fromMeta} />
          <StatTile
            label="ROI"
            value={investment > 0 ? roi.toFixed(2) : "N/A"}
            tone={profit < 0 ? "negative" : "positive"}
            hint="Lucro ÷ investimento (gasto + imposto da Meta)."
            sensitive={false}
          />
          <StatTile
            label="Lucro"
            value={formatCurrency(profit, currency)}
            tone={profit < 0 ? "negative" : "positive"}
            hint="Faturamento − gasto − imposto da Meta − imposto sobre vendas."
          />
          <StatTile label="Faturamento Bruto" value={formatCurrency(revenue, currency)} hint={`Valor de compra reportado pelo pixel. ${fromMeta}`} />
          <StatTile
            label="ROAS"
            value={formatRoas(roas)}
            tone={roas > 0 && roas < 1 ? "negative" : roas >= 1 ? "positive" : "default"}
            hint="Faturamento ÷ gasto com anúncios."
            sensitive={false}
          />
          <StatTile
            label="Imposto sobre vendas"
            value={formatCurrency(salesTax, currency)}
            hint={`${settings.tax_rate}% sobre o faturamento (Configurações → Preferências da área).`}
          />
          <StatTile
            label="Vendas Pendentes"
            value={checkout.hasData ? formatCurrency(checkout.pendingValue, currency) : "N/A"}
            hint="Pix/boleto gerados e ainda não pagos. Vem do webhook do checkout."
          />
          <StatTile
            label="CPA"
            value={cpa === null ? "N/A" : formatCurrency(cpa, currency)}
            hint="Investimento (gasto + imposto da Meta) ÷ vendas."
          />
          <StatTile
            label="Imposto Meta Ads"
            value={formatCurrency(adsTax, currency)}
            hint={`${metaTaxRate}% calculado "por dentro" sobre o gasto, como a Meta cobra no Brasil.`}
          />
        </div>

        <ApprovalRate
          rows={[
            { label: "Cartão", rate: rate("cartao") },
            { label: "Pix", rate: rate("pix") },
            { label: "Boleto", rate: rate("boleto") },
          ]}
        />
      </div>

      {/* Funil + vendas por pagamento */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <EditableFunnel steps={settings.dashboard_funnel} values={meta.funnel} />
        </Card>

        <Card>
          <PanelTitle
            title="Vendas por Pagamento"
            hint="Vendas aprovadas por método. Vem do webhook do checkout."
          />
          <PaymentDonut
            counts={{
              pix: checkout.byMethod.pix.approved,
              cartao: checkout.byMethod.cartao.approved,
              boleto: checkout.byMethod.boleto.approved,
              outros: checkout.byMethod.outros.approved,
            }}
          />
        </Card>
      </div>

      {/* Dia da semana + posicionamento */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <PanelTitle title="Vendas por Dia da Semana" hint={fromMeta} />
          <WeekdayChart sales={meta.weekday} />
        </Card>
        <Card>
          <PanelTitle title="Vendas por Posicionamento" hint={fromMeta} />
          <BreakdownList rows={meta.placements} currency={currency} />
        </Card>
      </div>

      {/* Horário + fonte + devolvidas */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <PanelTitle title="Vendas por Horário" hint={`Hora no fuso da conta de anúncio. ${fromMeta}`} />
          <HourChart sales={meta.hours.map((h) => h.sales)} />
        </Card>
        <div className="grid grid-cols-1 gap-3">
          <Card>
            <PanelTitle title="Vendas por Fonte" hint={`Plataforma onde o anúncio rodou. ${fromMeta}`} />
            <BreakdownList rows={meta.platforms} currency={currency} limit={5} />
          </Card>
          <StatTile
            label="Vendas devolvidas"
            value={checkout.hasData ? formatCurrency(checkout.returnedValue, currency) : "N/A"}
            hint="Reembolsos + chargebacks. Vem do webhook do checkout."
          />
        </div>
      </div>

      <Card>
        <PanelTitle
          title="Faturamento x Investimento x Lucro por Hora (acumulado)"
          hint="Soma hora a hora no período. Lucro já desconta os impostos."
        />
        <div className="sensitive">
          <CumulativeChart data={cumulative} currency={currency} />
        </div>
      </Card>
    </div>
  );
}
