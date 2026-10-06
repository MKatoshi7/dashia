import { createHmac } from "node:crypto";

import { json } from "@/lib/capture";
import {
  getPlatform,
  mapStatus,
  type CheckoutPlatform,
} from "@/lib/checkout/platforms";
import { rateLimit } from "@/lib/rate-limit";
import {
  extractAdId,
  firstNumber,
  firstString,
  get,
  normalizeCountry,
  pickAdId,
  resolveWebhookArea,
  safeEqual,
  savePurchase,
} from "@/lib/webhooks/common";
import { recordWebhookLog } from "@/lib/webhooks/logs";

/**
 * POST /api/webhook/<plataforma>?a=<public_token_da_area>
 *
 * Rota ÚNICA para todas as plataformas de checkout. Tudo que varia — como
 * autenticar, onde estão os campos, como traduzir o status — vem do registro em
 * `src/lib/checkout/platforms.ts`. Adicionar plataforma não exige código novo.
 *
 * Autenticação: sempre pelo mecanismo NATIVO da plataforma. O token na URL só
 * ROTEIA para a área — nunca autoriza nada.
 *
 * NADA é enviado para Meta/GA4 aqui — apenas gravamos a compra.
 */

export const dynamic = "force-dynamic";

/* ------------------------------------------------------------ autenticação */

/**
 * Confere a prova de autenticidade conforme o modo declarado pela plataforma.
 * Todas as comparações são em tempo constante.
 */
function authenticate(
  platform: CheckoutPlatform,
  secret: string,
  request: Request,
  url: URL,
  rawBody: string,
  payload: unknown,
): boolean {
  const { auth } = platform;
  const cleanSecret = secret.trim();

  if (auth.mode === "header-token") {
    return (auth.headers ?? []).some((name) => {
      const value = request.headers.get(name);
      if (!value) return false;
      // Aceita "Bearer <token>" além do valor cru (comum em `authorization`).
      const bare = value.replace(/^Bearer\s+/i, "").trim();
      return (
        safeEqual(bare, cleanSecret) ||
        bare.toLowerCase() === cleanSecret.toLowerCase()
      );
    });
  }

  if (auth.mode === "body-token") {
    const provided = firstString(payload, auth.bodyPaths ?? []);
    if (
      provided &&
      (safeEqual(provided.trim(), cleanSecret) ||
        provided.trim().toLowerCase() === cleanSecret.toLowerCase())
    ) {
      return true;
    }

    // Headers declarados valem como alternativa
    const headerMatch = (auth.headers ?? []).some((name) => {
      const value = request.headers.get(name);
      if (!value) return false;
      const bare = value.replace(/^Bearer\s+/i, "").trim();
      return (
        safeEqual(bare, cleanSecret) ||
        bare.toLowerCase() === cleanSecret.toLowerCase()
      );
    });
    if (headerMatch) return true;

    // Query params como alternativa (?secret=... ou ?token=...)
    const querySecret =
      url.searchParams.get("secret") ?? url.searchParams.get("token");
    if (
      querySecret &&
      (safeEqual(querySecret.trim(), cleanSecret) ||
        querySecret.trim().toLowerCase() === cleanSecret.toLowerCase())
    ) {
      return true;
    }

    return false;
  }

  // hmac: assinatura do CORPO BRUTO, em header ou query string.
  const candidates = [
    ...(auth.headers ?? []).map((h) => request.headers.get(h)),
    ...(auth.queryParams ?? []).map((q) => url.searchParams.get(q)),
  ].filter((v): v is string => Boolean(v));

  if (candidates.length === 0) return false;

  const algorithms = auth.algorithms ?? ["sha256"];

  return candidates.some((provided) => {
    // Alguns provedores prefixam o algoritmo: "sha256=<hex>".
    const clean = provided.includes("=")
      ? provided.slice(provided.indexOf("=") + 1)
      : provided;

    return algorithms.some((algo) => {
      const digest = createHmac(algo, cleanSecret).update(rawBody).digest("hex");
      return (
        safeEqual(digest, clean.trim().toLowerCase()) ||
        digest.toLowerCase() === clean.trim().toLowerCase()
      );
    });
  });
}

/* --------------------------------------------------------------- extração */

/**
 * Valor monetário. Só divide por 100 quando a plataforma DECLARA centavos.
 * Quando é `"unknown"`, usamos como está — de propósito: gravar um valor 100×
 * menor passaria despercebido, enquanto o valor cru é conferível contra a
 * venda real e o `raw_webhook` fica salvo de qualquer jeito.
 */
