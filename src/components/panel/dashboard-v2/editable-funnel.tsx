"use client";

import { Pencil, Plus, X } from "lucide-react";
import { useActionState, useState } from "react";

import { saveDashboardFunnel, type FormState } from "@/app/(panel)/integracoes/actions";
import { Button } from "@/components/ui/button";
import {
  FUNNEL_MAX_STEPS,
  FUNNEL_METRIC_KEYS,
  FUNNEL_METRICS,
  FUNNEL_MIN_STEPS,
  type FunnelMetric,
} from "@/lib/funnel";

import { ConversionFunnel, PanelTitle } from "./blocks";

/**
 * Funil do Dashboard V2 com edição no lugar: o lápis troca cada etapa por um
 * seletor de métrica. Salvo por área (settings.dashboard_funnel).
 */
export function EditableFunnel({
  steps,
  values,
}: {
  steps: FunnelMetric[];
  values: Record<FunnelMetric, number>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<FunnelMetric[]>(steps);
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    saveDashboardFunnel,
    {},
  );

  // Salvou: sai do modo de edição (a página já chega com as etapas novas).
  // Ajuste durante o render, sem efeito — cada resultado é tratado uma vez.
  const [handled, setHandled] = useState(state);
  if (state !== handled) {
    setHandled(state);
    if (state.ok) setEditing(false);
  }

  function startEditing() {
    setDraft(steps);
    setEditing(true);
  }

  function replace(index: number, metric: FunnelMetric) {
    setDraft((prev) => prev.map((m, i) => (i === index ? metric : m)));
  }

  function remove(index: number) {
    setDraft((prev) => prev.filter((_, i) => i !== index));
  }

  function add() {
    const next = FUNNEL_METRIC_KEYS.find((key) => !draft.includes(key));
    if (next) setDraft((prev) => [...prev, next]);
  }

  const selectClass =
    "h-8 w-full rounded-md border border-border bg-[hsl(var(--muted)/0.5)] px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60";

  return (
    <>
      <PanelTitle
        title="Funil de Conversão (Meta Ads)"
        hint="Clique no lápis para escolher a métrica de cada etapa. Percentuais sobre a primeira etapa."
      >
        {!editing ? (
          <button
            type="button"
            onClick={startEditing}
            title="Editar etapas do funil"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            <Pencil className="size-4" />
          </button>
        ) : null}
      </PanelTitle>

      {editing ? (
        <form action={formAction} className="space-y-3 px-5 pb-5 pt-3">
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: `repeat(${draft.length}, minmax(0, 1fr))` }}
          >
            {draft.map((metric, index) => (
              <div key={`${metric}-${index}`} className="space-y-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="micro-label">Etapa {index + 1}</span>
                  {draft.length > FUNNEL_MIN_STEPS ? (
                    <button
                      type="button"
                      onClick={() => remove(index)}
                      title="Remover etapa"
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="size-3.5" />
                    </button>
                  ) : null}
                </div>
                <input type="hidden" name="steps" value={metric} />
                <select
                  aria-label={`Métrica da etapa ${index + 1}`}
                  value={metric}
                  onChange={(e) => replace(index, e.currentTarget.value as FunnelMetric)}
                  className={selectClass}
                >
                  {FUNNEL_METRIC_KEYS.map((key) => (
                    <option
                      key={key}
                      value={key}
                      disabled={key !== metric && draft.includes(key)}
                    >
                      {FUNNEL_METRICS[key].label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={add}
              disabled={draft.length >= FUNNEL_MAX_STEPS}
            >
              <Plus className="size-3.5" /> Etapa
            </Button>
            <div className="flex items-center gap-2">
              {state.error ? (
                <p className="text-xs text-destructive">{state.error}</p>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setEditing(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" size="sm" variant="primary" disabled={pending}>
                {pending ? "Salvando..." : "Salvar funil"}
              </Button>
            </div>
          </div>
        </form>
      ) : (
        <ConversionFunnel
          steps={steps.map((key) => ({
            label: FUNNEL_METRICS[key].label,
            value: values[key] ?? 0,
          }))}
        />
      )}
    </>
  );
}
