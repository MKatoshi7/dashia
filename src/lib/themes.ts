/**
 * Temas do painel. As cores vivem em `globals.css` (`:root[data-theme=...]`);
 * aqui fica só o catálogo que o seletor mostra. Sem `server-only`: o script de
 * tema do layout raiz e o seletor (cliente) usam a mesma lista.
 *
 * A escolha é por navegador (localStorage), como o antigo toggle claro/escuro.
 */
export const THEME_STORAGE_KEY = "theme";

export const THEMES = [
  {
    id: "dark",
    label: "Escuro",
    // Amostras só para o seletor (fundo, cartão, acento).
    swatch: ["#030303", "#0a0a0a", "#22d3ee"],
  },
  {
    id: "light",
    label: "Claro",
    swatch: ["#fafafa", "#ffffff", "#0891b2"],
  },
  {
    id: "lime",
    label: "Lima",
    swatch: ["#0a0b09", "#161714", "#c2f23a"],
  },
  {
    id: "ocean",
    label: "Azul",
    swatch: ["#1b2130", "#283043", "#2b7ff0"],
  },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

export const THEME_IDS: ThemeId[] = THEMES.map((t) => t.id);

export const DEFAULT_THEME: ThemeId = "dark";

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && (THEME_IDS as string[]).includes(value);
}
