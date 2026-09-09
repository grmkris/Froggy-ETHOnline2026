import type { Network } from "@froggy/domain";
import type { PurchaseTicket } from "@froggy/protocol";
import { Badge } from "@froggy/ui/components/badge";
import type { ReactElement } from "react";

export const NETWORK_LABELS: Record<Network, string> = {
  "eip155:8453": "Base",
  "eip155:84532": "Base Sepolia",
  "hedera:mainnet": "Hedera",
  "hedera:testnet": "Hedera testnet",
  "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp": "Solana",
  "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1": "Solana devnet",
};

/** String arithmetic preserves every digit of the amount being approved. */
export const tokenAmount = (units: string, decimals: number): string => {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) {
    return `${units} base units`;
  }
  if (decimals === 0) {
    return units;
  }
  const padded = units.padStart(decimals + 1, "0");
  const whole = padded.slice(0, -decimals);
  const fraction = padded.slice(-decimals).replace(/0+$/u, "");
  return fraction === "" ? whole : `${whole}.${fraction}`;
};

export const PurchaseDetails = ({
  purchase,
}: {
  readonly purchase: PurchaseTicket;
}): ReactElement => {
  const { quote, request } = purchase;
  const url = new URL(request.url);
  return (
    <div className="flex min-w-0 flex-col gap-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{request.method}</Badge>
        <span className="text-machine min-w-0 break-all">{url.origin}</span>
        {purchase.stubbed ? <Badge variant="secondary">Simulated</Badge> : null}
      </div>
      <dl className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5">
        <dt className="text-muted-foreground">Route</dt>
        <dd className="text-machine break-all">
          {url.pathname}
          {url.search}
        </dd>
        {quote === null ? null : (
          <>
            <dt className="text-muted-foreground">Network</dt>
            <dd>{NETWORK_LABELS[quote.amount.asset.network]}</dd>
            <dt className="text-muted-foreground">Amount</dt>
            <dd className="text-machine break-all">
              {tokenAmount(quote.amount.units, quote.amount.asset.decimals)}{" "}
              {quote.amount.asset.symbol}
            </dd>
            <dt className="text-muted-foreground">Token</dt>
            <dd className="text-machine break-all">{quote.amount.asset.id}</dd>
            <dt className="text-muted-foreground">Recipient</dt>
            <dd className="text-machine break-all">{quote.payTo}</dd>
          </>
        )}
      </dl>
      {request.body === null ? null : (
        <details>
          <summary className="focus-visible:outline-ring cursor-pointer rounded-sm text-sm underline-offset-4 hover:underline">
            JSON input sent to this URL
          </summary>
          <pre className="bg-muted text-machine mt-2 max-h-36 overflow-y-auto rounded-lg p-3 break-all whitespace-pre-wrap">
            {request.body}
          </pre>
        </details>
      )}
    </div>
  );
};
