"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { CalendarDays, Check, Loader2, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

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
 * Otimizado para resposta instantânea ao clique com fechamento imediato do menu,
 * feedback visual de loading e painel de datas personalizado com clique fora funcional.
 */
export function PeriodSelector() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);

  const customBoxRef = useRef<HTMLDivElement | null>(null);

  // Layouts não recebem searchParams — o próprio componente lê da URL.
  const activeKey = (searchParams.get("period") ?? "7d") as PeriodKey;
  const fromParam = searchParams.get("from") ?? "";
  const toParam = searchParams.get("to") ?? "";

  // Estado otimista para feedback instantâneo ao clique
  const [optimisticKey, setOptimisticKey] = useState<PeriodKey>(activeKey);

  useEffect(() => {
    setOptimisticKey(activeKey);
  }, [activeKey]);

  // Listener para fechar o box personalizado se clicar fora ou pressionar ESC
  useEffect(() => {
    if (!customOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (
        customBoxRef.current &&
        !customBoxRef.current.contains(event.target as Node)
      ) {
        setCustomOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setCustomOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [customOpen]);

  const activeLabel =
    optimisticKey === "custom" && fromParam && toParam
      ? `${fromParam.split("-").reverse().slice(0, 2).join("/")} a ${toParam.split("-").reverse().slice(0, 2).join("/")}`
      : PERIOD_OPTIONS.find((o) => o.key === optimisticKey)?.label ?? "7 dias";

  function apply(next: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === null) params.delete(k);
      else params.set(k, v);
    }
    rememberPeriod(params);
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  function choose(key: PeriodKey) {
    setDropdownOpen(false);
    if (key === "custom") {
      setCustomOpen(true);
      return;
    }
    setCustomOpen(false);
    setOptimisticKey(key);
    apply({ period: key, from: null, to: null });
  }

  // Preenchimento padrão para o formulário de data
  const todayStr = new Date().toISOString().split("T")[0];
  const defaultFrom = fromParam || new Date(Date.now() - 6 * 86400000).toISOString().split("T")[0];
  const defaultTo = toParam || todayStr;

  return (
    <div className="relative">
      <DropdownMenu.Root open={dropdownOpen} onOpenChange={setDropdownOpen}>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-[hsl(var(--muted)/0.5)] px-3 text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 active:scale-95"
          >
            {isPending ? (
              <Loader2 className="size-4 animate-spin text-primary" />
            ) : (
              <CalendarDays className="size-4 text-muted-foreground" />
            )}
            <span className="tabular font-medium">{activeLabel}</span>
          </button>
        </DropdownMenu.Trigger>

        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={6}
            className="z-50 min-w-44 rounded-lg border border-border bg-card p-1.5 shadow-2xl backdrop-blur-md"
          >
            {PERIOD_OPTIONS.map((option) => (
              <DropdownMenu.Item
                key={option.key}
                onSelect={() => {
                  choose(option.key);
                }}
                className="flex cursor-pointer items-center justify-between gap-3 rounded-md px-2.5 py-2 text-sm transition-colors outline-none hover:bg-muted data-[highlighted]:bg-muted"
              >
                <span>{option.label}</span>
                {optimisticKey === option.key ? (
                  <Check className="size-4 text-primary" />
                ) : null}
              </DropdownMenu.Item>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      {customOpen ? (
        <div
          ref={customBoxRef}
          className="absolute right-0 top-11 z-50 w-72 rounded-xl border border-border bg-card p-4 shadow-2xl animate-in fade-in zoom-in-95 duration-150"
        >
          <div className="flex items-center justify-between pb-2 border-b border-border/60">
            <span className="text-xs font-semibold tracking-wide text-foreground">
              Período Personalizado
            </span>
            <button
              type="button"
              onClick={() => setCustomOpen(false)}
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const from = String(fd.get("from") ?? "");
              const to = String(fd.get("to") ?? "");
              if (from && to) {
                setOptimisticKey("custom");
                apply({ period: "custom", from, to });
                setCustomOpen(false);
              }
            }}
            className="mt-3 space-y-3"
          >
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-[0.7rem] font-medium text-muted-foreground">
                  Data Inicial
                </label>
                <Input
                  type="date"
                  name="from"
                  defaultValue={defaultFrom}
                  max={todayStr}
                  required
                  className="h-8 text-xs font-mono"
                />
              </div>
              <div>
                <label className="mb-1 block text-[0.7rem] font-medium text-muted-foreground">
                  Data Final
                </label>
                <Input
                  type="date"
                  name="to"
                  defaultValue={defaultTo}
                  max={todayStr}
                  required
                  className="h-8 text-xs font-mono"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setCustomOpen(false)}
                className="h-8 rounded-md px-3 text-xs font-medium text-muted-foreground hover:bg-muted"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="h-8 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground shadow-xs hover:bg-primary/90 transition-colors"
              >
                Aplicar Período
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
