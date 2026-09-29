import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/env";
import { PERIOD_COOKIE, PERIOD_PARAMS } from "@/lib/period";

/**
 * Next.js 16: `middleware` foi renomeado para `proxy` (runtime nodejs, sem edge).
 *
 * Responsabilidades:
 *  1. Renovar a sessão do Supabase a cada request (cookies).
 *  2. Proteger as rotas do painel — sem sessão, redireciona para /login.
 *
 * Rotas públicas: /login, /setup e /api/* (os endpoints públicos de captura e
 * webhooks fazem a própria validação: zod + rate limit + CORS/assinatura).
 */

const PUBLIC_PATHS = ["/login", "/setup"];

function isPublic(pathname: string): boolean {
  if (pathname.startsWith("/api/")) return true;
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

export async function proxy(request: NextRequest) {
  // Primeira execução (env ainda não configurado): não bloqueia nada, deixa a
  // aplicação renderizar as instruções de setup.
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  // IMPORTANTE: getUser() revalida o token no servidor de Auth.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Período lembrado: página do painel aberta SEM período na URL (troca de aba,
  // recarregar, link do menu) volta para o último período escolhido.
  const saved = request.cookies.get(PERIOD_COOKIE)?.value;
  if (
    user &&
    saved &&
    request.method === "GET" &&
    !isPublic(pathname) &&
    !request.headers.has("next-action") &&
    !request.nextUrl.searchParams.has("period")
  ) {
    const remembered = new URLSearchParams(decodeURIComponent(saved));
    const period = remembered.get("period");
    if (period) {
      const url = request.nextUrl.clone();
      for (const key of PERIOD_PARAMS) {
        const value = remembered.get(key);
        if (value) url.searchParams.set(key, value);
      }
      const redirect = NextResponse.redirect(url);
      // Preserva os cookies de sessão renovados neste mesmo request.
      supabaseResponse.cookies
        .getAll()
        .forEach((cookie) => redirect.cookies.set(cookie));
      return redirect;
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Todas as rotas, exceto arquivos estáticos e imagens.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
