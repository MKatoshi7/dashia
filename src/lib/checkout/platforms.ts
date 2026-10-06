/**
 * REGISTRO DE PLATAFORMAS DE CHECKOUT — fonte única da verdade.
 *
 * Cada plataforma declara: como se autentica, onde ficam os campos no payload
 * e como conectar. A rota de webhook é genérica e lê tudo daqui, então
 * adicionar ou corrigir uma plataforma é editar uma entrada deste arquivo —
 * não escrever código novo.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ SOBRE `confirmed`                                                        │
 * │                                                                          │
 * │ `confirmed: true` significa que a ESTRUTURA do payload (caminhos dos     │
 * │ campos, formato do valor e autenticação) foi verificada contra um envio  │
 * │ REAL. `false` significa que ainda há um ponto não confirmado — a UI      │
 * │ avisa isso na tela.                                                      │
 * │                                                                          │
 * │ Nada é perdido enquanto não se confirma: o `raw_webhook` é sempre salvo, │
 * │ mesmo quando a extração falha. A primeira venda real revela os caminhos  │
 * │ corretos e a correção é feita aqui.                                      │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Este arquivo é PURO (sem `server-only`): a UI também o importa para montar
 * a lista de plataformas e as instruções de conexão.
 */

/** Como o webhook prova que é legítimo. */
export type AuthMode =
  /** Segredo vem num header e é comparado em tempo constante. */
  | "header-token"
  /** Segredo vem num campo do corpo JSON, comparado em tempo constante. */
  | "body-token"
  /** Assinatura HMAC do CORPO BRUTO, em header ou query string. */
  | "hmac";

export type PlatformAuth = {
  mode: AuthMode;
  /** Nomes de header candidatos (minúsculos). Para `header-token` e `hmac`. */
  headers?: string[];
  /** Parâmetros de query candidatos (para HMAC em query, ex.: Kiwify). */
  queryParams?: string[];
  /**
   * Caminhos candidatos no corpo (para `body-token`). Com `headers` também
   * declarados, eles valem como alternativa ao corpo.
   */
  bodyPaths?: string[];
  /** Algoritmos aceitos para HMAC, na ordem de tentativa. */
  algorithms?: ("sha256" | "sha1")[];
};

/** Caminhos candidatos de cada campo, tentados em ordem. */
export type PlatformPaths = {
  transaction: string[];
  status: string[];
  event?: string[];
  value: string[];
  currency?: string[];
  email: string[];
  phone?: string[];
  product?: string[];
  /** Rastreio: onde o ad_id pode chegar. */
  adId: string[];
  /** Identificador do visitante (só útil com captura própria). */
  userId?: string[];
  utmSource?: string[];
  utmMedium?: string[];
  utmCampaign?: string[];
  utmTerm?: string[];
  utmContent?: string[];
  geoCountry?: string[];
  geoRegion?: string[];
  geoCity?: string[];
  /**
   * Papel do item no pedido (ex.: Cakto `offer_type`: main / orderbump /
   * upsell / downsell). Item que não é "main" soma no faturamento mas NÃO
   * conta como venda nova — um pedido com order bump é UMA venda.
   */
  offerType?: string[];
  /** Pedido principal ao qual este item pertence (ex.: Cakto `parent_order`). */
  parentOrder?: string[];
};

