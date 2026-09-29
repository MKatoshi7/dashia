/**
 * Versão da Graph/Marketing API da Meta — CONSTANTE ÚNICA.
 * Para atualizar a integração inteira, troque só este valor.
 *
 * Changelog: https://developers.facebook.com/docs/graph-api/changelog
 */
export const META_API_VERSION = "v25.0";

export const META_GRAPH_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

/**
 * Rate limit CONSERVADOR — bem abaixo do documentado pela Meta, de propósito.
 * O objetivo é nunca chegar perto do bloqueio; os dados vêm do cache.
 */
export const META_RATE_LIMIT = {
  /** Chamadas por conta de anúncio por janela. */
  max: 20,
  windowSeconds: 60,
};

/**
 * Cache dos insights. A atribuição da Meta é RETROATIVA: números de dias
 * recentes ainda mudam, então períodos que tocam os últimos dias são
 * revalidados com frequência bem maior que períodos já fechados.
 */
export const META_CACHE = {
  /** Período que inclui os últimos dias (dados ainda em movimento). */
  recentSeconds: 300,
  /** Período totalmente no passado (dados estáveis). */
  historicalSeconds: 86_400,
  /** A partir de quantos dias atrás um período é considerado "fechado". */
  recentWindowDays: 3,
};

/**
 * Tag de cache de TODA leitura da Meta. O botão "Atualizar" do header chama
 * `updateTag(META_CACHE_TAG)` para forçar dados frescos na hora.
 */
export const META_CACHE_TAG = "meta";
