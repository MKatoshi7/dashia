import "server-only";

/**
 * Cotação de moeda para converter o que a Meta reporta na moeda da CONTA
 * (ex.: USD) para a moeda da ÁREA (ex.: BRL).
 *
 * Fonte: AwesomeAPI (economia.awesomeapi.com.br) — pública, sem chave. Só
 * enviamos o par de moedas; nenhum dado do painel sai daqui. Cache de 1 h.
 * Quem precisa de outro valor (ex.: com IOF do cartão) fixa a cotação na conta.
 */
const FX_CACHE_SECONDS = 3600;

export async function getLiveRate(
  from: string,
  to: string,
): Promise<number | null> {
  if (from === to) return 1;

  try {
    const pair = `${from}-${to}`;
    const response = await fetch(
      `https://economia.awesomeapi.com.br/json/last/${pair}`,
      { next: { revalidate: FX_CACHE_SECONDS } },
    );
    if (!response.ok) return null;

    const body = (await response.json()) as Record<string, { bid?: string }>;
    const bid = Number(body[`${from}${to}`]?.bid);
    return Number.isFinite(bid) && bid > 0 ? bid : null;
  } catch {
    return null;
  }
}
