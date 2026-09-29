"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { CalendarDays, Check } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import { Input } from "@/components/ui/input";
import {
  PERIOD_COOKIE,
  PERIOD_OPTIONS,
  PERIOD_PARAMS,
  type PeriodKey,
} from "@/lib/period";

/** Lembra o período escolhido (1 ano) — o proxy o reaplica nas outras abas. */
function rememberPeriod(params: URLSearchParams) {
  const saved = new URLSearchParams();
  for (const key of PERIOD_PARAMS) {
    const value = params.get(key);
    if (value) saved.set(key, value);
  }
  document.cookie = `${PERIOD_COOKIE}=${encodeURIComponent(saved.toString())}; path=/; max-age=31536000; samesite=lax`;
}

/**
 * Seletor de período do header — filtra TODO o painel.
 * O valor vive na URL (?period=... ou ?from=&to=), então é compartilhável e
 * fica acessível aos Server Components.
 */
export function PeriodSelector() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [customOpen, setCustomOpen] = useState(false);

  // Layouts não recebem searchParams — o próprio componente lê da URL.
  const activeKey = (searchParams.get("period") ?? "7d") as PeriodKey;

  const activeLabel =
    PERIOD_OPTIONS.find((o) => o.key === activeKey)?.label ?? "7 dias";

  function apply(next: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === null) params.delete(k);
      else params.set(k, v);
    }
    rememberPeriod(params);
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  }

  function choose(key: PeriodKey) {
    if (key === "custom") {
      setCustomOpen(true);
      return;
    }
    setCustomOpen(false);
    apply({ period: key, from: null, to: null });
  }

  return (
    <div className="relative">
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-[hsl(var(--muted)/0.5)] px-3 text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            <CalendarDays className="size-4 text-muted-foreground" />
            {activeLabel}
          </button>
        </DropdownMenu.Trigger>

        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={6}
            className="z-50 min-w-40 rounded-md border border-border bg-card p-1 shadow-xl"
          >
            {PERIOD_OPTIONS.map((option) => (
              <DropdownMenu.Item
                key={option.key}
                onSelect={(e) => {
                  e.preventDefault();
                  choose(option.key);
                }}
                className="flex cursor-pointer items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-muted"
              >
                {option.label}
                {activeKey === option.key ? (
                  <Check className="size-4 text-primary" />
                ) : null}
              </DropdownMenu.Item>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      {customOpen ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const from = String(fd.get("from") ?? "");
            const to = String(fd.get("to") ?? "");
            if (from && to) {
              apply({ period: "custom", from, to });
              setCustomOpen(false);
            }
          }}
          className="absolute right-0 top-11 z-50 flex items-end gap-2 rounded-md border border-border bg-card p-3 shadow-xl"
        >
          <div>
            <label className="mb-1 block text-[0.65rem] text-muted-foreground">
              De
            </label>
            <Input type="date" name="from" required className="h-8 text-xs" />
          </div>
          <div>
            <label className="mb-1 block text-[0.65rem] text-muted-foreground">
              Até
            </label>
            <Input type="date" name="to" required className="h-8 text-xs" />
          </div>
          <button
            type="submit"
            className="h-8 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground"
          >
            Aplicar
          </button>
        </form>
      ) : null}
    </div>
  );
}
