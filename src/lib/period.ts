/**
 * Seletor de período do header — filtra TODO o painel.
 * O período viaja na URL (?period=7d ou ?from=&to=), então é compartilhável e
 * fica disponível nos Server Components.
 */

/**
 * Cookie com o último período escolhido (querystring: period/from/to). O proxy
 * o reaplica quando uma página do painel abre sem período na URL — assim trocar
 * de aba ou recarregar não volta para os 7 dias.
 */
export const PERIOD_COOKIE = "panel_period";
export const PERIOD_PARAMS = ["period", "from", "to"] as const;

export type PeriodKey = "today" | "yesterday" | "7d" | "30d" | "custom";

export const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: "today", label: "Hoje" },
  { key: "yesterday", label: "Ontem" },
  { key: "7d", label: "7 dias" },
  { key: "30d", label: "30 dias" },
  { key: "custom", label: "Personalizado" },
];

export type Period = {
  key: PeriodKey;
  label: string;
  from: Date;
  to: Date;
};

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

/**
 * Resolve o período a partir dos searchParams (já aguardados — no Next.js 16
 * `searchParams` é assíncrono). Default: 7 dias.
 */
export function resolvePeriod(params: {
  period?: string;
  from?: string;
  to?: string;
}): Period {
  const now = new Date();
  const key = (params.period ?? "7d") as PeriodKey;

  if (key === "custom" && params.from && params.to) {
    const from = new Date(params.from);
    const to = new Date(params.to);
    if (!Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime())) {
      return {
        key: "custom",
        label: "Personalizado",
        from: startOfDay(from),
        to: endOfDay(to),
      };
    }
  }

  switch (key) {
    case "today":
      return { key, label: "Hoje", from: startOfDay(now), to: endOfDay(now) };
    case "yesterday": {
      const y = addDays(now, -1);
      return { key, label: "Ontem", from: startOfDay(y), to: endOfDay(y) };
    }
    case "30d":
      return {
        key,
        label: "30 dias",
        from: startOfDay(addDays(now, -29)),
        to: endOfDay(now),
      };
    case "7d":
    default:
      return {
        key: "7d",
        label: "7 dias",
        from: startOfDay(addDays(now, -6)),
        to: endOfDay(now),
      };
  }
}