export type CheckoutPlatform = {
  id: string;
  label: string;
  /** Estrutura do payload verificada contra um envio real? */
  confirmed: boolean;
  /** Valores chegam em centavos (inteiro dividido por 100)? */
  amountInCents: boolean | "unknown";
  /** Qual parâmetro o código externo deve usar no link do checkout. */
  trackingParam: string;
  auth: PlatformAuth;
  /** Rótulo e dica do campo de segredo na tela de Integrações. */
  secretLabel: string;
  secretHint: string;
  /**
   * Alguns rastreadores externos empacotam várias UTMs num único campo,
   * separadas por `|` (ex.: o `sck` da Hotmart chega como
   * "ig|social|bio|null|null"). Quando declarado, o campo `userId` é
   * desempacotado nesta ordem e usado como fonte das UTMs.
   */
  pipedTrackingOrder?: ("source" | "medium" | "campaign" | "term" | "content")[];
  /**
   * Quando o campo do `ad_id` vem COMPOSTO (vários ids num campo só, separados
   * por `_`, `|` ou `-`), qual pedaço é o `{{ad.id}}`.
   *   last    → último pedaço numérico (padrão; o id costuma ser o mais específico)
   *   first   → primeiro
   *   longest → o mais longo (útil quando o outro pedaço é um timestamp curto)
   * Ignorado quando o campo já é um id limpo.
   */
  adIdSegment?: "last" | "first" | "longest";
  /**
   * Valores-sentinela que a plataforma manda no lugar de "vazio" (ex.: a Ticto
   * envia "Não Informado" nos campos de rastreio não preenchidos). Tratados
   * como null na extração, para não gravar "Não Informado" como utm_source.
   */
  placeholders?: string[];
  /**
   * Algumas plataformas mandam o rastreio como um ARRAY de {chave, valor}
   * (ex.: a Greenn usa `saleMetas: [{meta_key, meta_value}, ...]`). Quando
   * declarado, a rota achata esse array num objeto acessível por
   * `_meta.<chave>` — então os caminhos podem referenciar `_meta.utm_content`.
   */
  metaArray?: { path: string; keyField: string; valueField: string };
  /**
   * Eventos que NÃO são venda e devem ser ignorados (respondidos com 200 para
   * não haver reenvio). Comparação por substring, sem diferenciar maiúsculas.
   */
  ignoreEvents?: string[];
  /** Passo a passo de conexão, mostrado quando a plataforma é selecionada. */
  steps: string[];
  /** Observações honestas sobre o que ainda não foi verificado. */
  caveats?: string[];
  paths: PlatformPaths;
  /** Mapeia o status da plataforma para o status interno. */
  statusMap: Record<string, InternalStatus>;
};

export type InternalStatus =
  | "approved"
  | "pending"
  | "refunded"
  | "chargeback"
  | "canceled";

/**
 * Status comuns a quase todas as plataformas brasileiras. Cada entrada do
 * registro pode acrescentar ou sobrescrever os seus.
 * Chaves em MAIÚSCULO — a comparação normaliza antes de consultar.
 */
const COMMON_STATUS: Record<string, InternalStatus> = {
  APPROVED: "approved",
  APROVADA: "approved",
  APROVADO: "approved",
  PAID: "approved",
  PAGO: "approved",
  COMPLETED: "approved",
  COMPLETE: "approved",
  ACTIVE: "approved",
  AUTHORIZED: "approved",

  PENDING: "pending",
  PENDENTE: "pending",
  WAITING_PAYMENT: "pending",
  AGUARDANDO_PAGAMENTO: "pending",
  PROCESSING: "pending",
  ABANDONED: "pending",

  REFUNDED: "refunded",
  REEMBOLSADO: "refunded",
  REFUND: "refunded",

  CHARGEBACK: "chargeback",

  CANCELED: "canceled",
  CANCELLED: "canceled",
  CANCELADO: "canceled",
  EXPIRED: "canceled",
  REJECTED: "canceled",
  REFUSED: "canceled",
  RECUSADO: "canceled",
};

