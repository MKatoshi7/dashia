import {
  LayoutDashboard,
  Megaphone,
  Plug,
  ScrollText,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Wallet,
  Zap,
  type LucideIcon,
} from "lucide-react";

/** Seções da sidebar — viram rótulos micro em caixa-alta, como na referência. */
export type NavSection = "analise" | "operacao";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  section: NavSection;
};

export const NAV_SECTIONS: { id: NavSection; label: string }[] = [
  { id: "analise", label: "Análise" },
  { id: "operacao", label: "Operação" },
];

/** Navegação principal da sidebar. */
export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, section: "analise" },
  { href: "/campanhas", label: "Campanhas", icon: Megaphone, section: "analise" },
  { href: "/vendas", label: "Vendas", icon: ShoppingCart, section: "analise" },
  { href: "/financeiro", label: "Financeiro", icon: Wallet, section: "analise" },
  { href: "/integracoes", label: "Integrações", icon: Plug, section: "operacao" },
  { href: "/regras", label: "Regras", icon: Zap, section: "operacao" },
  { href: "/logs", label: "Logs", icon: ScrollText, section: "operacao" },
  { href: "/configuracoes", label: "Configurações", icon: Settings, section: "operacao" },
  { href: "/admin", label: "Admin", icon: ShieldCheck, section: "operacao" },
];
