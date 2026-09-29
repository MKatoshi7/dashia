"use client";

import { Check, Loader2, Plug, Search, Trash2 } from "lucide-react";
import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { accountStatusLabel } from "@/lib/meta/accounts";
import { cn } from "@/lib/utils";

import {
  connectAccounts,
  deleteAdAccount,
  discoverAccounts,
  saveAccountCurrency,
  type DiscoverState,
  type FormState,
} from "./actions";

export type AccountRow = {
  id: string;
  label: string;
  ad_account_id: string;
  hasToken: boolean;
  /** Moeda da conta na Meta; null = mesma da área. */
  currency: string | null;
  /** Cotação fixa; null = automática (cotação do dia). */
  fxRate: number | null;
};

const CURRENCIES = ["BRL", "USD", "EUR", "GBP", "ARS", "MXN", "COP", "CLP", "PEN"];

/**
 * Moeda da conta + cotação. Conta em USD num painel em BRL tem gasto e
 * faturamento convertidos em Campanhas e no Dashboard.
 */
function AccountCurrency({
  account,
  areaCurrency,
}: {
  account: AccountRow;
  areaCurrency: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    saveAccountCurrency,
    {},
  );
  const current = account.currency ?? areaCurrency;
  const [currency, setCurrency] = useState(current);
  const options = CURRENCIES.includes(current) ? CURRENCIES : [current, ...CURRENCIES];
  const converts = currency !== areaCurrency;

  return (
    <form action={action} className="flex flex-wrap items-end gap-2 pl-12">
      <input type="hidden" name="id" value={account.id} />
      <div>
        <Label htmlFor={`cur-${account.id}`} className="text-[0.65rem]">
          Moeda da conta
        </Label>
        <select
          id={`cur-${account.id}`}
          name="currency"
          value={currency}
          onChange={(e) => setCurrency(e.currentTarget.value)}
          className="h-8 rounded-md border border-border bg-[hsl(var(--muted)/0.5)] px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          {options.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </select>
      </div>
      {converts ? (
        <div>
          <Label htmlFor={`fx-${account.id}`} className="text-[0.65rem]">
            1 {currency} = ? {areaCurrency}
          </Label>
          <Input
            id={`fx-${account.id}`}
            name="fx_rate"
            inputMode="decimal"
            defaultValue={account.fxRate ?? ""}
            placeholder="automática (do dia)"
            className="h-8 w-40 text-xs"
          />
        </div>
      ) : (
        <input type="hidden" name="fx_rate" value="" />
      )}
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? "Salvando..." : "Salvar"}
      </Button>
      <Feedback state={state} />
    </form>
  );
}

function Feedback({ state }: { state: { error?: string; ok?: string } }) {
  if (state.error) {
    return (
      <p role="alert" className="text-xs text-destructive">
        {state.error}
      </p>
    );
  }
  if (state.ok) return <p className="text-xs text-primary">{state.ok}</p>;
  return null;
}

/** Linha de conta já conectada, com remoção. */
function ConnectedAccount({
  account,
  areaCurrency,
}: {
  account: AccountRow;
  areaCurrency: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    deleteAdAccount,
    {},
  );

  return (
    <li className="list-tile space-y-2 p-3">
      <div className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-[hsl(var(--primary)/0.25)] bg-[hsl(var(--primary)/0.1)] text-primary">
          <Plug className="size-4" />
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium tracking-tight">
            {account.label}
          </p>
          <p className="micro-label truncate">{account.ad_account_id}</p>
        </div>

        {account.hasToken ? (
          <span className="micro-label hidden items-center gap-1 text-primary sm:inline-flex">
            <Check className="size-3" /> token
          </span>
        ) : null}

        <form action={action}>
          <input type="hidden" name="id" value={account.id} />
          <Button
            type="submit"
            size="icon"
            variant="ghost"
            disabled={pending}
            aria-label={`Remover ${account.label}`}
            title={state.error ?? "Remover conta"}
          >
            <Trash2 className="size-4" />
          </Button>
        </form>
      </div>
      <AccountCurrency account={account} areaCurrency={areaCurrency} />
    </li>
  );
}

