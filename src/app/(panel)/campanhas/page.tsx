import { Filter, Info, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";

import { ReorderableBoxes } from "@/components/panel/reorderable-boxes";
import { Card } from "@/components/ui/card";
import { getActiveArea } from "@/lib/areas";
import {
  CAMPAIGN_VIEW_COOKIE,
  DEFAULT_CAMPAIGN_STATUS,
  parseCampaignView,
} from "@/lib/campaign-view";
import { getFunnelBase, getLastClickByAd } from "@/lib/attribution";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import { getAccountOptions, getMetaEntities, type MetaLevel } from "@/lib/meta/campaigns";
import { resolvePeriod } from "@/lib/period";
import { DEFAULT_SETTINGS, getSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";

import { CampaignFilters } from "./campaign-filters";
import { CampaignsTable, type TableRow } from "./campaigns-table";

export const metadata: Metadata = { title: "Campanhas" };

const LEVELS: { key: MetaLevel; label: string }[] = [
  { key: "campaign", label: "Campanhas" },
  { key: "adset", label: "Conjuntos" },
  { key: "ad", label: "Anúncios" },
];

type SearchParams = {
  period?: string;
  from?: string;
  to?: string;
  level?: string;
  attr?: string;
  account?: string;
  q?: string;
  status?: string;
  selected_campaigns?: string;
  selected_adsets?: string;
  selected_ads?: string;
  isolated?: string;
};

function buildHref(
  params: SearchParams,
  patch: Record<string, string | null | undefined>,
) {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...params, ...patch })) {
    if (v !== null && v !== undefined && v !== "") search.set(k, String(v));
  }
  return `/campanhas?${search.toString()}`;
}

