"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, Palette } from "lucide-react";
import { useSyncExternalStore } from "react";

import {
  DEFAULT_THEME,
  isThemeId,
  THEME_STORAGE_KEY,
  THEMES,
  type ThemeId,
} from "@/lib/themes";
import { cn } from "@/lib/utils";

/**
 * Tema atual = atributo data-theme do <html> (o script do layout raiz o aplica
 * antes da primeira pintura). Lido via useSyncExternalStore para os seletores
 * marcarem o ativo sem mismatch de hidratação.
 */
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => observer.disconnect();
}

function readTheme(): ThemeId {
  const value = document.documentElement.getAttribute("data-theme");
  return isThemeId(value) ? value : DEFAULT_THEME;
}

export function useTheme(): ThemeId {
  return useSyncExternalStore(subscribe, readTheme, () => DEFAULT_THEME);
}

export function applyTheme(theme: ThemeId) {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // localStorage indisponível — a troca vale só para esta sessão.
  }
}

function Swatch({ colors }: { colors: readonly string[] }) {
  return (
    <span className="flex size-5 shrink-0 overflow-hidden rounded-full border border-border">
      {colors.map((color) => (
        <span key={color} className="h-full flex-1" style={{ background: color }} />
      ))}
    </span>
  );
}

/** Botão compacto (rodapé da sidebar) que abre a lista de temas. */
export function ThemeMenu({ className }: { className?: string }) {
  const current = useTheme();

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label="Escolher tema"
          title="Tema"
          className={cn(
            "inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
            className,
          )}
        >
          <Palette className="size-4" />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          side="top"
          sideOffset={6}
          className="z-50 min-w-40 rounded-md border border-border bg-card p-1 shadow-xl"
        >
          {THEMES.map((theme) => (
            <DropdownMenu.Item
              key={theme.id}
              onSelect={() => applyTheme(theme.id)}
              className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-muted"
            >
              <Swatch colors={theme.swatch} />
              <span className="flex-1">{theme.label}</span>
              {current === theme.id ? <Check className="size-4 text-primary" /> : null}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** Grade de temas (tela Configurações), boa de tocar no celular. */
export function ThemeGrid() {
  const current = useTheme();

  return (
    <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
      {THEMES.map((theme) => {
        const active = current === theme.id;
        return (
          <button
            key={theme.id}
            type="button"
            onClick={() => applyTheme(theme.id)}
            aria-pressed={active}
            className={cn(
              "overflow-hidden rounded-xl border text-left transition-colors",
              active
                ? "border-[hsl(var(--primary)/0.6)] ring-2 ring-[hsl(var(--primary)/0.3)]"
                : "border-border hover:border-[hsl(var(--primary)/0.3)]",
            )}
          >
            <span className="flex h-14" style={{ background: theme.swatch[0] }}>
              <span className="m-2 flex-1 rounded-md" style={{ background: theme.swatch[1] }}>
                <span
                  className="m-2 block h-1.5 w-8 rounded-full"
                  style={{ background: theme.swatch[2] }}
                />
              </span>
            </span>
            <span className="flex items-center justify-between px-3 py-2 text-sm">
              {theme.label}
              {active ? <Check className="size-4 text-primary" /> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
