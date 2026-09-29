import { Card } from "@/components/ui/card";

/**
 * Esqueleto mostrado NA HORA do clique no menu, enquanto o servidor busca os
 * dados (banco + Meta). Sem ele a tela antiga ficava parada, e a troca de menu
 * parecia travada.
 */
function Bar({ className }: { className: string }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-[hsl(var(--foreground)/0.06)] ${className}`}
    />
  );
}

export default function PanelLoading() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Carregando">
      <Bar className="h-6 w-40" />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <Card key={i} className="space-y-3 p-4">
            <Bar className="h-3 w-24" />
            <Bar className="h-7 w-28" />
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <Card className="space-y-3 p-5 xl:col-span-2">
          <Bar className="h-4 w-48" />
          <Bar className="h-48 w-full" />
        </Card>
        <Card className="space-y-3 p-5">
          <Bar className="h-4 w-32" />
          <Bar className="h-48 w-full" />
        </Card>
      </div>
    </div>
  );
}
