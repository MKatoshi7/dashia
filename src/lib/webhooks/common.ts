import "server-only";

import { z } from "zod";

import { PLATFORM_IDS } from "@/lib/checkout/platforms";
import { decryptSecret } from "@/lib/crypto";
import { createAdminClient } from "@/lib/supabase/admin";

import { extractAdId, get } from "./parse";
import type { PurchaseStatus } from "./status";

// Helpers puros de parsing vivem em ./parse (testáveis fora do Next).
export {
  extractAdId,
  firstNumber,
  firstString,
  get,
  normalizeCountry,
  pickAdId,
  safeEqual,
  validAdId,
} from "./parse";

/* ------------------------------------------------------------------- área */

export type WebhookAreaSecret = {
  areaId: string;
  /** Segredo já decifrado; null quando ainda não foi configurado no painel. */
  secret: string | null;
};

/**
 * Resolve a área pelo token público da URL e devolve o segredo do webhook
 * daquela plataforma, já decifrado.
 *
 * IMPORTANTE: o token da URL serve apenas para ROTEAR o webhook até a área
 * certa. A AUTENTICAÇÃO é sempre pelo mecanismo nativo da plataforma
 * (hottok, header de token ou assinatura HMAC) — ver o registro em
 * `src/lib/checkout/platforms.ts`.
 */
export async function resolveWebhookArea(
  token: string,
  plataforma: string,
): Promise<WebhookAreaSecret | null> {
  try {
    const admin = createAdminClient();

    const { data: area } = await admin
      .from("areas")
      .select("id")
      .eq("public_token", token)
      .maybeSingle();

    if (!area) return null;

    const { data: integration } = await admin
      .from("checkout_integrations")
      .select("secret, enabled")
      .eq("area_id", area.id)
      .eq("plataforma", plataforma)
      .maybeSingle();

    // Integração desligada explicitamente: trata como não configurada.
    if (!integration?.secret || integration.enabled === false) {
      return { areaId: area.id, secret: null };
    }

    return {
      areaId: area.id,
      secret: await decryptSecret(integration.secret as string),
    };
  } catch (err) {
    console.error("[webhook] falha ao resolver área/segredo:", err);
    return null;
  }
}

/* --------------------------------------------------------------- gravação */

/** UTMs que a própria plataforma devolve nos parâmetros de rastreio. */
export type PurchaseUtm = {
  source: string | null;
  medium: string | null;
  campaign: string | null;
  term: string | null;
  content: string | null;
};

/** Localização do comprador, quando a plataforma envia o endereço. */
export type PurchaseGeo = {
  country: string | null;
  region: string | null;
  city: string | null;
};

export type PurchaseInput = {
  areaId: string;
  transactionId: string;
  /** Id do registro em `src/lib/checkout/platforms.ts`. */
  plataforma: string;
  status: PurchaseStatus;
  userId: string | null;
  email: string | null;
  telefone: string | null;
  produto: string | null;
  valor: number | null;
  moeda: string | null;
  adId: string | null;
  /**
   * Rastreio vindo do CHECKOUT. É a fonte principal quando não há captura
   * própria na landing page (um código externo empurra as UTMs para o checkout).
   */
  utm?: PurchaseUtm;
  geo?: PurchaseGeo;
  /** Papel no pedido (main / orderbump / upsell…) — ver src/lib/sales.ts. */
  orderRole?: string | null;
  /** Pedido principal deste item, quando é complemento (order bump…). */
  parentOrder?: string | null;
  raw: unknown;
};

const FreeText = z.string().nullable().optional();

/** Limites defensivos do que efetivamente é gravado em `purchases`. */
const PurchaseInputSchema = z.object({
  areaId: z.uuid(),
  transactionId: z.string().min(1).max(120),
  // A lista vem do registro de plataformas — mesma fonte do check do banco.
  plataforma: z.enum(PLATFORM_IDS as [string, ...string[]]),
  status: z.enum([
    "approved",
    "pending",
    "refunded",
    "chargeback",
    "canceled",
  ]),
  userId: z.string().max(64).nullable(),
  email: z.string().max(320).nullable(),
  telefone: z.string().max(32).nullable(),
  produto: z.string().max(255).nullable(),
  // Valores absurdos/NaN não entram (protege as métricas do painel).
  valor: z.number().finite().min(0).max(10_000_000).nullable(),
  moeda: z.string().max(8).nullable(),
  adId: z.string().regex(/^\d{5,25}$/).nullable(),
  // UTM/GEO são metadados: entram como texto livre e são CLIPADOS mais abaixo
  // em vez de rejeitados. Descartar uma venda por causa de uma UTM comprida
  // seria pior do que gravá-la truncada.
  utm: z
    .object({
      source: FreeText,
      medium: FreeText,
      campaign: FreeText,
      term: FreeText,
      content: FreeText,
    })
    .optional(),
  geo: z
    .object({ country: FreeText, region: FreeText, city: FreeText })
    .optional(),
  orderRole: FreeText,
  parentOrder: FreeText,
  raw: z.unknown(),
});

