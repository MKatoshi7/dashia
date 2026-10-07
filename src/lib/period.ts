/**
 * Seletor de período do header — filtra TODO o painel.
 * O período viaja na URL (?period=7d ou ?from=&to=), então é compartilhável e
 * fica disponível nos Server Components.
 *
 * CRÍTICO (Timezone): Todos os cálculos de data operam estritamente no fuso
 * horário de Brasília (America/Sao_Paulo, UTC-3) para evitar o bug onde
 * servidores em UTC (Vercel) viram o dia às 21:00 de Brasília (00:00 UTC),
 * resetando o dashboard antes do fim do dia.
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

/** Fuso horário oficial do sistema: Horário de Brasília (America/Sao_Paulo) */
export const APP_TIMEZONE = "America/Sao_Paulo";

/**
 * Retorna uma data no formato "YYYY-MM-DD" considerando o fuso horário de Brasília.
 * Nunca vira o dia antes da meia-noite local (evita resetar às 21h em servidores UTC).
 */
export function getTzYmd(date: Date = new Date(), tz: string = APP_TIMEZONE): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Desloca uma string "YYYY-MM-DD" por N dias no calendário. */
export function shiftYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days, 12, 0, 0));
  return dt.toISOString().slice(0, 10);
}

/**
 * Cria o início do dia (00:00:00.000) no fuso de Brasília.
 * Em UTC-3, 00:00:00 em Brasília corresponde a 03:00:00 UTC.
 */
export function startOfDayTz(ymd: string): Date {
  return new Date(`${ymd}T00:00:00-03:00`);
}

/**
 * Cria o fim do dia (23:59:59.999) no fuso de Brasília.
 * Em UTC-3, 23:59:59.999 em Brasília corresponde a 02:59:59.999 UTC do dia seguinte.
 */
export function endOfDayTz(ymd: string): Date {
  return new Date(`${ymd}T23:59:59.999-03:00`);
}

/** Formata uma data para exibição no fuso horário do painel (pt-BR em America/Sao_Paulo). */
export function formatTzDate(d: Date): string {
  return d.toLocaleDateString("pt-BR", { timeZone: APP_TIMEZONE });
}

/**
 * Resolve o período a partir dos searchParams no fuso de Brasília.
 * Default: 7 dias.
 */
export function resolvePeriod(params: {
  period?: string;
  from?: string;
  to?: string;
}): Period {
  const todayYmd = getTzYmd();
  const key = (params.period ?? "7d") as PeriodKey;

  if (key === "custom" && params.from && params.to) {
    const fromYmd = params.from.slice(0, 10);
    const toYmd = params.to.slice(0, 10);
    const from = startOfDayTz(fromYmd);
    const to = endOfDayTz(toYmd);
    if (!Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime())) {
      return {
        key: "custom",
        label: "Personalizado",
        from,
        to,
      };
    }
  }

  switch (key) {
    case "today":
      return {
        key: "today",
        label: "Hoje",
        from: startOfDayTz(todayYmd),
        to: endOfDayTz(todayYmd),
      };

    case "yesterday": {
      const yesterdayYmd = shiftYmd(todayYmd, -1);
      return {
        key: "yesterday",
        label: "Ontem",
        from: startOfDayTz(yesterdayYmd),
        to: endOfDayTz(yesterdayYmd),
      };
    }

    case "30d": {
      const start30d = shiftYmd(todayYmd, -29);
      return {
        key: "30d",
        label: "30 dias",
        from: startOfDayTz(start30d),
        to: endOfDayTz(todayYmd),
      };
    }

    case "7d":
    default: {
      const start7d = shiftYmd(todayYmd, -6);
      return {
        key: "7d",
        label: "7 dias",
        from: startOfDayTz(start7d),
        to: endOfDayTz(todayYmd),
      };
    }
  }
}