function normalizeAmount(
  platform: CheckoutPlatform,
  value: number | null,
): number | null {
  if (value === null) return null;
  if (platform.amountInCents === true && Number.isInteger(value)) {
    return value / 100;
  }
  return value;
}

/** Desempacota "ig|social|bio|null|null" na ordem declarada pela plataforma. */
function unpackPiped(
  platform: CheckoutPlatform,
  packed: string | null,
): Partial<Record<"source" | "medium" | "campaign" | "term" | "content", string>> {
  const order = platform.pipedTrackingOrder;
  if (!order || !packed || !packed.includes("|")) return {};

  const parts = packed.split("|");
  const out: Record<string, string> = {};

  order.forEach((key, index) => {
    const raw = parts[index]?.trim();
    // Rastreadores escrevem "null"/"undefined" literalmente quando não têm valor.
    if (raw && !/^(null|undefined|-)$/i.test(raw)) out[key] = raw;
  });

  return out;
}

/**
 * Achata um array de rastreio `[{chave, valor}]` (ex.: `saleMetas` da Greenn)
 * num objeto exposto em `_meta`, para que os caminhos possam referenciar
 * `_meta.utm_content`. Devolve o payload como está quando a plataforma não
 * declara `metaArray` ou o array não existe.
 */
function withMeta(platform: CheckoutPlatform, payload: unknown): unknown {
  const cfg = platform.metaArray;
  if (!cfg || typeof payload !== "object" || payload === null) return payload;

  const arr = get(payload, cfg.path);
  if (!Array.isArray(arr)) return payload;

  const meta: Record<string, unknown> = {};
  for (const item of arr) {
    if (item && typeof item === "object") {
      const k = (item as Record<string, unknown>)[cfg.keyField];
      const v = (item as Record<string, unknown>)[cfg.valueField];
      if (typeof k === "string") meta[k] = v;
    }
  }

  return { ...(payload as Record<string, unknown>), _meta: meta };
}

/** Trata os valores-sentinela da plataforma ("Não Informado") como vazio. */
function deplaceholder(
  platform: CheckoutPlatform,
  value: string | null,
): string | null {
  if (!value || !platform.placeholders) return value;
  const v = value.trim().toLowerCase();
  return platform.placeholders.some((p) => p.trim().toLowerCase() === v)
    ? null
    : value;
}

/* ------------------------------------------------------------------ rotas */

/** Pings e verificações de integridade de webhooks (GET/HEAD) */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ plataforma: string }> },
) {
  const { plataforma } = await params;
  const platform = getPlatform(plataforma);
  if (!platform) return json({ error: "unknown_platform" }, 404);
  return json({ ok: true, platform: platform.id, status: "ready" }, 200);
}