/** Corta o texto no limite da coluna em vez de rejeitar a gravação. */
function clip(value: string | null | undefined, max: number): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

type VisitorRow = {
  user_id: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  geo_country: string | null;
  geo_region: string | null;
  geo_city: string | null;
};

const VISITOR_COLUMNS =
  "user_id, utm_source, utm_medium, utm_campaign, utm_term, utm_content, geo_country, geo_region, geo_city";

/** Só dígitos, para casar telefone em formatos diferentes. */
function phoneDigits(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 8 ? digits.slice(-11) : null;
}

/**
 * Casa a compra com um visitante: primeiro por user_id (sck), depois por
 * e-mail e por telefone. Devolve o visitante e COMO ele foi encontrado.
 */
async function matchVisitor(
  areaId: string,
  userId: string | null,
  email: string | null,
  telefone: string | null,
): Promise<{ visitor: VisitorRow | null; match: string }> {
  const admin = createAdminClient();

  if (userId) {
    const { data } = await admin
      .from("visitors")
      .select(VISITOR_COLUMNS)
      .eq("area_id", areaId)
      .eq("user_id", userId)
      .maybeSingle();
    if (data) return { visitor: data as VisitorRow, match: "user_id" };
  }

  if (email) {
    const { data } = await admin
      .from("visitors")
      .select(VISITOR_COLUMNS)
      .eq("area_id", areaId)
      .ilike("email", email)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return { visitor: data as VisitorRow, match: "email" };
  }

  const digits = phoneDigits(telefone);
  if (digits) {
    const { data } = await admin
      .from("visitors")
      .select(VISITOR_COLUMNS)
      .eq("area_id", areaId)
      .ilike("telefone", `%${digits}%`)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return { visitor: data as VisitorRow, match: "telefone" };
  }

  return { visitor: null, match: "none" };
}

/**
 * UPSERT idempotente da compra (chave: transaction_id), já vinculada ao
 * visitante quando possível.
 *
 * Fallback de atribuição: se o webhook não trouxer ad_id, usa o utm_content do
 * visitante casado. Compras sem ad_id contam como orgânico/direto — nunca somem.
 */
