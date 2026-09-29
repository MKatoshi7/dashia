@AGENTS.md

# Painel de Tracking e Atribuição (White Label)

> Documento vivo do projeto. **Atualizar a cada fase.** Regras do Next.js 16 estão
> em `AGENTS.md` (importado acima) — leia antes de escrever código do App Router.

## O que é

Um **painel de LEITURA e análise** de tracking e atribuição de anúncios. O sistema:

- **COLETA** dados próprios: visitas, eventos e compras (webhooks Hotmart/Kiwify).
- **LÊ** insights e hierarquia de campanhas da Meta Ads (leitura de dados + escrita de
  *gestão*: status/orçamento das campanhas).
- **NÃO ENVIA** nenhum evento de conversão para fora: **sem** Conversions API da Meta e
  **sem** Measurement Protocol do GA4. Nunca adicionar envio de conversões.

## White Label (o repositório é um template)

- Distribuído como template **single-tenant**: cada pessoa clona, sobe o próprio
  Supabase + Vercel e configura as próprias credenciais **pelo painel**. Cada deploy é
  uma instância independente. **Não é SaaS multi-tenant** — não complicar a RLS por isso.
- **ZERO HARDCODE**: nenhuma credencial, ID de conta, domínio, e-mail ou nome de marca
  fixo no código. O que é da instância vem de **env** (só infra) ou do **painel**
  (credenciais + branding). Nenhum dado real/de teste commitado.
- **Branding** configurável pelo painel (tabela `branding`, global da instância):
  product_name, logo claro/escuro, favicon, override opcional da cor primária. Defaults
  **neutros** no repo (product_name = "Dashboard").
- **Migrations versionadas** (`supabase/migrations`, via Supabase CLI) — schema 100%
  reproduzível em qualquer projeto Supabase novo. Alternativa sem CLI:
  `supabase/setup.sql` (dump das migrations na ordem, para colar no SQL Editor) +
  `supabase/validacao.sql` (confere o resultado). **Ao criar uma migration nova,
  rode `node scripts/build-setup-sql.mjs`** (gera o `setup.sql`; `--check` só
  confere). Nunca edite o `setup.sql` à mão nem o monte com `String.replace`: um
  `$'` dentro do SQL vira padrão especial do replace e corrompe o arquivo — já
  aconteceu. Seed **opcional** (script separado, nunca automático).
- **Região da Vercel = `gru1`** (`vercel.json`), perto do Supabase em São Paulo.
  Cada troca de tela faz várias consultas ao banco; com a função nos EUA cada
  uma custava ~120 ms a mais. Quem hospedar o Supabase em outra região deve
  trocar este valor.

## Stack e versões (estáveis; docs conferidas em 2026-07)

| Item | Versão | Doc |
|---|---|---|
| Next.js (App Router, Turbopack) | 16.2.10 | https://nextjs.org/docs |
| React | 19.2.4 | https://react.dev |
| Tailwind CSS | v4 (config em CSS, `@theme`) | https://tailwindcss.com/docs |
| @supabase/ssr | 0.12.x | https://supabase.com/docs/guides/auth/server-side/nextjs |
| @supabase/supabase-js | 2.110.x | https://supabase.com/docs |
| Supabase CLI (devDep) | 2.109.x | https://supabase.com/docs/guides/cli |
| Meta Graph + Marketing API | **v25.0** | https://developers.facebook.com/docs/graph-api/changelog |
| zod | 4.x · nanoid 5.x | — |

- **Sempre usar a versão estável mais recente** e conferir a doc oficial atual antes de
  integrar cada plataforma.
- A versão da Graph/Marketing API fica numa **constante única** (`META_API_VERSION`) —
  criar em `src/lib/meta/config.ts` na Fase 5. Base: `https://graph.facebook.com/${META_API_VERSION}`.
- **A conferir na fase respectiva:** Kiwify `sck` vs `s1` (Fase 4, doc oficial da Kiwify);
  reenvio das 2 imagens de referência antes das Fases 5/6.

