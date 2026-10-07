import { timingSafeEqual } from "node:crypto";

/**
 * Helpers PUROS de parsing dos webhooks (sem acesso a banco), separados para
 * poderem ser testados isoladamente.
 */

/** Leitura segura de caminho aninhado ("data.purchase.transaction"). */
export function get(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") {
      if (Array.isArray(acc) && !(key in acc) && !/^\d+$/.test(key)) {
        const first = acc[0];
        if (first && typeof first === "object") {
          return (first as Record<string, unknown>)[key];
        }
      }
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

/**
 * Primeiro caminho que devolver algo útil. Os payloads das plataformas variam
 * entre versões, então cada campo é buscado em vários caminhos candidatos.
 */
export function firstString(obj: unknown, paths: string[]): string | null {
  for (const path of paths) {
    const value = get(obj, path);
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }
  return null;
}

/**
 * Converte um valor monetário em texto para número, tolerando os formatos que
 * as plataformas mandam: "397", "34.35", "49,90", "R$ 169,80", "1.234,56".
 *
 * Regras:
 *  - remove tudo que não for dígito, vírgula, ponto ou sinal (tira "R$", espaços);
 *  - com vírgula E ponto → formato BR: ponto é milhar, vírgula é decimal;
 *  - só com vírgula → vírgula é decimal;
 *  - só com ponto (ou só dígitos) → usa como está (decimal en-US ou inteiro).
 */
export function parseMoney(raw: string): number | null {
  let s = raw.replace(/[^\d,.-]/g, "");
  if (!s) return null;

  const hasComma = s.includes(",");
  const hasDot = s.includes(".");

  if (hasComma && hasDot) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    s = s.replace(",", ".");
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function firstNumber(obj: unknown, paths: string[]): number | null {
  for (const path of paths) {
    const value = get(obj, path);
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = parseMoney(value);
      if (parsed !== null) return parsed;
    }
  }
  return null;
}

/**
 * ad_id só é aceito se for NUMÉRICO (é o {{ad.id}} da Meta). Qualquer outra
 * coisa no `src`/`utm_content`/`xcod` (ex.: nome de campanha) é descartada.
 */
export function validAdId(value: string | null): string | null {
  if (!value) return null;
  return /^\d{5,25}$/.test(value) ? value : null;
}

/** De qual pedaço de um campo composto tirar o ad_id. */
export type SegmentPreference = "last" | "first" | "longest";

/**
 * Extrai o ad_id de um campo que pode vir COMPOSTO.
 *
 * O `xcod` da Hotmart é o caso motivador: rastreadores externos costumam
 * empilhar vários identificadores num campo só, separados por `_`, `|` ou `-`
 * (ex.: "1727809035401_17302278327851"). O valor inteiro não passa na validação
 * numérica, mas um dos pedaços é o `{{ad.id}}`.
 *
 * Quando o valor já é um id limpo, é devolvido como está — o caminho composto
 * nem é acionado.
 *
 * `preference` decide qual pedaço vale quando mais de um é numericamente
 * válido. Não há como adivinhar isso: depende de como o rastreador monta o
 * campo, então cada plataforma declara a sua no registro.
 */
export function extractAdId(
  value: string | null,
  preference: SegmentPreference = "last",
): string | null {
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  // Caminho feliz: o campo já é o id.
  const direct = validAdId(trimmed);
  if (direct) return direct;

  const segments = trimmed
    .split(/[_|,;:\-\s/]+/)
    .map((part) => validAdId(part.trim()))
    .filter((part): part is string => part !== null);

  if (segments.length === 0) return null;
  if (segments.length === 1) return segments[0];

  switch (preference) {
    case "first":
      return segments[0];
    case "longest":
      // Empate mantém o primeiro dos mais longos.
      return segments.reduce((best, current) =>
        current.length > best.length ? current : best,
      );
    case "last":
    default:
      return segments[segments.length - 1];
  }
}

/**
 * Primeiro caminho candidato que produzir um ad_id VÁLIDO.
 *
 * Diferente de `firstString`, que para no primeiro caminho com QUALQUER valor:
 * aqui um campo preenchido com lixo (ex.: `src=organico`) não impede que os
 * caminhos seguintes sejam tentados. Sem isso, um `src` sujo esconderia o
 * `xcod` que de fato tem o id.
 */
export function pickAdId(
  obj: unknown,
  paths: string[],
  preference: SegmentPreference = "last",
): string | null {
  for (const path of paths) {
    const found = extractAdId(firstString(obj, [path]), preference);
    if (found) return found;
  }
  return null;
}

/**
 * Nomes de país por extenso que algumas plataformas mandam no lugar do ISO
 * (ex.: a Ticto envia "Brasil"). Convertidos para alpha-2 para casar com o
 * formato da Vercel e não quebrar o agrupamento da tela de regiões.
 */
const COUNTRY_NAMES: Record<string, string> = {
  BRASIL: "BR",
  BRAZIL: "BR",
  PORTUGAL: "PT",
  "ESTADOS UNIDOS": "US",
  "UNITED STATES": "US",
};

/**
 * País normalizado para ISO alpha-2 — o mesmo formato que a Vercel entrega em
 * `x-vercel-ip-country`. Aceita o código de 2 letras direto ou converte alguns
 * nomes comuns por extenso. Qualquer outra coisa vira nulo (melhor nulo do que
 * "Brasil" misturado com "BR" quebrando o rótulo das regiões).
 */
export function normalizeCountry(value: string | null): string | null {
  if (!value) return null;
  const up = value.trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(up)) return up;
  return COUNTRY_NAMES[up] ?? null;
}

/** Comparação em tempo constante (tokens e assinaturas). */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
