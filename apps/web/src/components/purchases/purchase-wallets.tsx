import { Badge } from "@froggy/ui/components/badge";
import { Button } from "@froggy/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@froggy/ui/components/card";
import { useRef } from "react";
import type { ReactElement } from "react";

import type { PurchasesApi } from "../../hooks/use-purchases";
import { NETWORK_LABELS, tokenAmount } from "./purchase-details";

export const PurchaseWallets = ({
  api,
}: {
  readonly api: PurchasesApi;
}): ReactElement => {
  const creating = useRef(false);
  const needsSolana =
    api.wallets.data?.networks.some(
      (wallet) =>
        wallet.network.startsWith("solana:") && wallet.address === null
    ) === true;
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h3>Wallets for URL purchases</h3>
        </CardTitle>
        <CardDescription>
          Fund the address on its listed network.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-4">
        {api.wallets.isPending ? (
          <p className="text-muted-foreground">Loading wallets…</p>
        ) : null}
        {api.wallets.isError ? (
          <p className="text-destructive" role="alert">
            {api.wallets.error.message}
          </p>
        ) : null}
        {api.wallets.data?.stubbed === true ? (
          <Badge variant="secondary">Simulated wallets</Badge>
        ) : null}
        {api.wallets.data?.networks.map((wallet) => (
          <div className="flex min-w-0 flex-col gap-1.5" key={wallet.network}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="font-medium">{NETWORK_LABELS[wallet.network]}</h4>
              <Badge variant={wallet.ready ? "default" : "outline"}>
                {wallet.ready ? "Ready" : "Setup needed"}
              </Badge>
            </div>
            <p className="text-money">
              {wallet.balanceUnits === null
                ? "Balance unavailable"
                : `${tokenAmount(wallet.balanceUnits, wallet.symbol === "HBAR" ? 8 : 6)} ${wallet.symbol}`}
            </p>
            {wallet.address === null ? null : (
              <p
                className="text-machine break-all select-all"
                aria-label={`${NETWORK_LABELS[wallet.network]} funding address`}
              >
                {wallet.address}
              </p>
            )}
            <p className="text-muted-foreground text-xs">{wallet.note}</p>
          </div>
        ))}
        {api.createSolana.isError ? (
          <p className="text-destructive" role="alert">
            {api.createSolana.error.message}
          </p>
        ) : null}
        {needsSolana ? (
          <Button
            disabled={api.createSolana.isPending}
            onClick={() => {
              if (creating.current) {
                return;
              }
              creating.current = true;
              api.createSolana.mutate(undefined, {
                onSettled: () => {
                  creating.current = false;
                },
              });
            }}
            type="button"
            variant="outline"
          >
            {api.createSolana.isPending
              ? "Creating wallet…"
              : "Create Solana wallet"}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
};