## Regras de arquitetura (não violar)

### Identidade
- `user_id` = ID **ANÔNIMO do visitante** (nanoid, ver `src/lib/ids.ts`). **Sem** relação
  com `auth.users`, **sem** FK para `auth.users`, **fora** da RLS. Compacto/URL-safe,
  compatível com o `sck` da Hotmart.
- A RLS do painel é single-tenant: **LEITURA só por usuário autenticado**; **ESCRITA só
  no servidor** (service_role, que faz bypass de RLS). Signup público **OFF** (configurar
  no dashboard do Supabase — item do checklist de fechamento).

### Áreas (workspaces)
- Quase toda tabela tem `area_id` (indexado). Branding é **global** da instância. O painel
  inteiro filtra pela área ativa. Endpoints públicos identificam a área por token/parâmetro.

### Segredos e criptografia
- Em **env**, só infra: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `ENCRYPTION_KEY`, `SETUP_TOKEN`, `CRON_SECRET`. Nada
  sensível com `NEXT_PUBLIC_` além da URL/anon. Ver `.env.example` e `src/lib/env.ts`.
- Segredos de integração (hottok, token Kiwify, ads_token) são **cifrados** com pgcrypto
  usando `ENCRYPTION_KEY` (que vive **só no env**, nunca no banco). Ciphertext guardado
  como **TEXT base64**. Cifra/decifra via `app_encrypt`/`app_decrypt` (SQL), com EXECUTE
  liberado **só ao service_role** — decifra acontece **só no servidor**. Helper TS:
  `src/lib/crypto.ts`.
- `service_role`/secret **só no servidor** (`src/lib/supabase/admin.ts`, com `server-only`).

### Endpoints públicos (captura/webhooks)
- Validar entrada com **zod**; **rate limiting em Postgres** (`src/lib/rate-limit.ts` →
  função `rate_limit_hit`), nunca em memória; **CORS** pelos `allowed_origins` da área.
- Webhooks validam pelo mecanismo **NATIVO** de cada plataforma (hottok / assinatura HMAC),
  não por token em URL.

## LGPD — dados pessoais em claro (minimização)

Guardamos em claro **apenas o necessário para o match** de compra ao visitante:
- `visitors`: `email`, `telefone`, `nome` — usados para casar a venda quando o `user_id`
  não veio no webhook, e para exibir (mascarado) na tela de Vendas.
- `purchases`: `email`, `telefone` — vêm do webhook da plataforma; necessários para o match
  e conciliação financeira.
- `ip` e `user_agent` (visitors) e `ip` (events_log): atribuição/geo e antifraude básica.
- `raw_webhook` (purchases): payload bruto para auditoria (pode conter PII do comprador).

Não coletamos mais do que isso. Exibição na UI é **mascarada**. GEO vem dos headers da
Vercel (país/estado/cidade), sem provedor externo. Nenhum dado é enviado a plataformas
externas por este sistema.

## Modelo de dados

Migrations em `supabase/migrations/`:
- `..120000_extensions_and_functions.sql` — pgcrypto, `set_updated_at`, `app_encrypt`/`app_decrypt`.
- `..120100_tables.sql` — todas as tabelas + índices + triggers.
- `..120200_rate_limit.sql` — `rate_limit_counters` + `rate_limit_hit` + `rate_limit_cleanup`.
- `..120300_rls.sql` — RLS em todas as tabelas + policies (SELECT authenticated) + grants.
- `..(0722)120000_capture.sql` — `areas.public_token` + RPCs `identify_visitor` e `log_event`.
- `..(0722)130000_realtime.sql` — publica `purchases` no Realtime (feed do Dashboard).

Tabelas: `areas`, `branding` (global, linha única), `settings` (1/área), `meta_ad_accounts`
(N/área), `visitors`, `events_log`, `purchases` (`ad_id` em coluna própria; `transaction_id`
único; status interno unificado), `automation_rules`, `rule_executions`, `audit_log`,
`rate_limit_counters`. Índices por `area_id`, `user_id`, `ad_id`, `event_name`, `created_at`.

