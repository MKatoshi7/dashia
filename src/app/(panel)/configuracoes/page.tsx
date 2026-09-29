import { FolderTree } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { SettingsForm } from "@/app/(panel)/integracoes/integration-forms";
import { Card } from "@/components/ui/card";
import { getActiveArea, getAreas } from "@/lib/areas";
import { getBranding } from "@/lib/branding";
import { DEFAULT_SETTINGS, getSettings } from "@/lib/settings";

import { AreasManager } from "./areas-manager";
import { BrandingForm } from "./branding-form";
import { DashboardVersionForm } from "./dashboard-version-form";
import { PasswordForm } from "./password-form";

export const metadata: Metadata = { title: "Configurações" };
export const dynamic = "force-dynamic";

export default async function ConfiguracoesPage() {
  const [areas, activeArea, branding] = await Promise.all([
    getAreas(),
    getActiveArea(),
    getBranding(),
  ]);

  const settings = activeArea ? await getSettings(activeArea.id) : null;

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Áreas</h2>
          <p className="text-sm text-muted-foreground">
            Cada área tem suas próprias contas de anúncio, integrações,
            visitantes e vendas. Crie novas áreas pelo seletor no topo da
            sidebar.
          </p>
        </div>

        <Card className="p-4">
          {areas.length > 0 ? (
            <AreasManager areas={areas} activeAreaId={activeArea?.id ?? null} />
          ) : (
            <div className="flex items-center gap-3 py-6 text-sm text-muted-foreground">
              <FolderTree className="size-5" />
              Nenhuma área ainda. Use “Nova área” no topo da sidebar.
            </div>
          )}
        </Card>
      </div>

      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Dashboard</h2>
          <p className="text-sm text-muted-foreground">
            Qual layout o Dashboard mostra na área{" "}
            <strong>{activeArea?.nome ?? "ativa"}</strong>.
          </p>
        </div>

        <Card>
          {activeArea ? (
            <DashboardVersionForm
              current={settings?.dashboard_version ?? DEFAULT_SETTINGS.dashboard_version}
            />
          ) : (
            <p className="p-5 text-sm text-muted-foreground">
              Crie uma área para escolher o dashboard.
            </p>
          )}
        </Card>
      </div>

      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Minha senha</h2>
          <p className="text-sm text-muted-foreground">
            Troca a senha da conta com que você está logado.
          </p>
        </div>

        <Card>
          <PasswordForm />
        </Card>
      </div>

      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Branding</h2>
          <p className="text-sm text-muted-foreground">
            Identidade visual da instância (global, não por área). É o que torna
            este painel white label.
          </p>
        </div>

        <Card>
          <BrandingForm branding={branding} />
        </Card>
      </div>

      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            Preferências da área
          </h2>
          <p className="text-sm text-muted-foreground">
            Moeda, imposto e meta de faturamento da área{" "}
            <strong>{activeArea?.nome ?? "ativa"}</strong>. Para conectar a Meta
            e o seu checkout, vá em{" "}
            <Link
              href="/integracoes"
              className="font-medium text-primary hover:underline"
            >
              Integrações
            </Link>
            .
          </p>
        </div>

        <Card>
          {activeArea ? (
            <SettingsForm
              currency={(settings?.currency as string) ?? DEFAULT_SETTINGS.currency}
              taxRate={Number(settings?.tax_rate ?? DEFAULT_SETTINGS.tax_rate)}
              metaTaxRate={Number(
                settings?.meta_tax_rate ?? DEFAULT_SETTINGS.meta_tax_rate,
              )}
              revenueGoal={Number(
                settings?.revenue_goal ?? DEFAULT_SETTINGS.revenue_goal,
              )}
              allowedOrigins={(settings?.allowed_origins as string[]) ?? []}
            />
          ) : (
            <p className="p-5 text-sm text-muted-foreground">
              Crie uma área para configurar as preferências.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
