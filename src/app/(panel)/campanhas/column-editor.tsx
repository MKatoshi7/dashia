"use client";

import { ArrowDown, ArrowUp, Columns3, RotateCcw } from "lucide-react";
import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  CAMPAIGN_COLUMNS,
  DEFAULT_CAMPAIGN_COLUMNS,
  type CampaignColumn,
} from "@/lib/campaign-columns";

import { saveCampaignColumns, type ColumnsState } from "./actions";

/**
 * Editor da ordem das colunas. Setas em vez de arrastar: funciona igual no
 * celular (arrastar dentro de uma tabela com rolagem horizontal é ruim no
 * toque). "Nome" fica sempre primeiro e "Ações" sempre por último.
 */
export function ColumnEditor({
  order,
  onSaved,
}: {
  order: CampaignColumn[];
  onSaved: (order: CampaignColumn[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<CampaignColumn[]>(order);
  const [state, formAction, pending] = useActionState<ColumnsState, FormData>(
    saveCampaignColumns,
    {},
  );

  // Salvou: aplica na tabela e fecha. Ajuste no render, sem efeito.
  const [handled, setHandled] = useState(state);
  if (state !== handled) {
    setHandled(state);
    if (state.ok) {
      onSaved(draft);
      setOpen(false);
    }
  }

  function move(index: number, delta: -1 | 1) {
    setDraft((prev) => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  if (!open) {
    return (
      <div className="flex justify-end px-3 pt-3">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            setDraft(order);
            setOpen(true);
          }}
        >
          <Columns3 className="size-3.5" /> Ordem das colunas
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-3 border-b border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Ordem das colunas</p>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setDraft(DEFAULT_CAMPAIGN_COLUMNS)}
        >
          <RotateCcw className="size-3.5" /> Padrão
        </Button>
      </div>

      <ol className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
        {draft.map((key, index) => (
          <li
            key={key}
            className="flex items-center gap-2 rounded-lg border border-border px-2 py-1.5 text-sm"
          >
            <input type="hidden" name="columns" value={key} />
            <span className="w-5 font-mono text-xs text-muted-foreground">
              {index + 1}
            </span>
            <span className="flex-1 truncate">{CAMPAIGN_COLUMNS[key]}</span>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              disabled={index === 0}
              onClick={() => move(index, -1)}
              aria-label={`Mover ${CAMPAIGN_COLUMNS[key]} para a esquerda`}
            >
              <ArrowUp className="size-3.5" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              disabled={index === draft.length - 1}
              onClick={() => move(index, 1)}
              aria-label={`Mover ${CAMPAIGN_COLUMNS[key]} para a direita`}
            >
              <ArrowDown className="size-3.5" />
            </Button>
          </li>
        ))}
      </ol>

      <div className="flex items-center justify-end gap-2">
        {state.error ? (
          <p className="mr-auto text-xs text-destructive">{state.error}</p>
        ) : null}
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" variant="primary" disabled={pending}>
          {pending ? "Salvando..." : "Salvar ordem"}
        </Button>
      </div>
    </form>
  );
}