export default async function CampanhasPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  // Filtros: URL > último usado (cookie) > padrão. A página lê o cookie ela
  // mesma porque um prefetch antigo do menu pode chegar sem os parâmetros.
  const saved = parseCampaignView(
    (await cookies()).get(CAMPAIGN_VIEW_COOKIE)?.value,
  );
  const params: SearchParams = {
    ...saved,
    ...(await searchParams),
  };
  params.status ??= DEFAULT_CAMPAIGN_STATUS;
  const period = resolvePeriod(params);

  const level = (LEVELS.find((l) => l.key === params.level)?.key ??
    "campaign") as MetaLevel;
  // Padrão: vendas do Gerenciador (pixel/rastreamento avançado da Meta). O
  // Last Click (webhook do checkout) continua a um clique no toggle.
  const attribution = params.attr === "lastclick" ? "lastclick" : "meta";

  const activeArea = await getActiveArea();
  if (!activeArea) {
    return (
      <Card className="p-6">
        <p className="text-sm text-muted-foreground">
          Crie uma área para ver as campanhas.
        </p>
      </Card>
    );
  }

  // Tudo em paralelo (as settings eram lidas antes, sozinhas).
  const [settings, meta, lastClick, accounts, funnelBase] = await Promise.all([
    getSettings(activeArea.id),
    getMetaEntities(
      activeArea.id,
      level,
      period.from,
      period.to,
      params.account,
    ),
    getLastClickByAd(activeArea.id, period.from, period.to),
    getAccountOptions(activeArea.id),
    getFunnelBase(activeArea.id, period.from, period.to),
  ]);
  const currency = settings?.currency ?? DEFAULT_SETTINGS.currency;
  const taxRate = Number(settings?.tax_rate ?? DEFAULT_SETTINGS.tax_rate);

  // page_view e initiate_checkout só existem com o snippet opcional de captura
  // própria. Sem ele, `events_log` fica vazio para sempre — mostrar as etapas
  // zeradas faria o funil parecer quebrado. Só entram quando há dado real.
  const hasOwnEvents = funnelBase.views > 0 || funnelBase.checkouts > 0;

  // Monta as linhas conforme o MODO DE ATRIBUIÇÃO (nunca somando os dois).
  let rows: TableRow[] = meta.rows.map((entity) => {
    const own = entity.adIds.reduce(
      (acc, adId) => {
        const row = lastClick.get(adId);
        if (row) {
          acc.sales += row.sales;
          acc.revenue += row.revenue;
          acc.checkouts += row.checkouts;
        }
        return acc;
      },
      { sales: 0, revenue: 0, checkouts: 0 },
    );

    const sales =
      attribution === "meta" ? entity.metaPurchases : own.sales;
    const revenue =
      attribution === "meta" ? entity.metaRevenue : own.revenue;

    const tax = revenue * (taxRate / 100);
    const profit = revenue - entity.spend - tax;

    return {
      id: entity.id,
      name: entity.name,
      level: entity.level,
      status: entity.status,
      effectiveStatus: entity.effectiveStatus,
      campaignId: entity.campaignId,
      adsetId: entity.adsetId,
      budgetAmount: entity.budgetAmount,
      budgetType: entity.budgetType,
      budgetCurrency: entity.budgetCurrency,
      accountId: entity.accountId,
      accountLabel: entity.accountLabel,
      spend: entity.spend,
      impressions: entity.impressions,
      clicks: entity.clicks,
      landingViews: entity.metaLandingViews,
      sales,
      revenue,
      // Com o snippet ligado, checkouts vêm dos eventos próprios. Sem ele
      // (caminho padrão), `events_log` fica vazio para sempre — então usamos as
      // "Finalizações de compra iniciadas" que o pixel reportou à Meta.
      checkouts: hasOwnEvents ? own.checkouts : entity.metaCheckouts,
      profit,
      roas: entity.spend > 0 ? revenue / entity.spend : 0,
      cpa: sales > 0 ? entity.spend / sales : 0,
      cpm:
        entity.impressions > 0
          ? (entity.spend / entity.impressions) * 1000
          : 0,
      ctr:
        entity.impressions > 0 ? (entity.clicks / entity.impressions) * 100 : 0,
      cpc: entity.clicks > 0 ? entity.spend / entity.clicks : 0,
      adIds: entity.adIds,
    };
  });

  const selectedCampaignIds = params.selected_campaigns
    ? params.selected_campaigns.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  const selectedAdsetIds = params.selected_adsets
    ? params.selected_adsets.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  const selectedAdIds = params.selected_ads
    ? params.selected_ads.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  const isIsolated = params.isolated === "1" || params.isolated === "true";

  // Isolamento e filtro por hierarquia (Campanha → Conjunto → Anúncio)
  if (level === "campaign" && isIsolated && selectedCampaignIds.length > 0) {
    rows = rows.filter((r) => selectedCampaignIds.includes(r.id));
  } else if (level === "adset") {
    if (isIsolated && selectedAdsetIds.length > 0) {
      rows = rows.filter((r) => selectedAdsetIds.includes(r.id));
    } else if (selectedCampaignIds.length > 0) {
      rows = rows.filter(
        (r) => r.campaignId && selectedCampaignIds.includes(r.campaignId),
      );
    }
  } else if (level === "ad") {
    if (isIsolated && selectedAdIds.length > 0) {
      rows = rows.filter((r) => selectedAdIds.includes(r.id));
    } else if (selectedAdsetIds.length > 0) {
      rows = rows.filter(
        (r) => r.adsetId && selectedAdsetIds.includes(r.adsetId),
      );
    } else if (selectedCampaignIds.length > 0) {
      rows = rows.filter(
        (r) => r.campaignId && selectedCampaignIds.includes(r.campaignId),
      );
    }
  }

  // Filtros de busca e status (aplicados no servidor).
  if (params.q) {
    const needle = params.q.toLowerCase();
    rows = rows.filter((r) => r.name.toLowerCase().includes(needle));
  }
  // Mesmo critério do StatusDot (status EFETIVO): um anúncio ACTIVE dentro de
  // uma campanha pausada não está veiculando, então não conta como ativo.
  const isRunning = (r: TableRow) =>
    (r.effectiveStatus || r.status).toUpperCase() === "ACTIVE";
  if (params.status === "active") {
    rows = rows.filter(isRunning);
  } else if (params.status === "paused") {
    rows = rows.filter((r) => !isRunning(r));
  }

  // Top 5 anúncios: se houver seleção/isolamento ativo, restringe aos criativos do conjunto filtrado
  const activeAdIds = new Set(rows.flatMap((r) => r.adIds));
  const hasHierarchyFilter =
    selectedCampaignIds.length > 0 ||
    selectedAdsetIds.length > 0 ||
    selectedAdIds.length > 0 ||
    isIsolated;

  const topAdsCandidates = hasHierarchyFilter
    ? [...lastClick.entries()].filter(([adId]) => activeAdIds.has(adId))
    : [...lastClick.entries()];

  const topAds = topAdsCandidates
    .map(([adId, row]) => ({ adId, ...row }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  const adNames = new Map(
    meta.rows
      .filter((r) => r.level === "ad")
      .map((r) => [r.id, r.name] as const),
  );

  // Totais do funil — TODOS derivados do MESMO conjunto já filtrado.
  const totalImpressions = rows.reduce((sum, r) => sum + r.impressions, 0);
  const totalClicks = rows.reduce((sum, r) => sum + r.clicks, 0);
  const totalSales = rows.reduce((sum, r) => sum + r.sales, 0);
  const totalViews = hasOwnEvents
    ? funnelBase.views
    : rows.reduce((sum, r) => sum + r.landingViews, 0);
  const totalCheckouts = hasOwnEvents
    ? funnelBase.checkouts
    : rows.reduce((sum, r) => sum + r.checkouts, 0);
  const totalRevenue = rows.reduce((sum, r) => sum + r.revenue, 0);

  return (
    <div className="space-y-4">
      {/* Tabs de nível com badges de quantidade selecionada + toggle de atribuição */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex gap-1 rounded-lg border border-border bg-[hsl(var(--muted)/0.4)] p-1">
          {LEVELS.map((item) => {
            const count =
              item.key === "campaign"
                ? selectedCampaignIds.length
                : item.key === "adset"
                  ? selectedAdsetIds.length
                  : selectedAdIds.length;

            return (
              <Link
                key={item.key}
                href={buildHref(params, { level: item.key })}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
                  level === item.key
                    ? "bg-[hsl(var(--primary)/0.15)] font-medium text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span>{item.label}</span>
                {count > 0 ? (
                  <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary/20 px-1 font-mono text-[0.65rem] font-bold text-primary">
                    {count}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <div
            className="group relative"
            title="Vendas da Meta: o que o Gerenciador reporta (pixel). Vendas da Cakto: compras e assinaturas reais recebidas via webhook da Cakto casadas por ad_id ou UTMs. Os dois NUNCA são somados."
          >
            <Info className="size-4 text-muted-foreground" />
          </div>
          <nav className="flex gap-1 rounded-lg border border-border bg-[hsl(var(--muted)/0.4)] p-1">
            <Link
              href={buildHref(params, { attr: "meta" })}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs transition-colors",
                attribution === "meta"
                  ? "bg-[hsl(var(--primary)/0.15)] font-medium text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Vendas da Meta
            </Link>
            <Link
              href={buildHref(params, { attr: "lastclick" })}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs transition-colors",
                attribution === "lastclick"
                  ? "bg-[hsl(var(--primary)/0.15)] font-medium text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Vendas da Cakto
            </Link>
          </nav>
        </div>
      </div>

      <CampaignFilters
        accounts={accounts}
        status={params.status}
        account={params.account ?? ""}
      />

      {/* Banner de Isolamento / Filtragem ativa por hierarquia */}
      {(isIsolated && selectedCampaignIds.length > 0 && level === "campaign") ||
      (selectedCampaignIds.length > 0 && level === "adset") ||
      ((selectedAdsetIds.length > 0 || selectedCampaignIds.length > 0) && level === "ad") ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/10 px-4 py-2.5 text-xs text-foreground">
          <div className="flex items-center gap-2">
            <Filter className="size-4 shrink-0 text-primary" />
            <span>
              {level === "campaign" && (
                <>
                  Isolando <strong>{selectedCampaignIds.length}</strong> campanha(s) selecionada(s).
                </>
              )}
              {level === "adset" && (
                <>
                  Exibindo conjuntos pertencentes a{" "}
                  <strong>{selectedCampaignIds.length}</strong> campanha(s) selecionada(s).
                </>
              )}
              {level === "ad" && selectedAdsetIds.length > 0 && (
                <>
                  Exibindo anúncios pertencentes a{" "}
                  <strong>{selectedAdsetIds.length}</strong> conjunto(s) selecionado(s).
                </>
              )}
              {level === "ad" && selectedAdsetIds.length === 0 && selectedCampaignIds.length > 0 && (
                <>
                  Exibindo anúncios pertencentes a{" "}
                  <strong>{selectedCampaignIds.length}</strong> campanha(s) selecionada(s).
                </>
              )}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {isIsolated ? (
              <Link
                href={buildHref(params, { isolated: "" })}
                className="rounded border border-border bg-background px-2.5 py-1 font-medium text-foreground transition-colors hover:bg-muted"
              >
                Remover isolamento (ver todos)
              </Link>
            ) : null}
            <Link
              href={buildHref(params, {
                selected_campaigns: "",
                selected_adsets: "",
                selected_ads: "",
                isolated: "",
              })}
              className="rounded border border-destructive/40 bg-destructive/10 px-2.5 py-1 font-medium text-destructive transition-colors hover:bg-destructive/20"
            >
              Limpar todas as seleções
            </Link>
          </div>
        </div>
      ) : null}

      {!meta.configured ? (
        <Card className="flex items-start gap-3 p-4">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber" />
          <p className="text-sm text-muted-foreground">
            Nenhuma conta de anúncio da Meta conectada nesta área. Conecte em{" "}
            <strong>Integrações</strong> para ver campanhas.
          </p>
        </Card>
      ) : null}

      {meta.errors.length > 0 ? (
        <Card className="flex items-start gap-3 p-4">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div className="min-w-0 text-sm">
            <p className="font-medium">Falha ao ler a Meta</p>
            <ul className="mt-1 space-y-0.5 font-mono text-xs text-muted-foreground">
              {meta.errors.map((err) => (
                <li key={err} className="truncate">
                  {err}
                </li>
              ))}
            </ul>
          </div>
        </Card>
      ) : null}

      {/* Boxes reordenáveis com Grip (6 pontinhos) e layout magnético */}
      <ReorderableBoxes
        storageKey="dashia_campanhas_boxes_order"
        className="grid-cols-1 lg:grid-cols-2 gap-3"
        items={[
          {
            id: "table",
            className: "lg:col-span-2",
            children: (
              <Card>
                <CampaignsTable
                  rows={rows}
                  currency={currency}
                  canEdit={meta.configured}
                  columnOrder={
                    settings?.campaign_columns ?? DEFAULT_SETTINGS.campaign_columns
                  }
                  level={level}
                  selectedCampaigns={selectedCampaignIds}
                  selectedAdsets={selectedAdsetIds}
                  selectedAds={selectedAdIds}
                  isIsolated={isIsolated}
                />
              </Card>
            ),
          },
          {
            id: "top_ads",
            className: "lg:col-span-1",
            children: (
              <Card className="h-full">
                <div className="border-b border-border p-4">
                  <span className="micro-label">
                    Top 5 Anúncios ({attribution === "meta" ? "Vendas Meta" : "Vendas Cakto"})
                  </span>
                </div>
                {topAds.length === 0 ? (
                  <p className="p-6 text-center text-sm text-muted-foreground">
                    Sem vendas atribuídas a anúncios no período.
                  </p>
                ) : (
                  <ul className="divide-y divide-border">
                    {topAds.map((ad) => (
                      <li
                        key={ad.adId}
                        className="flex items-center justify-between gap-3 px-4 py-2.5"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {adNames.get(ad.adId) ?? `Anúncio ${ad.adId}`}
                          </p>
                          <p className="font-mono text-[0.65rem] text-muted-foreground">
                            {ad.adId} · {formatNumber(ad.sales)} vendas
                          </p>
                        </div>
                        <span className="sensitive shrink-0 font-mono text-sm font-semibold text-primary tabular">
                          {formatCurrency(ad.revenue, currency)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            ),
          },
          {
            id: "funnel",
            className: "lg:col-span-1",
            children: (
              <Card className="h-full">
                <div className="border-b border-border p-4">
                  <span className="micro-label">Funil de Vendas</span>
                </div>

                {totalImpressions === 0 && totalClicks === 0 && totalSales === 0 ? (
                  <p className="p-6 text-center text-sm text-muted-foreground">
                    Sem veiculação nem vendas no período selecionado.
                  </p>
                ) : (
                  <>
                    <FunnelStep
                      label="Impressões"
                      value={totalImpressions}
                      previous={null}
                      base={totalImpressions}
                    />
                    <FunnelStep
                      label="Cliques"
                      value={totalClicks}
                      previous={totalImpressions}
                      base={totalImpressions}
                    />
                    <FunnelStep
                      label="Visitas à página"
                      value={totalViews}
                      previous={totalClicks}
                      base={totalImpressions}
                    />
                    <FunnelStep
                      label="Finalização de compra iniciada"
                      value={totalCheckouts}
                      previous={totalViews}
                      base={totalImpressions}
                    />
                    <FunnelStep
                      label={
                        attribution === "meta"
                          ? "Vendas (relatadas pela Meta)"
                          : "Vendas e Assinaturas (Cakto)"
                      }
                      value={totalSales}
                      previous={totalCheckouts}
                      base={totalImpressions}
                    />

                    <div className="space-y-1.5 px-4 py-3 text-xs text-muted-foreground">
                      <p>
                        Taxa clique → venda:{" "}
                        <span className="font-mono tabular text-foreground">
                          {totalClicks > 0
                            ? formatPercent((totalSales / totalClicks) * 100, 2)
                            : "—"}
                        </span>
                      </p>
                      <p>
                        Faturamento atribuído:{" "}
                        <span className="sensitive font-mono tabular text-foreground">
                          {formatCurrency(totalRevenue, currency)}
                        </span>
                        {totalSales > 0 ? (
                          <>
                            {" · ticket médio "}
                            <span className="sensitive font-mono tabular text-foreground">
                              {formatCurrency(totalRevenue / totalSales, currency)}
                            </span>
                          </>
                        ) : null}
                      </p>
                      {!hasOwnEvents ? (
                        <p className="pt-1">
                          Visitas à página e finalizações de compra vêm do pixel,
                          como a Meta reporta. As vendas vêm do checkout.
                        </p>
                      ) : null}
                    </div>
                  </>
                )}
              </Card>
            ),
          },
        ]}
      />
    </div>
  );
}

/**
 * Uma etapa do funil.
 *
 * `previous` alimenta o PERCENTUAL (conversão em relação à etapa anterior).
 * `base` alimenta a LARGURA da barra (proporção sobre o topo do funil) — sem
 * isso, uma etapa que converte 100% da anterior desenhava barra cheia e o
 * gráfico não afunilava, que era o oposto do que um funil deve mostrar.
 */
function FunnelStep({
  label,
  value,
  previous,
  base,
}: {
  label: string;
  value: number;
  previous: number | null;
  base: number;
}) {
  const rate = previous && previous > 0 ? (value / previous) * 100 : null;

  const raw = base > 0 ? (value / base) * 100 : value > 0 ? 100 : 0;
  // Piso visual: uma etapa com valor > 0 nunca some da tela (uma venda sobre
  // milhares de impressões daria uma barra de largura zero).
  const width = value > 0 ? Math.min(Math.max(raw, 1.5), 100) : 0;

  return (
    <div className="border-b border-border px-4 py-3">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span>{label}</span>
        <span className="font-mono tabular">
          {formatNumber(value)}
          {rate !== null ? (
            <span className="ml-2 text-xs text-muted-foreground">
              {formatPercent(rate, 1)}
            </span>
          ) : null}
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="fill-neon h-full rounded-full" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}
