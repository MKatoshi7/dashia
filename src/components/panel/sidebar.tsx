"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { LogOut, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";

import { signOut } from "@/app/(panel)/actions";
import { Brand } from "@/components/brand";
import type { Area } from "@/lib/areas";
import type { Branding } from "@/lib/branding";
import { PERIOD_PARAMS } from "@/lib/period";
import { cn } from "@/lib/utils";

import { AreaSwitcher } from "./area-switcher";
import { NAV_ITEMS, NAV_SECTIONS } from "./nav";
import { ThemeMenu } from "./theme-picker";

type SidebarProps = {
  branding: Branding;
  areas: Area[];
  activeArea: Area | null;
  userEmail: string;
};

/**
 * Item de navegação no padrão da referência: caixa de ícone quadrada (bg quase
 * preto + borda sutil) que ganha a cor de acento no hover, e o rótulo ao lado.
 */
function NavTile({
  href,
  label,
  icon: Icon,
  active,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "list-tile group/item flex items-center gap-3 p-2",
        active && "border-border bg-[hsl(var(--foreground)/0.04)]",
      )}
    >
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-lg border transition-all",
          active
            ? "border-[hsl(var(--primary)/0.25)] bg-[hsl(var(--primary)/0.1)] text-primary"
            : "border-border bg-[hsl(var(--muted)/0.6)] text-muted-foreground group-hover/item:border-[hsl(var(--primary)/0.2)] group-hover/item:text-primary",
        )}
      >
        <Icon className="size-4" />
      </span>
      <span
        className={cn(
          "truncate text-sm tracking-tight transition-colors",
          active
            ? "font-medium text-foreground"
            : "text-muted-foreground group-hover/item:text-foreground",
        )}
      >
        {label}
      </span>
    </Link>
  );
}

/** Conteúdo da sidebar, reaproveitado no desktop e no drawer mobile. */
function SidebarContent({
  branding,
  areas,
  activeArea,
  userEmail,
  onNavigate,
}: SidebarProps & { onNavigate?: () => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Os links já levam o período atual: sem isso o proxy redirecionava cada
  // troca de tela para reaplicar o período — uma viagem a mais por clique.
  const periodQuery = new URLSearchParams();
  for (const key of PERIOD_PARAMS) {
    const value = searchParams.get(key);
    if (value) periodQuery.set(key, value);
  }
  const suffix = periodQuery.size > 0 ? `?${periodQuery.toString()}` : "";

  return (
    <div className="flex h-full flex-col gap-5 p-4">
      <div className="px-1 pt-1">
        <Brand branding={branding} imgClassName="h-7 w-auto" />
      </div>

      <AreaSwitcher areas={areas} activeArea={activeArea} />

      <nav className="flex-1 space-y-6 overflow-y-auto">
        {NAV_SECTIONS.map((section) => {
          const items = NAV_ITEMS.filter((i) => i.section === section.id);
          if (items.length === 0) return null;

          return (
            <div key={section.id}>
              <div className="micro-label mb-2 px-2">{section.label}</div>
              <div className="space-y-0.5">
                {items.map((item) => (
                  <NavTile
                    key={item.href}
                    href={`${item.href}${suffix}`}
                    label={item.label}
                    icon={item.icon}
                    active={
                      pathname === item.href ||
                      pathname.startsWith(`${item.href}/`)
                    }
                    onNavigate={onNavigate}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Card de rodapé — o "System Optimal" da referência, aqui com a conta. */}
      <div className="rounded-xl border border-border bg-gradient-to-br from-[hsl(var(--foreground)/0.03)] to-transparent p-3">
        <div className="mb-2 flex items-center gap-2">
          <span className="status-dot" />
          <span
            className="min-w-0 flex-1 truncate text-xs font-medium text-foreground"
            title={userEmail}
          >
            {userEmail}
          </span>
          <ThemeMenu />
        </div>

        <form action={signOut}>
          <button
            type="submit"
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-[hsl(var(--destructive)/0.1)] hover:text-destructive"
          >
            <LogOut className="size-3.5" />
            Sair
          </button>
        </form>
      </div>
    </div>
  );
}

/** Sidebar fixa (desktop). */
export function Sidebar(props: SidebarProps) {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-border bg-[hsl(var(--card)/0.5)] backdrop-blur-xl lg:block">
      <SidebarContent {...props} />
    </aside>
  );
}

/** Drawer da navegação no mobile (o gatilho fica no header). */
export function MobileNav(props: SidebarProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          aria-label="Abrir navegação"
          className="inline-flex size-9 items-center justify-center rounded-full border border-border bg-[hsl(var(--foreground)/0.04)] text-muted-foreground transition-colors hover:bg-[hsl(var(--foreground)/0.08)] hover:text-foreground lg:hidden"
        >
          <Menu className="size-4" />
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden" />
        <Dialog.Content className="fixed inset-y-0 left-0 z-50 w-72 border-r border-border bg-card shadow-2xl lg:hidden">
          <Dialog.Title className="sr-only">Navegação</Dialog.Title>
          <Dialog.Close asChild>
            <button
              type="button"
              aria-label="Fechar navegação"
              className="absolute right-2 top-2 z-10 inline-flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-[hsl(var(--foreground)/0.06)]"
            >
              <X className="size-4" />
            </button>
          </Dialog.Close>
          <SidebarContent {...props} onNavigate={() => setOpen(false)} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