**Status interno de compra** (unificado): `approved`, `pending`, `refunded`, `chargeback`,
`canceled`.

**Plataformas de checkout** (7): `hotmart`, `kiwify`, `kirvano`, `perfectpay`, `ticto`,
`cakto`, `greenn`. A lista vive em `src/lib/checkout/platforms.ts` (`PLATFORM_IDS`) e é
espelhada no check de `purchases.plataforma` — **os dois precisam andar juntos**.

**Confirmadas com payload real** (`confirmed: true`): `hotmart`, `kiwify`, `kirvano`,
`perfectpay`. **Parciais** (`confirmed: false`, estrutura conhecida mas com um ponto em
aberto): `ticto` (ad_id não visto num payload com anúncio), `cakto` (exemplo era uma
lista de API, envelope do webhook incerto), `greenn` (header de auth não verificado).
O registro guarda por plataforma: `amountInCents` (Kiwify e Ticto = centavos; resto =
reais), `adIdSegment` (desmonte de campo composto tipo `sck`/`utm_perfect`),
`placeholders` (a Ticto manda `"Não Informado"`), `metaArray` (a Greenn manda o rastreio
num array `saleMetas`). O parser de moeda (`parseMoney`) lê `"R$ 169,80"` da Kirvano.

Segredos de webhook ficam em `checkout_integrations` (PK `area_id`+`plataforma`,
`secret` cifrado). Antes eram duas colunas em `settings` (`hotmart_hottok`,
`kiwify_webhook_token`), que não escalavam — a migration `..140000_checkout_platforms.sql`
migra os dados e remove as colunas.

## Captura (Fase 3) — OPCIONAL

> **A captura própria não é o caminho padrão.** O modo suportado de origem é: um
> **código de rastreio externo** (que já roda no site do usuário) leva as UTMs até o
> link do checkout, e o painel lê tudo do **payload do webhook**. Ver
> "Atribuição por anúncio" abaixo.
>
> O snippet continua no repo (`public/track.js` e as rotas `/api/identify` e
> `/api/event` seguem funcionando), mas **saiu da tela de Integrações** — ela agora
> tem só Meta e Checkout. Ele só acrescenta o que o webhook não tem:
> `initiate_checkout`, `page_view`, funil e a aba Eventos. **Nada da atribuição por
> anúncio depende dele.** Sem snippet, `purchases.match` fica `none` — é o esperado,
> não é falha.

- **Snippet**: `public/track.js`, embutido nas landing pages com o token público da área:
  `<script src="https://SEU-PAINEL/track.js" data-area="TOKEN" defer></script>`.
  Gera/lê o `user_id` (cookie first-party `_tuid` + localStorage), captura UTMs/referrer,
  chama `/api/identify` e `/api/event`, e **decora** links de checkout e WhatsApp.
- **`areas.public_token`**: identifica a área nos endpoints públicos. Fica **visível** no
  fonte da landing page — **não é segredo**. A proteção real é **CORS (`allowed_origins`
  da área) + rate limit**. Nunca usar esse token para autorizar escrita privilegiada.
- **Sem preflight**: o snippet envia `Content-Type: text/plain`, o que evita o OPTIONS
  do CORS. O servidor faz o parse do JSON mesmo assim. `OPTIONS` continua implementado
  (token via `?a=`) para quem preferir `application/json`.
- **CORS**: `allowed_origins` **vazio nega tudo** (estado "ainda não configurado") e o erro
  é explícito no corpo da resposta. Requisição sem header `Origin` (server-to-server) passa,
  protegida por token + rate limit. Suporta curinga `*.exemplo.com`.
- **UTMs = last touch**: valor novo sobrescreve, valor nulo **nunca apaga** o anterior
  (`coalesce` nas RPCs). Assim, navegação interna sem UTM não perde a origem da visita.