export async function HEAD() {
  return new Response(null, { status: 200 });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ plataforma: string }> },
) {
  const { plataforma } = await params;

  const platform = getPlatform(plataforma);
  if (!platform) return json({ error: "unknown_platform" }, 404);

  const url = new URL(request.url);
  const token = url.searchParams.get("a") ?? "";

  // Rate limit generoso: não pode derrubar rajadas legítimas da plataforma.
  const rateLimitKey = token
    ? `webhook:${platform.id}:${token}`
    : `webhook:${platform.id}`;
  if (!(await rateLimit(rateLimitKey, 600, 60))) {
    return json({ error: "rate_limited" }, 429);
  }

  // Resolve área pelo token público ou fallback na área com integração ativa
  const area = await resolveWebhookArea(token, platform.id);
  if (!area) return json({ error: "area_not_found" }, 404);
  if (!area.secret) return json({ error: "secret_not_configured" }, 503);

  // Corpo BRUTO primeiro: o HMAC precisa dos bytes exatos, antes do parse.
  const rawBody = await request.text();

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  if (!authenticate(platform, area.secret, request, url, rawBody, payload)) {
    if (!platform.confirmed) {
      console.warn(
        `[webhook/${platform.id}] autenticação falhou. Headers recebidos: ${[...request.headers.keys()].join(", ")}`,
      );
    }
    await recordWebhookLog({
      areaId: area.areaId,
      plataforma: platform.id,
      event: firstString(payload, platform.paths.event ?? []),
      status: "error",
      errorMessage: "Assinatura/token inválido",
      payload,
    });
    return json({ error: "invalid_signature" }, 401);
  }

  // Achata arrays de rastreio (ex.: `saleMetas` da Greenn) em `_meta.<chave>`.
  const source = withMeta(platform, payload);
  const { paths } = platform;

  // Eventos de teste enviados por painéis da Cakto e gateways
  const eventName = firstString(source, paths.event ?? []);
  if (
    eventName &&
    /^(event_test|test|webhook_test|ping)$/i.test(eventName.trim())
  ) {
    await recordWebhookLog({
      areaId: area.areaId,
      plataforma: platform.id,
      event: eventName,
      status: "test",
      payload,
    });
    return json({ ok: true, message: "test_event_received" }, 200);
  }

  // Eventos que não são venda (ex.: abandono de checkout): 200 sem gravar
  if (
    eventName &&
    platform.ignoreEvents?.some((needle) =>
      eventName.toLowerCase().includes(needle.toLowerCase()),
    )
  ) {
    await recordWebhookLog({
      areaId: area.areaId,
      plataforma: platform.id,
      event: eventName,
      status: "ignored",
      errorMessage: "Evento ignorado (ex.: checkout abandonado)",
      payload,
    });
    return json({ ok: true, ignored: "event" }, 200);
  }

  // Leitura de texto tratando os valores-sentinela da plataforma como vazio.
  const pick = (candidates: string[] | undefined) =>
    deplaceholder(platform, firstString(source, candidates ?? []));

  const transactionId = firstString(source, paths.transaction);
  if (!transactionId) {
    // Sem chave de idempotência não dá para gravar; 200 evita reenvio infinito.
    console.warn(`[webhook/${platform.id}] payload sem transaction id`);
    await recordWebhookLog({
      areaId: area.areaId,
      plataforma: platform.id,
      event: eventName,
      status: "ignored",
      errorMessage: "Payload sem transaction id",
      payload,
    });
    return json({ ok: true, ignored: "missing_transaction" }, 200);
  }

  const status = mapStatus(platform, firstString(source, paths.status), eventName);

  const rawUserId = pick(paths.userId);
  const piped = unpackPiped(platform, rawUserId);

  /**
   * UTMs: o que veio em campo próprio ganha; o pacote por pipe entra como
   * complemento. É o que faz a atribuição funcionar sem captura própria.
   */
  const utm = {
    source: pick(paths.utmSource) ?? piped.source ?? null,
    medium: pick(paths.utmMedium) ?? piped.medium ?? null,
    campaign: pick(paths.utmCampaign) ?? piped.campaign ?? null,
    term: pick(paths.utmTerm) ?? piped.term ?? null,
    content: pick(paths.utmContent) ?? piped.content ?? null,
  };

  /**
   * ad_id, em ordem de precedência: campos nativos da plataforma → utm_content
   * → última posição do pacote por pipe.
   */
  const segment = platform.adIdSegment;
  const adId =
    pickAdId(source, paths.adId, segment) ??
    extractAdId(utm.content, segment) ??
    extractAdId(piped.content ?? null, segment);

  const geo = {
    country: normalizeCountry(pick(paths.geoCountry)),
    region: pick(paths.geoRegion),
    city: pick(paths.geoCity),
  };

  const valor = normalizeAmount(platform, firstNumber(source, paths.value));
  const produto = pick(paths.product);
  const email = pick(paths.email);
  const telefone = pick(paths.phone);

  try {
    await savePurchase({
      areaId: area.areaId,
      transactionId,
      plataforma: platform.id,
      status,
      // Se o `sck` era um pacote de UTMs, ele NÃO é um id de visitante.
      userId: piped.source ? null : rawUserId,
      email,
      telefone,
      produto,
      valor,
      moeda: pick(paths.currency),
      adId,
      // Order bump / upsell: soma no faturamento, mas não é venda nova.
      orderRole: pick(paths.offerType),
      parentOrder: pick(paths.parentOrder),
      // raw_webhook = payload ORIGINAL (sem o _meta sintético).
      raw: payload,
      utm,
      geo,
    });

    await recordWebhookLog({
      areaId: area.areaId,
      plataforma: platform.id,
      event: eventName,
      status: "processed",
      transactionId,
      adId,
      produto,
      valor,
      email,
      telefone,
      utmSource: utm.source,
      utmMedium: utm.medium,
      utmCampaign: utm.campaign,
      utmTerm: utm.term,
      utmContent: utm.content,
      payload,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[webhook/${platform.id}] falha ao gravar compra:`, err);

    await recordWebhookLog({
      areaId: area.areaId,
      plataforma: platform.id,
      event: eventName,
      status: "error",
      transactionId,
      adId,
      produto,
      valor,
      email,
      telefone,
      errorMessage: message,
      payload,
    });

    // Responde 200 para a Cakto/plataforma registrar entrega bem-sucedida
    // e não ficar marcando webhook como falha/negativo nem desativar a integração.
    return json({ ok: true, ignored: "storage_error", detail: message }, 200);
  }

  return json({ ok: true }, 200);
}
