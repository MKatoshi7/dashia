"use client";

import { Check, Edit3, Loader2, Sparkles, Target, X } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";

import { updateRevenueGoal } from "@/app/(panel)/actions";
import { formatCurrency } from "@/lib/format";

type GoalProgressProps = {
  revenue: number;
  initialGoal: number;
  currency: string;
};

export function GoalProgress({
  revenue,
  initialGoal,
  currency,
}: GoalProgressProps) {
  const [goal, setGoal] = useState(initialGoal);
  const [modalOpen, setModalOpen] = useState(false);
  const [inputValue, setInputValue] = useState(String(initialGoal || ""));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const modalRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setGoal(initialGoal);
    setInputValue(String(initialGoal || ""));
  }, [initialGoal]);

  // Click outside listener para fechar o popover
  useEffect(() => {
    if (!modalOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        setModalOpen(false);
        setError(null);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setModalOpen(false);
        setError(null);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [modalOpen]);

  const pct = goal > 0 ? Math.min((revenue / goal) * 100, 100) : 0;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleanNum = Number(inputValue.replace(/\D/g, "")) / 100 || Number(inputValue);
    const parsed = Number(inputValue);

    const finalVal = !isNaN(parsed) && parsed >= 0 ? parsed : cleanNum;

    if (isNaN(finalVal) || finalVal < 0) {
      setError("Insira um valor numérico válido.");
      return;
    }

    startTransition(async () => {
      const res = await updateRevenueGoal(finalVal);
      if (res.ok) {
        setGoal(finalVal);
        setModalOpen(false);
        setError(null);
      } else {
        setError(res.error || "Falha ao salvar meta.");
      }
    });
  }

  const QUICK_GOALS = [10000, 25000, 50000, 100000];

  return (
    <div className="relative hidden min-w-56 flex-col gap-2 md:flex">
      <div className="group flex items-baseline justify-between gap-3">
        <button
          type="button"
          onClick={() => {
            setInputValue(goal ? String(goal) : "");
            setModalOpen(true);
          }}
          className="flex items-center gap-1.5 transition-colors hover:text-primary focus-visible:outline-none"
          title="Clique para editar a meta mensal"
        >
          <span className="micro-label font-semibold text-foreground group-hover:text-primary">
            Meta Mensal
          </span>
          <Edit3 className="size-3 text-muted-foreground opacity-60 transition-opacity group-hover:opacity-100 group-hover:text-primary" />
        </button>

        <button
          type="button"
          onClick={() => {
            setInputValue(goal ? String(goal) : "");
            setModalOpen(true);
          }}
          className="sensitive font-mono text-[11px] tabular text-muted-foreground hover:text-foreground transition-colors"
          title="Clique para alterar a meta"
        >
          {formatCurrency(revenue, currency)} / {formatCurrency(goal, currency)}
        </button>
      </div>

      <div
        onClick={() => {
          setInputValue(goal ? String(goal) : "");
          setModalOpen(true);
        }}
        className="h-1.5 overflow-hidden rounded-full bg-[hsl(var(--foreground)/0.08)] cursor-pointer group"
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Progresso da meta de faturamento (clique para editar)"
        title={`Progresso: ${pct.toFixed(1)}% (Clique para editar meta)`}
      >
        <div
          className="fill-neon h-full rounded-full transition-[width] duration-500 group-hover:brightness-125"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Popover de edição rápida da Meta */}
      {modalOpen ? (
        <div
          ref={modalRef}
          className="absolute left-0 top-11 z-50 w-80 rounded-xl border border-border bg-card p-4 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150"
        >
          <div className="flex items-center justify-between pb-2 border-b border-border/60">
            <div className="flex items-center gap-2">
              <Target className="size-4 text-primary" />
              <span className="text-xs font-semibold tracking-wide text-foreground">
                Definir Meta Mensal
              </span>
            </div>
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="mt-3 space-y-3">
            <div>
              <label className="mb-1 block text-[0.7rem] font-medium text-muted-foreground">
                Valor da meta ({currency})
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={inputValue}
                  onChange={(e) => {
                    setInputValue(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="Ex: 50000"
                  autoFocus
                  required
                  className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                />
              </div>
              {error ? (
                <p className="mt-1 text-[0.7rem] text-destructive">{error}</p>
              ) : null}
            </div>

            {/* Sugestões rápidas */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {QUICK_GOALS.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setInputValue(String(q))}
                  className="rounded-md border border-border/70 bg-muted/30 px-2 py-0.5 font-mono text-[0.65rem] text-muted-foreground transition-colors hover:border-primary/50 hover:bg-muted hover:text-foreground"
                >
                  {formatCurrency(q, currency)}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/50">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="h-8 rounded-md px-3 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground shadow-xs hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Check className="size-3.5" />
                )}
                Salvar Meta
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
