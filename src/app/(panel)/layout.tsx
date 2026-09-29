import { redirect } from "next/navigation";

import { Header } from "@/components/panel/header";
import { Sidebar } from "@/components/panel/sidebar";
import { ValuesProvider } from "@/components/panel/values-context";
import { getActiveArea, getAreas } from "@/lib/areas";
import { displayName, getCurrentUser } from "@/lib/auth";
import { getBranding } from "@/lib/branding";
import { getRevenueTotal } from "@/lib/metrics";
import { DEFAULT_SETTINGS, getSettings } from "@/lib/settings";

/** O painel depende de sessão/cookies — sempre dinâmico. */
export const dynamic = "force-dynamic";

export default async function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [branding, areas, activeArea] = await Promise.all([
    getBranding(),
    getAreas(),
    getActiveArea(),
  ]);

  // A barra de meta é MENSAL — independe do período selecionado no header.
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // Em paralelo: antes eram duas idas ao banco em sequência.
  const [settings, revenue] = activeArea
    ? await Promise.all([
        getSettings(activeArea.id),
        getRevenueTotal(activeArea.id, monthStart, now),
      ])
    : [null, 0];
  const currency = settings?.currency ?? DEFAULT_SETTINGS.currency;

  // A meta operacional vem das settings da área; cai no valor da própria área.
  const goal = settings?.revenue_goal ?? activeArea?.revenue_goal ?? 0;

  const sidebarProps = {
    branding,
    areas,
    activeArea,
    userEmail: user.email ?? "",
  };

  return (
    <ValuesProvider>
      <Sidebar {...sidebarProps} />

      <div className="lg:pl-64">
        <Header
          {...sidebarProps}
          userName={displayName(user)}
          revenue={revenue}
          goal={goal}
          currency={currency}
        />
        <main className="p-4 lg:p-6">{children}</main>
      </div>
    </ValuesProvider>
  );
}