export async function savePurchase(input: PurchaseInput): Promise<void> {
  // Validação (zod) dos campos JÁ EXTRAÍDOS. Impor schema ao payload bruto seria
  // frágil — cada plataforma muda o formato entre versões —, então validamos o
  // que de fato vai para o banco: tamanhos, tipos e faixas.
  const parsed = PurchaseInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(
      `Payload de compra inválido: ${parsed.error.issues[0]?.path.join(".")} — ${parsed.error.issues[0]?.message}`,
    );
  }
  const clean = parsed.data;

  const admin = createAdminClient();

  const { visitor, match } = await matchVisitor(
    clean.areaId,
    clean.userId,
    clean.email,
    clean.telefone,
  );

  // Ordem de precedência: o que o CHECKOUT devolveu vale mais que o que
  // ficou salvo no visitante — o webhook descreve a venda que aconteceu,
  // o visitante é só a última visita conhecida. Sem captura própria na
  // landing page, `visitor` é null e tudo vem daqui.
  const utm = clean.utm;
  const geo = clean.geo;

  const orderRole = clip(clean.orderRole, 32)?.toLowerCase() ?? null;
  const parentOrder = clip(clean.parentOrder, 120);

  // Complemento (order bump…) sem rastreio próprio herda o do pedido pai: é
  // a MESMA compra, veio do MESMO anúncio.
  const parent = parentOrder
    ? await findParentPurchase(clean.areaId, parentOrder)
    : null;

  // Fallback final. `extractAdId` também desmonta valores compostos aqui —
  // a rota já tentou os campos nativos com a preferência da plataforma.
  const adId =
    clean.adId ??
    extractAdId(clip(utm?.content, 512)) ??
    extractAdId(visitor?.utm_content ?? null) ??
    parent?.ad_id ??
    null;

  const { error } = await admin.from("purchases").upsert(
    {
      area_id: clean.areaId,
      transaction_id: clean.transactionId,
      user_id: clean.userId ?? visitor?.user_id ?? null,
      email: clean.email,
      telefone: clean.telefone,
      produto: clean.produto,
      valor: clean.valor,
      moeda: clean.moeda,
      status: clean.status,
      plataforma: clean.plataforma,
      utm_source:
        clip(utm?.source, 255) ?? visitor?.utm_source ?? parent?.utm_source ?? null,
      utm_medium:
        clip(utm?.medium, 255) ?? visitor?.utm_medium ?? parent?.utm_medium ?? null,
      utm_campaign:
        clip(utm?.campaign, 255) ?? visitor?.utm_campaign ?? parent?.utm_campaign ?? null,
      utm_term: clip(utm?.term, 255) ?? visitor?.utm_term ?? parent?.utm_term ?? null,
      utm_content:
        clip(utm?.content, 512) ?? visitor?.utm_content ?? parent?.utm_content ?? null,
      ad_id: adId,
      order_role: orderRole,
      parent_order: parentOrder,
      geo_country: clip(geo?.country, 2) ?? visitor?.geo_country ?? null,
      geo_region: clip(geo?.region, 64) ?? visitor?.geo_region ?? null,
      geo_city: clip(geo?.city, 120) ?? visitor?.geo_city ?? null,
      match,
      raw_webhook: clean.raw as Record<string, unknown>,
    },
    { onConflict: "transaction_id" },
  );

  if (error) throw error;

  // Pedido principal chegou DEPOIS dos complementos: preenche o rastreio que
  // eles não tinham. Falha aqui não invalida a compra já gravada.
  if (!parentOrder && adId) {
    await backfillChildren(clean.areaId, clean.transactionId, clean.raw, {
      ad_id: adId,
      utm_source: clip(utm?.source, 255),
      utm_medium: clip(utm?.medium, 255),
      utm_campaign: clip(utm?.campaign, 255),
      utm_term: clip(utm?.term, 255),
      utm_content: clip(utm?.content, 512),
    }).catch((err) => console.error("[webhook] backfill de order bump:", err));
  }
}

type ParentRow = {
  ad_id: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
};

const PARENT_COLUMNS =
  "ad_id, utm_source, utm_medium, utm_campaign, utm_term, utm_content";

/**
 * O pedido pai pode ser referenciado pelo id que usamos como transaction_id
 * ou por um id curto da plataforma (ex.: `refId` da Cakto, que fica no
 * raw_webhook). Tenta os dois.
 */
async function findParentPurchase(
  areaId: string,
  parentOrder: string,
): Promise<ParentRow | null> {
  const admin = createAdminClient();

  const byId = await admin
    .from("purchases")
    .select(PARENT_COLUMNS)
    .eq("area_id", areaId)
    .eq("transaction_id", parentOrder)
    .maybeSingle();
  if (byId.data) return byId.data as ParentRow;

  const byRef = await admin
    .from("purchases")
    .select(PARENT_COLUMNS)
    .eq("area_id", areaId)
    .eq("raw_webhook->data->>refId", parentOrder)
    .limit(1)
    .maybeSingle();
  return (byRef.data as ParentRow | null) ?? null;
}

/** Ids pelos quais os complementos podem apontar para este pedido. */
function orderAliases(transactionId: string, raw: unknown): string[] {
  const ref = get(raw, "data.refId");
  return typeof ref === "string" && ref && ref !== transactionId
    ? [transactionId, ref]
    : [transactionId];
}

async function backfillChildren(
  areaId: string,
  transactionId: string,
  raw: unknown,
  tracking: ParentRow,
): Promise<void> {
  const admin = createAdminClient();
  const patch = Object.fromEntries(
    Object.entries(tracking).filter(([, v]) => v !== null),
  );

  const { error } = await admin
    .from("purchases")
    .update(patch)
    .eq("area_id", areaId)
    .in("parent_order", orderAliases(transactionId, raw))
    .is("ad_id", null);

  if (error) throw error;
}