- **IP/user-agent/GEO vêm do SERVIDOR** (headers `x-forwarded-for`, `x-vercel-ip-*`),
  nunca do que o cliente enviar.
- Rate limit: `identify` 120/min e `event` 300/min, por área + IP.

## Atribuição por anúncio (ad_id) — sempre por ID exato

- Anúncios usam `utm_content={{ad.id}}`. **Um código de rastreio externo** (fora deste
  projeto) propaga o `ad_id` para o checkout. O parâmetro de cada plataforma está no
  registro (`trackingParam`): **Hotmart via `xcod`**, demais via `utm_content`.
  Webhooks extraem e gravam em `purchases.ad_id` (**validar formato numérico**).
- **Hotmart: o `ad_id` chega em `origin.xcod`, NÃO em `origin.src`** — confirmado nesta
  instalação, e chega **limpo** (só os dígitos do `{{ad.id}}`). O `src` continua nos
  candidatos, mas como alternativa.
- **Ordem de precedência do `ad_id`**: campos nativos do webhook (na ordem de
  `paths.adId`) → `utm.content` extraída do payload → última posição do pacote por pipe
  → `utm_content` do visitor casado (só existe com o snippet opcional ligado).
- **`pickAdId` percorre TODOS os candidatos** até achar um id válido, em vez de parar no
  primeiro caminho preenchido. Sem isso, um `src=organico` esconderia o `xcod` que tem o
  id de verdade.
- **Campos compostos** (rede de segurança, não acionada nesta instalação): `extractAdId`
  desmonta valores com vários ids num campo só (`"1727809035401_17302278327851"`,
  separadores `_ | - , ; : /`) e escolhe o pedaço pelo `adIdSegment` da plataforma
  (`last` por padrão, também `first` e `longest`). Com um id limpo — o caso daqui — esse
  caminho nem é acionado.
- **UTMs e GEO vêm do próprio webhook** (`PurchaseInput.utm` / `.geo` em
  `src/lib/webhooks/common.ts`), com o visitante apenas como fallback. É isso que faz a
  atribuição funcionar sem nada instalado na landing page. Metadados são **clipados**,
  nunca rejeitados — descartar uma venda por uma UTM comprida seria pior. País só é
  aceito em ISO alpha-2 (`normalizeCountry`), para casar com o formato da Vercel e não
  quebrar o rótulo da tela de regiões.
- Cruzamento com a Meta **sempre por ID** (nunca por nome). Hierarquia campanha→conjunto→
  anúncio vem da Ads API a partir do `ad_id` (com cache).
- Vinculação cross-domain: `user_id` viaja na URL do checkout como `sck` (Hotmart) e em
  links de WhatsApp. No webhook, casar por `user_id`; se faltar, por email/telefone.

## Webhooks de compra (Fase 4)

- **Rota única e genérica**: `/api/webhook/<plataforma>?a=<public_token>`, dirigida pelo
  **registro** em `src/lib/checkout/platforms.ts`. Adicionar plataforma = adicionar uma
  entrada no registro; **não se escreve rota nova**.
- Cada entrada declara: modo de autenticação (`header-token` / `body-token` / `hmac`),
  caminhos candidatos de cada campo, mapa de status, se o valor vem em centavos, qual
  parâmetro leva o `ad_id`, os passos de conexão e as ressalvas.
- **O token na URL só ROTEIA** para a área. A **autenticação** é sempre pelo mecanismo
  nativo da plataforma, sempre em tempo constante. Por isso a área é resolvida antes da
  assinatura — é dela que vem o segredo.
- `ad_id` só é aceito se **numérico** (`^\d{5,25}$`). Precedência: campo nativo →
  `utm_content` → última posição do pacote por pipe → `utm_content` do visitante casado.
- **Pacote por pipe** (`pipedTrackingOrder`): alguns rastreadores externos empacotam as
  UTMs num campo só (`sck = "ig|social|bio|null|null"`). Quando declarado, o campo é
  desempacotado e **não** é tratado como id de visitante.
