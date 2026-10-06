"use client";

import { GripVertical, RotateCcw, ArrowUp, ArrowDown } from "lucide-react";
import React, { useMemo, useState, useSyncExternalStore } from "react";

import { cn } from "@/lib/utils";

export type ReorderableBoxItem = {
  id: string;
  className?: string;
  children: React.ReactNode;
};

export function ReorderableBoxes({
  storageKey,
  items,
  className,
}: {
  storageKey: string;
  items: ReorderableBoxItem[];
  className?: string;
}) {
  const defaultOrder = useMemo(() => items.map((i) => i.id), [items]);
  const [customOrder, setCustomOrder] = useState<string[] | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  // Lê localStorage de forma segura e síncrona sem disparar setState em effect
  const savedRaw = useSyncExternalStore(
    (callback) => {
      window.addEventListener("storage", callback);
      return () => window.removeEventListener("storage", callback);
    },
    () => {
      try {
        return localStorage.getItem(storageKey);
      } catch {
        return null;
      }
    },
    () => null,
  );

  const order = useMemo(() => {
    if (customOrder) return customOrder;
    if (savedRaw) {
      try {
        const parsed = JSON.parse(savedRaw) as string[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          const validIds = new Set(defaultOrder);
          const filtered = parsed.filter((id) => validIds.has(id));
          for (const id of defaultOrder) {
            if (!filtered.includes(id)) filtered.push(id);
          }
          return filtered;
        }
      } catch {
        // Ignora
      }
    }
    return defaultOrder;
  }, [customOrder, savedRaw, defaultOrder]);

  const isCustomOrder = useMemo(() => {
    return JSON.stringify(order) !== JSON.stringify(defaultOrder);
  }, [order, defaultOrder]);

  const itemsMap = useMemo(() => {
    const map = new Map<string, ReorderableBoxItem>();
    for (const item of items) {
      map.set(item.id, item);
    }
    return map;
  }, [items]);

  const orderedItems = useMemo(() => {
    const list: ReorderableBoxItem[] = [];
    for (const id of order) {
      const it = itemsMap.get(id);
      if (it) list.push(it);
    }
    // Caso algum item novo não esteja na ordem salva
    for (const item of items) {
      if (!list.some((it) => it.id === item.id)) {
        list.push(item);
      }
    }
    return list;
  }, [order, itemsMap, items]);

  function saveOrder(newOrder: string[]) {
    setCustomOrder(newOrder);
    try {
      localStorage.setItem(storageKey, JSON.stringify(newOrder));
    } catch {
      // Ignora
    }
  }

  function resetOrder() {
    setCustomOrder(defaultOrder);
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // Ignora
    }
  }

  function move(index: number, direction: -1 | 1) {
    const newIdx = index + direction;
    if (newIdx < 0 || newIdx >= orderedItems.length) return;
    const current = orderedItems.map((i) => i.id);
    const [moved] = current.splice(index, 1);
    current.splice(newIdx, 0, moved);
    saveOrder(current);
  }

  function handleDragStart(e: React.DragEvent, id: string) {
    setDraggedId(id);
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDragOver(e: React.DragEvent, id: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverId !== id) {
      setDragOverId(id);
    }
  }

  function handleDrop(e: React.DragEvent, targetId: string) {
    e.preventDefault();
    const sourceId = draggedId || e.dataTransfer.getData("text/plain");
    if (!sourceId || sourceId === targetId) {
      setDraggedId(null);
      setDragOverId(null);
      return;
    }

    const current = orderedItems.map((i) => i.id);
    const sourceIndex = current.indexOf(sourceId);
    const targetIndex = current.indexOf(targetId);

    if (sourceIndex !== -1 && targetIndex !== -1) {
      current.splice(sourceIndex, 1);
      current.splice(targetIndex, 0, sourceId);
      saveOrder(current);
    }

    setDraggedId(null);
    setDragOverId(null);
  }

  function handleDragEnd() {
    setDraggedId(null);
    setDragOverId(null);
  }

  return (
    <div className="space-y-2">
      {isCustomOrder ? (
        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={resetOrder}
            className="flex items-center gap-1.5 rounded-md border border-border/80 bg-muted/30 px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title="Restaurar posições padrão dos blocos"
          >
            <RotateCcw className="size-3" />
            <span>Restaurar ordem original</span>
          </button>
        </div>
      ) : null}

      <div className={cn("grid", className)}>
        {orderedItems.map((item, idx) => {
          const isDragging = draggedId === item.id;
          const isDragOver = dragOverId === item.id && !isDragging;

          return (
            <div
              key={item.id}
              onDragOver={(e) => handleDragOver(e, item.id)}
              onDrop={(e) => handleDrop(e, item.id)}
              className={cn(
                "group relative transition-all duration-200",
                item.className,
                isDragging && "opacity-40 scale-[0.99] border-dashed border-primary/50",
                isDragOver && "ring-2 ring-primary/70 scale-[1.008] shadow-lg shadow-primary/5 rounded-xl z-10",
              )}
            >
              {/* Grip Handle Magnético (6 pontinhos) */}
              <div
                className="absolute right-3 top-3 z-30 flex items-center gap-1 rounded-md border border-border/70 bg-background/90 px-1.5 py-1 text-muted-foreground shadow-xs backdrop-blur-md opacity-40 transition-all group-hover:opacity-100 hover:text-foreground hover:border-primary/50"
                title="Arraste pelos 6 pontinhos para reposicionar este bloco"
              >
                <button
                  type="button"
                  aria-label="Mover para cima"
                  onClick={() => move(idx, -1)}
                  disabled={idx === 0}
                  className="rounded p-0.5 hover:bg-muted hover:text-primary disabled:opacity-20 disabled:pointer-events-none transition-colors"
                >
                  <ArrowUp className="size-3" />
                </button>

                <div
                  draggable
                  onDragStart={(e) => handleDragStart(e, item.id)}
                  onDragEnd={handleDragEnd}
                  className="flex cursor-grab items-center gap-1 px-1 active:cursor-grabbing hover:text-primary"
                  title="Segure e arraste para trocar de lugar"
                >
                  <GripVertical className="size-3.5" />
                  <span className="select-none font-mono text-[0.65rem] tracking-wider uppercase text-muted-foreground">
                    Mover
                  </span>
                </div>

                <button
                  type="button"
                  aria-label="Mover para baixo"
                  onClick={() => move(idx, 1)}
                  disabled={idx === orderedItems.length - 1}
                  className="rounded p-0.5 hover:bg-muted hover:text-primary disabled:opacity-20 disabled:pointer-events-none transition-colors"
                >
                  <ArrowDown className="size-3" />
                </button>
              </div>

              {item.children}
            </div>
          );
        })}
      </div>
    </div>
  );
}
