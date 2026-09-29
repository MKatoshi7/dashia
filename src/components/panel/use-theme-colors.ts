"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Cores do tema RESOLVIDAS para valores concretos ("hsl(214 88% 56%)"), para
 * uso em atributos SVG (fill/stroke dos gráficos).
 *
 * Por quê: `fill="hsl(var(--primary))"` como ATRIBUTO não é resolvido por
 * todos os navegadores — o Safari (iPhone) desenha preto. Aqui o valor é lido
 * das variáveis CSS do <html> e relido quando o tema (data-theme) ou o
 * override de cor do branding (style) mudam.
 */
const TOKENS = [
  "primary",
  "accent-purple",
  "accent-cyan",
  "accent-amber",
  "accent-emerald",
  "destructive",
  "foreground",
  "muted",
  "muted-foreground",
  "border",
  "card",
] as const;

export type ThemeToken = (typeof TOKENS)[number];

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme", "style"],
  });
  return () => observer.disconnect();
}

/** Snapshot em string: estável entre leituras enquanto nada muda. */
function readSnapshot(): string {
  const style = getComputedStyle(document.documentElement);
  return TOKENS.map((token) => style.getPropertyValue(`--${token}`).trim()).join("|");
}

export function useThemeColors() {
  const snapshot = useSyncExternalStore(subscribe, readSnapshot, () => "");

  return useCallback(
    (token: ThemeToken, alpha?: number) => {
      const raw = snapshot ? snapshot.split("|")[TOKENS.indexOf(token)] : "";
      // No servidor (sem snapshot) cai na variável; o cliente troca na hidratação.
      const value = raw || `var(--${token})`;
      return alpha === undefined ? `hsl(${value})` : `hsl(${value} / ${alpha})`;
    },
    [snapshot],
  );
}