- **Match** do visitante, nesta ordem: `user_id` (sck) → e-mail → telefone (últimos
  dígitos). O como fica gravado em `purchases.match` (`user_id`/`email`/`telefone`/`none`).
- **UPSERT idempotente** por `transaction_id`; `raw_webhook` **sempre** salvo, inclusive
  quando um campo não é extraído — é o que permite corrigir os caminhos depois sem perder
  dado.
- Status desconhecido vira `pending` — **nunca** descartamos uma venda.
- Valor: só divide por 100 quando a plataforma **declara** `amountInCents: true`. Com
  `"unknown"`, usa como está — de propósito: um valor 100× menor passaria despercebido.
- Helpers puros de parsing em `src/lib/webhooks/parse.ts` (sem `server-only`, testáveis).

### `confirmed` — o campo mais importante do registro
`confirmed: true` em **hotmart, kiwify, kirvano, perfectpay** (verificadas contra payload
real). `false` em **ticto, cakto, greenn** — estrutura conhecida, mas com um ponto em
aberto (ad_id sem exemplo com anúncio / envelope do webhook / header de auth). A UI avisa
isso em cada uma. Quando a autenticação falha numa plataforma não confirmada, a rota
registra no log os **nomes** dos headers recebidos (nunca os valores) para revelar qual
delas a plataforma realmente usa.

**Ao confirmar uma plataforma com venda real:** ajuste os caminhos no registro, vire
`confirmed: true`, fixe `amountInCents` e remova as ressalvas resolvidas.

## Meta Ads — leitura de insights (Fase 5)

- `META_API_VERSION` em `src/lib/meta/config.ts` é a **constante única** (hoje `v25.0`).
- **Rate limit conservador** (20 req/min por conta) usando o mesmo `rate_limit_hit` do
  Postgres — bem abaixo do limite da Meta, de propósito.
- **Cache com refetch de períodos recentes**: a atribuição da Meta é **retroativa**, então
  períodos que tocam os últimos 3 dias revalidam a cada 5 min e períodos fechados a cada
  24 h (`META_CACHE`).
- Uma chamada com `time_increment=1` serve ao total **e** à série diária do gráfico.
- Falha na Meta **nunca derruba o painel**: retorna zeros + mensagem, e os dados próprios
  continuam sendo exibidos.

## Regras e cron (Fase 7)

- `/api/cron/rules` e `/api/cron/cleanup` (ambos diários), agendados em `vercel.json`.
  O de regras era de hora em hora, mas **o plano Hobby da Vercel só permite cron
  diário** — ficou às 09:00 UTC (06:00 BRT), antes do grosso da veiculação. Para voltar
  à frequência horária: plano Pro, ou um cron externo chamando a rota com o
  `Authorization: Bearer $CRON_SECRET`. Ambos exigem `Authorization: Bearer $CRON_SECRET` comparado em tempo
  constante e **falham fechados**: sem `CRON_SECRET` no env, a rota devolve 401.
- O motor (`src/lib/rules/engine.ts`) reaproveita `getMetaEntities` + `getLastClickByAd`,
  então não gera requisições extras à Meta além do cache normal.
- Ações **conservadoras**: só `pausar` (e apenas o que está ACTIVE) ou `notificar`.
  Nunca aumenta orçamento nem ativa nada. Tudo vai para `rule_executions` **e** `audit_log`.

## Design system (referência "Finex")

O front segue uma referência de tema escuro. **Dirigido por tokens** — mudanças
visuais entram pelo centro, nunca por classes soltas nas páginas.

| Camada | Onde | O que define |
|---|---|---|
| Tokens | `src/app/globals.css` | Cores HSL, raio, fontes, utilitários (`.micro-label`, `.stat-value`, `.display-title`, `.flashlight`, `.status-dot`, `.hairline-fade`) |
| Fontes | `src/app/layout.tsx` | Plus Jakarta Sans (corpo), Oswald (display), JetBrains Mono (rótulos/números) |
| Primitivos | `src/components/ui/` | `Card`/`SectionHeading`, `Button`/`PillGroup`, `Input`, `Flashlight` |
| Painel | `src/components/panel/` | `KpiCard`, `Sidebar`, `Header`, gráficos |

