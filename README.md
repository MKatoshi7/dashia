# DashIA — Painel de Tracking e Atribuição

Painel **single-tenant** de leitura e análise de tracking e atribuição de anúncios.
Coleta visitas, eventos e compras (webhooks de 7 plataformas de checkout) e lê
insights da Meta Ads.

> **Não envia** eventos de conversão para lugar nenhum — sem Conversions API da Meta e
> sem Measurement Protocol do GA4. É um painel de **leitura e análise**.

Distribuído como **template**: cada pessoa clona, cria o próprio Supabase, faz o próprio
deploy na Vercel e configura as próprias credenciais **pelo painel**. Cada deploy é uma
instância independente. Zero credencial, ID, domínio ou marca fixos no código.

---

## O que ele faz

- **Atribuição por anúncio**: cruzamento sempre por `ad.id` exato (nunca por nome de
  campanha), com `utm_content={{ad.id}}` nos anúncios. O `ad_id` chega ao painel pelo
  **payload do webhook** — nada precisa ser instalado nas landing pages.
- **Captura própria (opcional)**: snippet leve que gera um `user_id` anônimo, guarda
  UTMs e dispara `page_view` / `initiate_checkout`. Só acrescenta funil e eventos.
- **Webhooks de compra**: 7 plataformas (Hotmart, Kiwify, Kirvano, Perfect Pay, Ticto,
  Cakto, Greenn), validadas pelo mecanismo nativo de cada uma. Uma rota genérica dirigida
  por um registro — adicionar plataforma não exige código novo.
- **Dashboard**: faturamento, gasto, lucro, ROAS, CPA, evolução, regiões e vendas em
  tempo real.
- **Campanhas**: hierarquia da Meta com dois modos de atribuição e edição inline de
  status e orçamento (com confirmação e auditoria).
- **Regras**: automação conservadora — só pausa ou notifica.

## Stack

| Item | Versão | Doc |
|---|---|---|
| Next.js (App Router, Turbopack) | 16.2.10 | https://nextjs.org/docs |
| React | 19.2.4 | https://react.dev |
| Tailwind CSS | v4 | https://tailwindcss.com/docs |
| Supabase (Postgres + Auth + Realtime) | @supabase/ssr 0.12.x · supabase-js 2.110.x | https://supabase.com/docs |
| Meta Graph + Marketing API | **v25.0** | https://developers.facebook.com/docs/graph-api/changelog |
| Recharts · zod 4 · nanoid 5 | — | — |

---

## Instalação passo a passo

### 1. Criar o projeto no Supabase

1. Crie um projeto em [supabase.com](https://supabase.com).
2. Em **Project Settings → API**, anote a **URL**, a chave **anon/publishable** e a chave
   **service_role/secret**.
3. Em **Authentication → Providers → Email**, **DESLIGUE** o cadastro público
   ("Allow new users to sign up"). O acesso é só por convite.

### 2. Aplicar o schema

Duas opções, ambas 100% reproduzíveis a partir de `supabase/migrations`:

**a) Via SQL Editor (sem CLI)** — copie todo o `supabase/setup.sql` e cole no
**SQL Editor** do Supabase. Rode uma vez, num projeto novo e vazio.

**b) Via Supabase CLI**

```bash
npm install
npx supabase link --project-ref SEU_PROJECT_REF
npx supabase db push
```

Depois, opcionalmente, cole `supabase/validacao.sql` no SQL Editor para conferir que
tabelas, funções, RLS e a linha de branding ficaram corretas.

### 3. Configurar o ambiente

```bash
cp .env.example .env.local
```

Preencha (só infra vive em env — credenciais de integração vão pelo painel):

| Variável | Descrição |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave anon/publishable (client-safe) |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave service_role/secret — **só servidor** |
| `ENCRYPTION_KEY` | Cifra os segredos no banco. Gere com `openssl rand -base64 48`. **Se perder, os segredos ficam irrecuperáveis.** |
| `SETUP_TOKEN` | Protege a rota `/setup` de primeira execução |
| `CRON_SECRET` | Protege as rotas de cron. Sem ele, os crons ficam desativados |

### 4. Deploy na Vercel

