"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { Input } from "@/components/ui/input";
import {
  CAMPAIGN_VIEW_COOKIE,
  CAMPAIGN_VIEW_PARAMS,
  serializeCampaignView,
  type CampaignView,
} from "@/lib/campaign-view";

/**
 * Filtros de Campanhas — vivem na URL (compartilhável e legível no servidor) e
 * são lembrados num cookie. `status`/`account` chegam JÁ RESOLVIDOS pelo
 * servidor (URL > último usado > padrão "Ativo"), para o seletor mostrar o
 * filtro que de fato está aplicado.
 */
export function CampaignFilters({
  accounts,
  status,
  account,
}: {
  accounts: { id: string; label: string }[];
  status: string;
  account: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  function apply(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    // O status efetivo pode ter vindo do cookie/padrão, não da URL: fixa-o
    // para não se perder ao mudar outro filtro.
    if (!params.has("status")) params.set("status", status);
    if (!value) params.delete(key);
    else params.set(key, value);

    const view: CampaignView = {};
    for (const k of CAMPAIGN_VIEW_PARAMS) {
      const v = params.get(k);
      if (v) view[k] = v;
    }
    document.cookie = `${CAMPAIGN_VIEW_COOKIE}=${serializeCampaignView(view)}; path=/; max-age=31536000; samesite=lax`;

    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  }

  const selectClass =
    "h-9 rounded-md border border-border bg-[hsl(var(--muted)/0.5)] px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-48 flex-1">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          defaultValue={searchParams.get("q") ?? ""}
          placeholder="Buscar por nome..."
          aria-label="Buscar por nome"
          className="h-9 pl-8"
          onChange={(e) => {
            const value = e.currentTarget.value;
            // Aplica ao parar de digitar (evita navegar a cada tecla).
            clearTimeout(
              (window as unknown as { __searchTimer?: number }).__searchTimer,
            );
            (window as unknown as { __searchTimer?: number }).__searchTimer =
              window.setTimeout(() => apply("q", value || null), 400);
          }}
        />
      </div>

      <select
        aria-label="Filtrar por status"
        className={selectClass}
        // `key` remonta o seletor quando o filtro efetivo muda (ex.: voltou
        // do cookie), já que defaultValue só vale na montagem.
        key={`status-${status}`}
        defaultValue={status}
        onChange={(e) => apply("status", e.currentTarget.value)}
      >
        <option value="active">Ativo</option>
        <option value="paused">Pausado</option>
        <option value="all">Todos os status</option>
      </select>

      {accounts.length > 1 ? (
        <select
          aria-label="Filtrar por conta de anúncio"
          className={selectClass}
          key={`account-${account}`}
          defaultValue={account}
          onChange={(e) => apply("account", e.currentTarget.value || null)}
        >
          <option value="">Todas as contas</option>
          {accounts.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      ) : null}
    </div>
  );
}