- **Assinaturas:** fundo `#020202` com listras diagonais a −45°; glows radiais
  ciano/roxo; cards `rounded-2xl` com borda branca a 10% que acende no acento no
  hover; rótulos micro em mono caixa-alta; valores em `font-light` com numerais
  tabulares; botões em pílula; títulos display em Oswald caixa-alta.
- **`Card` é componente de SERVIDOR.** O brilho que segue o cursor vive no
  `<Flashlight>`, wrapper cliente separado — não arrastar o sistema de cards para
  o bundle do browser.
- **Zero hardcode continua valendo:** a cor primária sai de `--primary` e o
  branding da instância pode sobrescrevê-la. Os gráficos leem
  `hsl(var(--primary))` / `hsl(var(--accent-purple))` em vez de cores fixas, então
  acompanham tema e branding. O tema claro segue funcional.

## Convenções de código

- Next.js App Router + TS, pasta `src/`. Import alias `@/*`. npm (lockfile commitado).
- Supabase: dev **contra projeto cloud** (`supabase link` + `supabase db push`), sem Docker.
- Clientes Supabase: `src/lib/supabase/{client,server,admin}.ts` (browser/servidor/service_role).
- **Next.js 16 (breaking):** `cookies()`, `headers()`, `params`, `searchParams` são
  **assíncronos** (usar `await`). Middleware foi renomeado para **`proxy.ts`** (runtime
  nodejs, sem edge) — usar na Fase 2 para refresh de sessão + proteção de rotas. `next lint`
  removido (usar `eslint` direto). Sem `serverRuntimeConfig`/`publicRuntimeConfig` (usar env).

## Fluxo de trabalho (fases)

Construção **em fases**. Ao fim de cada fase: **commit** e **aguardar aprovação** antes da
próxima. Plano completo: `~/.claude/plans/concurrent-riding-sedgewick.md`.

- [x] **Fase 1** — Setup + schema + RLS + criptografia + rate limit.
- [x] **Fase 2** — Auth + shell do painel (sidebar, Áreas, tema, /setup).
- [x] **Fase 3** — Captura (snippet + /api/identify + /api/event).
- [x] **Fase 4** — Webhooks Hotmart/Kiwify.
- [x] **Fase 5** — Dashboard (KPIs, gráfico, regiões, feed em tempo real).
      *Pendência assumida:* o mapa (choropleth) foi adiado para a Fase 7 (página Geo) —
      o GEO da Vercel vem em ISO alpha-2 e o topojson usa ISO numérico; sem a tabela de
      conversão correta o mapa rotularia países errado. Por ora, recorte por região em
      tabela com barras de participação.
- [x] **Fase 6** — Campanhas (leitura + edição inline na Meta).
- [x] **Fase 7** — Financeiro, Regras, Admin, Geo, Vendas, Integrações.
      *Geo:* entregue como recorte por região (com nomes de país via
      `Intl.DisplayNames`, sem tabela hardcoded). O choropleth continua fora —
      ver a nota da Fase 5.
- [x] **Fase 8** — Empacotamento white label (branding, onboarding, docs).
- [x] **Fase 9** — Auditoria de segurança + deploy.

## Comandos úteis

```bash
npm run dev            # dev server (Turbopack)
npm run build          # build de produção
npm run lint           # eslint
npx supabase link      # linkar ao projeto Supabase (cloud)
npx supabase db push   # aplicar migrations no projeto linkado
```

Sem CLI: cole `supabase/setup.sql` no SQL Editor (aplica tudo) e depois
`supabase/validacao.sql` (confere). Regenere o `setup.sql` a cada migration nova.
