import { Suspense } from "react";

import type { Area } from "@/lib/areas";
import type { Branding } from "@/lib/branding";
import { formatCurrency } from "@/lib/format";

import { HideValuesButton, RefreshButton } from "./header-actions";
import { PeriodSelector } from "./period-selector";
import { MobileNav } from "./sidebar";

type HeaderProps = {
  userName: string;
  branding: Branding;
  areas: Area[];
  activeArea: Area | null;
  userEmail: string;
  /** Faturamento do período. */
  revenue: number;
  /** Meta de faturamento (settings da área é a fonte da verdade). */
  goal: number;
  currency: string;
};

import { GoalProgress } from "./goal-progress";

export function Header({
  userName,
  branding,
  areas,
  activeArea,
  userEmail,
  revenue,
  goal,
  currency,
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-[hsl(var(--background)/0.8)] backdrop-blur-xl">
      <div className="flex flex-wrap items-center gap-4 px-4 py-4 lg:px-6">
        <MobileNav
          branding={branding}
          areas={areas}
          activeArea={activeArea}
          userEmail={userEmail}
        />

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold tracking-tight text-foreground">
            Bem vindo{userName ? `, ${userName}` : ""}
          </h1>
          <div className="mt-0.5 flex items-center gap-2">
            {activeArea ? (
              <>
                <span className="status-dot" />
                <span className="micro-label truncate">
                  Área {activeArea.nome}
                </span>
              </>
            ) : (
              <span className="micro-label">Crie uma área para começar</span>
            )}
          </div>
        </div>

        <GoalProgress revenue={revenue} initialGoal={goal} currency={currency} />

        <div className="flex items-center gap-2">
          <Suspense
            fallback={
              <div className="h-9 w-28 rounded-full border border-border bg-[hsl(var(--foreground)/0.04)]" />
            }
          >
            <PeriodSelector />
          </Suspense>
          <HideValuesButton />
          <RefreshButton />
        </div>
      </div>
    </header>
  );
}