export const CHECKOUT_PLATFORMS: CheckoutPlatform[] = [
  /* ------------------------------------------------------------ HOTMART */
  {
    id: "hotmart",
    label: "Hotmart",
    confirmed: true,
    amountInCents: false,
    // Confirmado nesta instalação: o ad_id chega pelo `xcod`, não pelo `src`.
    trackingParam: "xcod",
    auth: { mode: "header-token", headers: ["x-hotmart-hottok"] },
    // Observado num payload real: sck = "ig|social|bio|null|null".
    pipedTrackingOrder: ["source", "medium", "campaign", "term", "content"],
    /**
     * Nesta instalação o `xcod` chega LIMPO — só o {{ad.id}} —, então o
     * desmonte de campo composto nem é acionado. Fica declarado como rede de
     * segurança: se algum dia o rastreador passar a empilhar valores
     * ("<algo>_<ad_id>"), o último pedaço numérico é o que vale.
     */
    adIdSegment: "last",
    secretLabel: "Hottok",
    secretHint: "Ferramentas → Webhook → copie o hottok da sua conta",
    steps: [
      "Na Hotmart, abra Ferramentas → Webhook (Notificações).",
      "Cole a URL de webhook mostrada acima e salve.",
      "Marque os eventos de compra (aprovada, reembolso, chargeback).",
      "Copie o hottok gerado e cole no campo abaixo.",
      "No link do checkout, seu código externo deve enviar xcod=<ad_id>. O painel lê o ad_id de origin.xcod.",
    ],
    caveats: [
      "Confirmado com payload real (versão 2.0.0): o valor vem em REAIS e o país em country_iso.",
      "O ad_id chega em origin.xcod — LIMPO, só os dígitos do {{ad.id}}. O src é lido apenas como alternativa.",
      "O sck vem com as UTMs empacotadas por pipe (\"ig|social|bio|null|null\") e é desempacotado — não é id de visitante.",
    ],
    paths: {
      transaction: [
        "data.purchase.transaction",
        "data.purchase.transaction_id",
        "data.transaction",
      ],
      status: ["data.purchase.status", "data.status", "status"],
      event: ["event"],
      value: [
        "data.purchase.price.value",
        "data.purchase.full_price.value",
        "data.purchase.original_offer_price.value",
      ],
      currency: [
        "data.purchase.price.currency_value",
        "data.purchase.price.currency_code",
      ],
      email: ["data.buyer.email", "data.subscriber.email"],
      phone: ["data.buyer.checkout_phone", "data.buyer.phone"],
      product: ["data.product.name", "data.product.id"],
      adId: [
        "data.purchase.origin.xcod",
        "data.origin.xcod",
        "data.purchase.xcod",
        "data.purchase.origin.src",
        "data.purchase.src",
        "data.origin.src",
        "data.purchase.origin.utm_content",
      ],
      userId: ["data.purchase.origin.sck", "data.purchase.sck"],
      utmSource: [
        "data.purchase.origin.utm_source",
        "data.purchase.tracking.utm_source",
      ],
      utmMedium: [
        "data.purchase.origin.utm_medium",
        "data.purchase.tracking.utm_medium",
      ],
      utmCampaign: [
        "data.purchase.origin.utm_campaign",
        "data.purchase.tracking.utm_campaign",
      ],
      utmTerm: ["data.purchase.origin.utm_term"],
      utmContent: [
        "data.purchase.origin.utm_content",
        "data.purchase.origin.src",
      ],
      geoCountry: [
        "data.buyer.address.country_iso",
        "data.buyer.address.countryISO",
      ],
      geoRegion: ["data.buyer.address.state"],
      geoCity: ["data.buyer.address.city"],
    },
    statusMap: {
      ...COMMON_STATUS,
      STARTED: "pending",
      BILLET_PRINTED: "pending",
      PRINTED_BILLET: "pending",
      UNDER_ANALISYS: "pending", // grafia da própria Hotmart
      UNDER_ANALYSIS: "pending",
      DELAYED: "pending",
      PROTESTED: "chargeback",
      PROTEST: "chargeback",
      BLOCKED: "canceled",
      OVERDUE: "canceled",
    },
  },

  /* ------------------------------------------------------------- KIWIFY */
  {
    id: "kiwify",
    label: "Kiwify",
    confirmed: true,
    // CONFIRMADO num payload real: charge_amount 47832 = R$ 478,32
    // (product_base_price 39700 = R$ 397,00). Centavos.
    amountInCents: true,
    trackingParam: "utm_content",
    auth: {
      mode: "hmac",
      queryParams: ["signature"],
      algorithms: ["sha256", "sha1"],
    },
    // O sck da Kiwify chega COMPOSTO ("<timestamp>_<ad_id>"), como o xcod da
    // Hotmart. Usamos o último pedaço numérico.
    adIdSegment: "last",
    secretLabel: "Token de assinatura",
    secretHint: "Apps → Webhooks → copie o token do webhook",
    steps: [
      "Na Kiwify, abra Apps → Webhooks.",
      "Cole a URL de webhook mostrada acima.",
      "Marque os eventos de compra.",
      "Copie o token de assinatura e cole no campo abaixo.",
      "No link do checkout, envie utm_content=<ad_id> (ou deixe o rastreio no sck).",
    ],
    caveats: [
      "Confirmado com payload real: o valor vem em CENTAVOS (charge_amount 47832 = R$ 478,32).",
      "O ad_id costuma chegar em TrackingParameters.sck, composto (\"<timestamp>_<ad_id>\") — usamos o último pedaço. Confira contra o ad_id real e troque adIdSegment se preciso.",
      "A assinatura é HMAC em ?signature=; aceitamos sha1 e sha256 (ambos exigem o segredo).",
    ],
    paths: {
      transaction: ["order_id", "id"],
      status: ["order_status", "status"],
      event: ["webhook_event_type"],
      value: ["Commissions.charge_amount", "charge_amount"],
      currency: ["Commissions.currency", "currency"],
      email: ["Customer.email"],
      phone: ["Customer.mobile", "Customer.phone"],
      product: ["Product.product_name"],
      adId: [
        "TrackingParameters.utm_content",
        "TrackingParameters.sck",
        "TrackingParameters.src",
        "utm_content",
      ],
      // sck aqui carrega o rastreio do anúncio, não um id de visitante.
      userId: ["TrackingParameters.s1"],
      utmSource: ["TrackingParameters.utm_source"],
      utmMedium: ["TrackingParameters.utm_medium"],
      utmCampaign: ["TrackingParameters.utm_campaign"],
      utmTerm: ["TrackingParameters.utm_term"],
      utmContent: ["TrackingParameters.utm_content"],
      geoCountry: ["Customer.country"],
      geoRegion: ["Customer.state"],
      geoCity: ["Customer.city"],
    },
    statusMap: {
      ...COMMON_STATUS,
      // `chargedback` (com D) é a grafia da Kiwify — o casamento por substring
      // não pegaria "CHARGEBACK" dentro dela.
      CHARGEDBACK: "chargeback",
      COMPRA_APROVADA: "approved",
      COMPRA_RECUSADA: "canceled",
      COMPRA_REEMBOLSADA: "refunded",
      BOLETO_GERADO: "pending",
      PIX_GERADO: "pending",
      SUBSCRIPTION_RENEWED: "approved",
      SUBSCRIPTION_CANCELED: "canceled",
      SUBSCRIPTION_LATE: "pending",
    },
  },

  /* ------------------------------------------------------------ KIRVANO */
  {
    id: "kirvano",
    label: "Kirvano",
    confirmed: true,
    // CONFIRMADO num payload real: total_price = "R$ 169,80" (reais, formatado
    // como texto — o parser de moeda lida com "R$" e vírgula).
    amountInCents: false,
    trackingParam: "utm_content",
    auth: { mode: "header-token", headers: ["security-token", "x-kirvano-token"] },
    secretLabel: "Token de segurança",
    secretHint: "Configurações → Webhooks → token gerado ao criar o webhook",
    steps: [
      "Na Kirvano, abra Configurações → Webhooks e crie um novo webhook.",
      "Cole a URL mostrada acima e marque os eventos de venda.",
      "Copie o token de segurança e cole no campo abaixo.",
      "No link do checkout, envie utm_content=<ad_id>.",
    ],
    caveats: [
      "Confirmado com payload real: valor em REAIS (\"R$ 169,80\") e rastreio no objeto utm.*.",
      "O ad_id chega em utm.utm_content. Confirme na primeira venda que teve anúncio (o exemplo veio com valores de teste).",
      "O header de autenticação (security-token) é o padrão da Kirvano; confirme no primeiro webhook.",
    ],
    paths: {
      transaction: ["sale_id", "checkout_id", "id"],
      status: ["status", "event"],
      event: ["event"],
      value: ["total_price", "price"],
      currency: ["currency"],
      email: ["customer.email"],
      phone: ["customer.phone_number", "customer.phone"],
      product: ["products.0.name", "product.name"],
      adId: ["utm.utm_content", "utm.src", "utm_content"],
      userId: ["utm.sck", "sck"],
      utmSource: ["utm.utm_source"],
      utmMedium: ["utm.utm_medium"],
      utmCampaign: ["utm.utm_campaign"],
      utmTerm: ["utm.utm_term"],
      utmContent: ["utm.utm_content"],
      geoCountry: ["customer.country", "customer.address.country"],
      geoRegion: ["customer.state", "customer.address.state"],
      geoCity: ["customer.city", "customer.address.city"],
    },
    statusMap: { ...COMMON_STATUS, SALE_APPROVED: "approved" },
  },

  /* -------------------------------------------------------- PERFECT PAY */
  {
    id: "perfectpay",
    label: "Perfect Pay",
    confirmed: true,
    // CONFIRMADO num payload real: sale_amount 397 = R$ 397,00 (Plano 270). Reais.
    amountInCents: false,
    trackingParam: "utm_content",
    // CONFIRMADO: o token vem no corpo do postback (campo "token").
    auth: { mode: "body-token", bodyPaths: ["token"] },
    // metadata.utm_perfect chega composto ("<timestamp>_<ad_id>").
    adIdSegment: "last",
    secretLabel: "Token do postback",
    secretHint: "Ferramentas → Postback/API → token de integração",
    steps: [
      "Na Perfect Pay, abra Ferramentas → Postback (ou Integrações → API).",
      "Cole a URL mostrada acima como destino do postback.",
      "Copie o token de integração e cole no campo abaixo.",
      "No link do checkout, envie utm_content=<ad_id>.",
    ],
    caveats: [
      "Confirmado com payload real: valor em REAIS e token de autenticação no corpo.",
      "O ad_id chega em metadata.utm_perfect, composto (\"<timestamp>_<ad_id>\") — usamos o último pedaço. Também lemos metadata.utm_content.",
    ],
    paths: {
      transaction: ["code", "code_transaction", "sale_id"],
      status: ["sale_status_enum_key", "sale_status_detail", "status"],
      value: ["sale_amount", "amount"],
      currency: ["currency_enum_key", "currency"],
      email: ["customer.email"],
      phone: ["customer.phone_formated", "customer.phone_number"],
      product: ["product.name", "plan.name"],
      adId: [
        "metadata.utm_content",
        "metadata.utm_perfect",
        "metadata.src",
        "utm_content",
      ],
      userId: ["metadata.sck"],
      utmSource: ["metadata.utm_source"],
      utmMedium: ["metadata.utm_medium"],
      utmCampaign: ["metadata.utm_campaign"],
      utmTerm: ["metadata.utm_term"],
      utmContent: ["metadata.utm_content"],
      geoCountry: ["customer.country"],
      geoRegion: ["customer.state"],
      geoCity: ["customer.city"],
    },
    statusMap: { ...COMMON_STATUS, BILLET: "pending" },
  },

  /* --------------------------------------------------------------- TICTO */
  {
    id: "ticto",
    label: "Ticto",
    confirmed: false,
    // CONFIRMADO num payload real: paid_amount 10000 e producer.amount 11052 =
    // cms "110.52" → centavos.
    amountInCents: true,
    trackingParam: "utm_content",
    // CONFIRMADO: o token vem no corpo (campo "token").
    auth: { mode: "body-token", bodyPaths: ["token"] },
    // A Ticto preenche o rastreio vazio com o texto "Não Informado".
    placeholders: ["Não Informado", "Nao Informado"],
    secretLabel: "Token do webhook",
    secretHint: "Integrações → Webhooks → token exibido ao criar",
    steps: [
      "Na Ticto, abra Integrações → Webhooks e crie um novo.",
      "Cole a URL mostrada acima e marque os eventos de compra.",
      "Copie o token e cole no campo abaixo.",
      "No link do checkout, envie utm_content=<ad_id>.",
    ],
    caveats: [
      "Estrutura, valor (CENTAVOS) e autenticação (token no corpo) confirmados com payload real.",
      "NÃO CONFIRMADO: o ad_id. O exemplo veio com o rastreio em branco (\"Não Informado\"); o ad_id deve chegar em tracking.utm_content — confirme numa venda que teve anúncio.",
      "O país vem como \"Brasil\" (não ISO); o painel converte para BR. Estado e cidade são lidos normalmente.",
    ],
    paths: {
      transaction: ["order.transaction_hash", "order.hash", "transaction.hash"],
      status: ["status"],
      value: ["order.paid_amount", "item.amount"],
      currency: ["currency"],
      email: ["customer.email"],
      phone: ["customer.phone"],
      product: ["item.product_name", "product.name"],
      adId: ["tracking.utm_content", "tracking.src", "tracking.sck"],
      userId: ["customer.code"],
      utmSource: ["tracking.utm_source"],
      utmMedium: ["tracking.utm_medium"],
      utmCampaign: ["tracking.utm_campaign"],
      utmTerm: ["tracking.utm_term"],
      utmContent: ["tracking.utm_content"],
      geoCountry: ["customer.address.country"],
      geoRegion: ["customer.address.state"],
      geoCity: ["customer.address.city"],
    },
    statusMap: { ...COMMON_STATUS },
  },

  /* --------------------------------------------------------------- CAKTO */
  {
    id: "cakto",
    label: "Cakto",
    confirmed: true,
    // Doc oficial: amount 5.55 / baseAmount 5.55 → reais (decimal).
    amountInCents: false,
    trackingParam: "utm_content",
    // Autenticação: corpo { secret, event, data } e headers de assinatura/token.
    auth: {
      mode: "body-token",
      bodyPaths: [
        "secret",
        "data.secret",
        "token",
        "data.token",
        "webhook_secret",
      ],
      headers: [
        "x-cakto-signature",
        "x-cakto-secret",
        "x-secret",
        "authorization",
        "secret",
      ],
    },
    secretLabel: "Segredo do webhook",
    secretHint: "Cole aqui o segredo gerado no webhook da Cakto",
    steps: [
      "Na Cakto, abra Configurações → Webhooks e clique em Criar Webhook.",
      "Cole a URL mostrada acima.",
      "Marque os eventos de VENDAS e ASSINATURAS: Compra aprovada (purchase_approved), Assinatura criada (subscription_created), Assinatura renovada (subscription_renewed), e se desejar Pix/Boleto gerados, Reembolso e Chargeback. NÃO marque abandono de checkout.",
      "Copie o segredo do webhook gerado na Cakto e cole no campo abaixo.",
      "No link do checkout, envie utm_content={{ad.id}} (e as demais UTMs utm_source, utm_campaign, utm_medium).",
    ],
    caveats: [
      "Suporte a compras e assinaturas recorrentes (subscription_created, subscription_renewed).",
      "Order bump chega como pedido associado (offer_type = orderbump, parent_order): o valor soma no faturamento sem duplicar a contagem de clientes.",
      "Valores em reais (decimal, ex.: 97.00).",
    ],
    // Carrinho abandonado e pings de teste não são vendas.
    ignoreEvents: ["checkout_abandonment", "abandon", "test_ping", "ping"],
    paths: {
      transaction: [
        "data.id",
        "data.refId",
        "data.ref_id",
        "data.code",
        "data.subscription.id",
        "data.subscription_id",
        "data.charge.id",
        "data.order.id",
        "data.order_id",
        "data.uuid",
        "id",
        "refId",
        "results.0.id",
      ],
      status: [
        "data.status",
        "data.subscription.status",
        "data.charge.status",
        "status",
        "results.0.status",
      ],
      event: ["event", "event_type", "type"],
      value: [
        "data.amount",
        "data.baseAmount",
        "data.base_amount",
        "data.total",
        "data.value",
        "data.price",
        "data.subscription.amount",
        "data.subscription.price",
        "data.plan.amount",
        "data.plan.price",
        "data.charge.amount",
        "data.order.amount",
        "amount",
        "results.0.amount",
      ],
      currency: ["data.currency", "data.subscription.currency", "currency"],
      email: [
        "data.customer.email",
        "data.client.email",
        "data.buyer.email",
        "data.subscription.customer.email",
        "customer.email",
        "client.email",
        "results.0.customer.email",
        "email",
      ],
      phone: [
        "data.customer.phone",
        "data.customer.cellphone",
        "data.customer.telephone",
        "data.client.phone",
        "data.client.cellphone",
        "customer.phone",
        "phone",
      ],
      product: [
        "data.product.name",
        "data.plan.name",
        "data.subscription.plan.name",
        "data.subscription.product.name",
        "product.name",
        "plan.name",
        "results.0.product.name",
      ],
      adId: [
        "data.utm_content",
        "data.metadata.utm_content",
        "data.tracking.utm_content",
        "data.params.utm_content",
        "data.sck",
        "data.src",
        "utm_content",
        "sck",
        "src",
      ],
      userId: ["data.sck", "sck", "data.src", "src"],
      utmSource: [
        "data.utm_source",
        "data.metadata.utm_source",
        "data.tracking.utm_source",
        "data.params.utm_source",
        "data.src",
        "data.sck",
        "utm_source",
        "src",
        "sck",
      ],
      utmMedium: [
        "data.utm_medium",
        "data.metadata.utm_medium",
        "data.tracking.utm_medium",
        "data.params.utm_medium",
        "utm_medium",
      ],
      utmCampaign: [
        "data.utm_campaign",
        "data.metadata.utm_campaign",
        "data.tracking.utm_campaign",
        "data.params.utm_campaign",
        "utm_campaign",
      ],
      utmTerm: [
        "data.utm_term",
        "data.metadata.utm_term",
        "data.tracking.utm_term",
        "data.params.utm_term",
        "utm_term",
      ],
      utmContent: [
        "data.utm_content",
        "data.metadata.utm_content",
        "data.tracking.utm_content",
        "data.params.utm_content",
        "utm_content",
      ],
      geoCountry: ["data.customer.address.country", "data.address.country", "address.country"],
      geoRegion: ["data.customer.address.state", "data.address.state", "address.state"],
      geoCity: ["data.customer.address.city", "data.address.city", "address.city"],
      offerType: ["data.offer_type"],
      parentOrder: ["data.parent_order"],
    },
    statusMap: {
      ...COMMON_STATUS,
      // Eventos e status de assinaturas da Cakto
      SUBSCRIPTION_CREATED: "approved",
      SUBSCRIPTION_RENEWED: "approved",
      SUBSCRIPTION_LATE_RECOVERED: "approved",
      SUBSCRIPTION_RESUMED: "approved",
      SUBSCRIPTION_CANCELED: "canceled",
      SUBSCRIPTION_RENEWAL_REFUSED: "canceled",
      SUBSCRIPTION_LATE: "pending",
      SUBSCRIPTION_PAUSED: "pending",
      // Status de compras / pedidos
      PURCHASE_APPROVED: "approved",
      PURCHASE_REFUSED: "canceled",
      CHARGEDBACK: "chargeback",
      IN_PROTEST: "chargeback",
      REFUND_REQUESTED: "refunded",
      PARTIALLY_PAID: "pending",
      SCHEDULED: "pending",
      IN_SETTLEMENT: "approved",
      BLOCKED: "canceled",
      ACTIVE: "approved",
      PAID: "approved",
      TRIALING: "approved",
      PAST_DUE: "pending",
      UNPAID: "canceled",
    },
  },

  /* -------------------------------------------------------------- GREENN */
  {
    id: "greenn",
    label: "Greenn",
    confirmed: false,
    // O exemplo mostra sale.total 49.9 → reais (decimal).
    amountInCents: false,
    trackingParam: "utm_content",
    auth: { mode: "header-token", headers: ["authorization", "x-greenn-token"] },
    // O rastreio vem num array saleMetas [{meta_key, meta_value}] → _meta.<chave>.
    metaArray: { path: "saleMetas", keyField: "meta_key", valueField: "meta_value" },
    // O sck vem empacotado por pipe ("source|medium|campaign|null").
    pipedTrackingOrder: ["source", "medium", "campaign", "term", "content"],
    secretLabel: "Token do webhook",
    secretHint: "Configurações → Webhooks",
    steps: [
      "Na Greenn, abra Configurações → Webhooks.",
      "Cole a URL mostrada acima e marque os eventos de venda.",
      "Copie o token e cole no campo abaixo.",
      "No link do checkout, envie utm_content=<ad_id>.",
    ],
    caveats: [
      "NÃO CONFIRMADO: o header de autenticação. A primeira venda revela pelo log do 401.",
      "O rastreio vem no array saleMetas (chave/valor), que a rota achata para _meta.<chave>. No exemplo os valores eram de teste — confirme o ad_id numa venda real.",
      "Valor em reais (sale.total decimal).",
    ],
    paths: {
      transaction: ["sale.id"],
      status: ["sale.status", "currentStatus", "status"],
      event: ["event"],
      value: ["sale.total", "sale.amount"],
      currency: ["currency"],
      email: ["client.email"],
      phone: ["client.cellphone"],
      product: ["product.name", "offer.name"],
      adId: ["_meta.utm_content", "_meta.utm_term", "_meta.sck"],
      userId: ["_meta.sck"],
      utmSource: ["_meta.utm_source"],
      utmMedium: ["_meta.utm_medium"],
      utmCampaign: ["_meta.utm_campaign"],
      utmTerm: ["_meta.utm_term"],
      utmContent: ["_meta.utm_content"],
      geoRegion: ["client.uf", "client.state"],
      geoCity: ["client.city"],
    },
    statusMap: { ...COMMON_STATUS, SALEPAID: "approved", SALEREFUSED: "canceled" },
  },
];

/** Ids válidos — usado pelo zod, pelo check do banco e pela rota genérica. */
export const PLATFORM_IDS = CHECKOUT_PLATFORMS.map((p) => p.id);

export function getPlatform(id: string): CheckoutPlatform | null {
  return CHECKOUT_PLATFORMS.find((p) => p.id === id) ?? null;
}

/**
 * Traduz o status da plataforma para o interno.
 * Desconhecido vira `pending` — NUNCA descartamos uma venda por não reconhecer
 * o status; é melhor gravar como pendente e corrigir depois.
 */
export function mapStatus(
  platform: CheckoutPlatform,
  raw: string | null,
  event: string | null,
): InternalStatus {
  const candidates = [raw, event].filter(Boolean) as string[];

  for (const candidate of candidates) {
    const key = candidate.trim().toUpperCase().replace(/[\s-]+/g, "_");
    if (platform.statusMap[key]) return platform.statusMap[key];

    // Casamento por substring: cobre "PURCHASE_APPROVED", "order_approved" etc.
    for (const [needle, status] of Object.entries(platform.statusMap)) {
      if (key.includes(needle)) return status;
    }
  }

  return "pending";
}