/**
 * Conexão da Meta em duas etapas:
 *   1. cola o token do System User → o painel LISTA todas as contas que ele vê;
 *   2. marca as que quer → conecta todas de uma vez.
 *
 * Ninguém precisa digitar `act_<id>` na mão. O token nunca volta do servidor:
 * quem o guarda é este campo, que o usuário acabou de preencher.
 */
export function MetaConnect({
  accounts,
  areaCurrency,
}: {
  accounts: AccountRow[];
  areaCurrency: string;
}) {
  const [token, setToken] = useState("");

  const [discovery, runDiscover, discovering] = useActionState<
    DiscoverState,
    FormData
  >(discoverAccounts, {});

  const [connectState, runConnect, connecting] = useActionState<
    FormState,
    FormData
  >(connectAccounts, {});

  const connectedIds = new Set(accounts.map((a) => a.ad_account_id));
  const found = discovery.accounts ?? [];

  return (
    <div className="space-y-5 p-5">
      {/* Já conectadas */}
      {accounts.length > 0 ? (
        <div>
          <p className="micro-label mb-2">Contas conectadas</p>
          <ul className="space-y-1">
            {accounts.map((account) => (
              <ConnectedAccount
                key={account.id}
                account={account}
                areaCurrency={areaCurrency}
              />
            ))}
          </ul>
        </div>
      ) : null}

      {/* Etapa 1 — token */}
      <form action={runDiscover} className="space-y-2">
        <Label htmlFor="ads_token">Token do System User</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="ads_token"
            name="ads_token"
            type="password"
            autoComplete="off"
            placeholder="Cole o token com ads_read e ads_management"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            required
          />
          <Button
            type="submit"
            variant="primary"
            disabled={discovering || !token.trim()}
            className="shrink-0"
          >
            {discovering ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Search className="size-4" />
            )}
            Buscar contas
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          O token é validado na Meta e cifrado antes de ir para o banco. O painel
          nunca o exibe de volta.
        </p>
        <Feedback state={{ error: discovery.error }} />
      </form>

      {/* Etapa 2 — escolher contas */}
      {found.length > 0 ? (
        <form action={runConnect} className="space-y-3">
          <input type="hidden" name="ads_token" value={token} />

          <div className="flex items-baseline justify-between gap-3">
            <p className="micro-label">
              {found.length} conta(s) encontrada(s)
            </p>
            <p className="micro-label">marque as que quer conectar</p>
          </div>

          <ul className="max-h-80 space-y-1 overflow-y-auto rounded-xl border border-border p-1">
            {found.map((account) => {
              const already = connectedIds.has(account.id);
              const status = accountStatusLabel(account.status);

              return (
                <li key={account.id}>
                  <label
                    className={cn(
                      "list-tile flex cursor-pointer items-center gap-3 p-3",
                      already && "opacity-60",
                    )}
                  >
                    <input
                      type="checkbox"
                      name="selected"
                      value={account.id}
                      defaultChecked={already}
                      className="size-4 shrink-0 accent-[hsl(var(--primary))]"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium tracking-tight">
                        {account.name}
                      </p>
                      <p className="micro-label truncate">
                        {account.id}
                        {account.currency ? ` · ${account.currency}` : ""}
                        {account.businessName ? ` · ${account.businessName}` : ""}
                      </p>
                    </div>
                    {status ? (
                      <span className="micro-label shrink-0 text-destructive">
                        {status}
                      </span>
                    ) : null}
                    {already ? (
                      <span className="micro-label shrink-0 text-primary">
                        conectada
                      </span>
                    ) : null}
                  </label>
                </li>
              );
            })}
          </ul>

          <div className="flex items-center gap-3">
            <Button type="submit" variant="primary" disabled={connecting}>
              {connecting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}
              Conectar selecionadas
            </Button>
            <Feedback state={connectState} />
          </div>
        </form>
      ) : null}
    </div>
  );
}