1. Importe o repositório na [Vercel](https://vercel.com/new).
2. Em **Settings → Environment Variables**, adicione as mesmas 6 variáveis acima.
3. Faça o deploy. Os crons de `vercel.json` são registrados automaticamente.

### 5. Primeira execução: `/setup`

Acesse `https://SEU-DOMINIO/setup`, informe o `SETUP_TOKEN`, o e-mail e a senha do
primeiro administrador e o nome da primeira área.

> A rota **se desativa sozinha** assim que existir um usuário.

### 6. Conectar as integrações

Entre no painel e vá em **Integrações** — duas conexões: **Meta Ads** e **Checkout**.

#### Conta de anúncio da Meta

Você precisa de um token de **System User** do Business Manager (não expira):

1. Em [business.facebook.com](https://business.facebook.com) → **Configurações do
   negócio → Usuários → Usuários do sistema**, crie um usuário do sistema (admin).
2. Clique em **Adicionar ativos** e vincule a **conta de anúncios** desejada, com
   permissão total.
3. Clique em **Gerar novo token**, escolha seu app e marque os escopos
   **`ads_read`** e **`ads_management`**.
4. No painel, em Integrações → **Meta Ads**, cole o token e clique em **Buscar contas**.
   O painel lista **todas** as contas que aquele token enxerga; marque as que quiser e
   conecte. Não é preciso digitar o `act_<id>`.

O token é **cifrado** antes de ir para o banco e nunca é exibido de volta.

#### Checkout

Em Integrações → **Checkout**, selecione a sua plataforma numa grade. As instruções
daquela plataforma aparecem: a URL do webhook pronta para copiar, o passo a passo, qual
parâmetro leva o `ad_id` e o campo do segredo (hottok / token / assinatura), que é
cifrado antes de ir para o banco.

Suportadas: **Hotmart, Kiwify, Kirvano, Perfect Pay, Ticto, Cakto, Greenn**.

> **Hotmart, Kiwify, Kirvano e Perfect Pay** têm o payload confirmado contra um envio
> real. **Ticto, Cakto e Greenn** estão parciais (estrutura conhecida, mas com um ponto
> em aberto — a interface avisa em cada uma). O `raw_webhook` é sempre salvo, então a
> primeira venda real revela o que falta, e a correção é editar o registro em
> `src/lib/checkout/platforms.ts`, não escrever código.

É pelo payload desse webhook que o painel lê o `ad_id`, as UTMs e o endereço do
comprador. Não é preciso configurar mais nada do lado do site.

### 7. Configurar os anúncios e o caminho do `ad_id`

Nos anúncios da Meta, use **`utm_content={{ad.id}}`** na URL.

O seu código de rastreio precisa levar esse valor até o link do checkout, no parâmetro
que cada plataforma usa (mostrado na tela ao selecioná-la):

| Plataforma | Parâmetro no link do checkout |
|---|---|
| Hotmart | `xcod=<ad_id>` |
| Demais | `utm_content=<ad_id>` |

O `ad_id` só é aceito se for **numérico**. Venda sem `ad_id` continua sendo gravada —
entra como orgânico/direto.

### 8. Captura própria (opcional)

Só se você quiser que **este painel** também rastreie as visitas — habilita checkouts
iniciados, funil e a aba Eventos. A atribuição por anúncio funciona sem isso.

```html
<script src="https://SEU-DOMINIO/track.js" data-area="TOKEN_DA_AREA" defer></script>
```

Usando o snippet, cadastre em **Configurações → Preferências da área** os domínios das
suas landing pages (um por linha; aceita `*.seudominio.com`).

> **Sem nenhuma origem cadastrada, a captura é bloqueada** para requisições de
> navegador. É proposital — evita que qualquer site envie dados para a sua instância.

---

## Desenvolvimento

```bash
npm run dev     # dev server (Turbopack)
npm run build   # build de produção
npm run lint    # eslint
```

Dados de exemplo (opcional, **nunca automático** — só para explorar a interface):

```bash
node scripts/seed.mjs        # exige .env.local configurado
node scripts/seed.mjs --clear # remove os dados de exemplo
```

---

## Segurança

- **RLS em todas as tabelas**: leitura só por usuário autenticado; escrita só no
  servidor (service_role).
- **Cadastro público desligado** (configurado no dashboard do Supabase).
- Segredos de integração **cifrados** no banco com pgcrypto; a `ENCRYPTION_KEY` vive
  só no ambiente, nunca no banco.
- Endpoints públicos com **validação (zod)**, **rate limit em Postgres** e **CORS** por
  área. Webhooks validados pelo mecanismo nativo (hottok / assinatura HMAC).
- Escritas na Meta sempre com **confirmação** e registro em **log de auditoria**.
- Rotas de cron protegidas por `CRON_SECRET`, falhando fechadas.

## LGPD

Guardamos em claro apenas o necessário para casar a venda ao visitante (e-mail,
telefone, nome) e para atribuição/antifraude (IP, user-agent, geo). A exibição na
interface é sempre **mascarada**. Nenhum dado é enviado a plataformas externas.

**Implantação guiada:** [`docs/PROMPT-IMPLANTACAO.md`](./docs/PROMPT-IMPLANTACAO.md) — prompt
pronto para colar num agente de código, com os passos manuais marcados.

Detalhes técnicos e regras de arquitetura: [`CLAUDE.md`](./CLAUDE.md).
Checklist de segurança: [`SECURITY.md`](./SECURITY.md).
