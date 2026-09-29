"use client";

import { useActionState } from "react";

import { saveDashboardVersion, type FormState } from "@/app/(panel)/integracoes/actions";
import { Button } from "@/components/ui/button";
import type { DashboardVersion } from "@/lib/settings";
import { cn } from "@/lib/utils";

const OPTIONS: { value: DashboardVersion; title: string; description: string }[] = [
  {
    value: "legacy",
    title: "Legacy",
    description:
      "O dashboard original: KPIs, faturamento vs gasto, vendas em tempo real e regiões. Vendas do webhook do checkout.",
  },
  {
    value: "v2",
    title: "V2",
    description:
      "Grade de KPIs com impostos, funil da Meta, vendas por dia, horário, posicionamento e o acumulado por hora. Vendas do Gerenciador.",
  },
];

export function DashboardVersionForm({ current }: { current: DashboardVersion }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    saveDashboardVersion,
    {},
  );

  return (
    <form action={formAction} className="space-y-4 p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {OPTIONS.map((option) => (
          <label
            key={option.value}
            className={cn(
              "flex cursor-pointer gap-3 rounded-xl border border-border p-4 transition-colors",
              "hover:border-[hsl(var(--primary)/0.3)]",
              "has-[:checked]:border-[hsl(var(--primary)/0.5)] has-[:checked]:bg-[hsl(var(--primary)/0.06)]",
            )}
          >
            <input
              type="radio"
              name="dashboard_version"
              value={option.value}
              defaultChecked={current === option.value}
              className="mt-1 accent-[hsl(var(--primary))]"
            />
            <span>
              <span className="block text-sm font-medium">{option.title}</span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {option.description}
              </span>
            </span>
          </label>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3">
        <div>
          {state.error ? (
            <p className="text-xs text-destructive">{state.error}</p>
          ) : null}
          {state.ok ? <p className="text-xs text-primary">{state.ok}</p> : null}
        </div>
        <Button type="submit" variant="primary" size="sm" disabled={pending}>
          {pending ? "Salvando..." : "Salvar"}
        </Button>
      </div>
    </form>
  );
}
