import type { TradeTicket } from "@froggy/protocol";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@froggy/ui/components/alert";
import { Badge } from "@froggy/ui/components/badge";
import { Button } from "@froggy/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@froggy/ui/components/card";
import { FieldError } from "@froggy/ui/components/field";
import { useRef } from "react";
import type { ReactElement } from "react";

import type { TradesApi } from "../../hooks/use-trades";
import { networkWords } from "../../lib/mandate-words";

const label = (value: string): string => value.replaceAll("_", " ");
const TradeProceeds = ({
  trade,
  onUseProceeds,
}: {
  readonly trade: TradeTicket;
  readonly onUseProceeds: (trade: TradeTicket) => void;
}): ReactElement | null => {
  if (trade.sourceTradeId !== undefined) {
    return (
      <p className="text-muted-foreground text-xs break-all">
        Funded from confirmed withdrawal {trade.sourceTradeId}.
      </p>
    );
  }
  if (
    trade.status !== "completed" ||
    trade.actualOutput === null ||
    !["withdraw", "claim"].includes(trade.input.action)
  ) {
    return null;
  }
  return (
    <Button
      type="button"
      variant="outline"
      onClick={() => {
        onUseProceeds(trade);
      }}
    >
      Use proceeds in a swap
    </Button>
  );
};

const TradeSettlement = ({
  trade,
}: {
  readonly trade: TradeTicket;
}): ReactElement => (
  <>
    {trade.actualInput === undefined ? null : (
      <p className="text-muted-foreground text-sm">
        Actual input used:{" "}
        <span className="text-foreground font-mono">{trade.actualInput}</span>{" "}
        smallest units.
      </p>
    )}
    {trade.phase === null || trade.phase === "standard" ? null : (
      <p className="text-muted-foreground text-sm">
        Approved phase:{" "}
        {trade.phase === "curve" ? "bonding curve" : "graduated pool"}.
      </p>
    )}
  </>
);

const TradeGas = ({ trade }: { readonly trade: TradeTicket }): ReactElement => {
  if (trade.steps.some((step) => step.payload.kind === "evm_calls")) {
    return (
      <div className="min-w-0">
        <dt className="text-muted-foreground text-xs">Gas paid by Froggy</dt>
        <dd className="mt-1 text-sm">
          No ETH or USDC gas charge to your wallet.
        </dd>
        <dd className="text-muted-foreground mt-1 text-xs">
          This approval covers all listed calls together. Privy enables EIP-7702
          execution on your existing wallet address if needed. It persists on
          this network until changed or revoked.
        </dd>
      </div>
    );
  }
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-xs">
        Native fee budget ·{" "}
        {trade.input.network.startsWith("solana:") ? "lamports" : "wei"}
      </dt>
      <dd className="text-money mt-1 text-sm break-all">
        {trade.input.maxNativeFee}
      </dd>
    </div>
  );
};

export const TradeReview = ({
  trade,
  api,
  onUseProceeds,
}: {
  readonly trade: TradeTicket;
  readonly api: TradesApi;
  readonly onUseProceeds: (trade: TradeTicket) => void;
}): ReactElement => {
  const answering = useRef(false);
  const next = trade.steps.find(
    (step) => step.status === "awaiting_approval" || step.status === "prepared"
  );
  const pending = trade.status === "executing" || trade.status === "uncertain";
  const ready = trade.status === "awaiting_approval" && next !== undefined;
  const answer = (decision: "allow_once" | "deny" | "deny_stop"): void => {
    if (next === undefined || answering.current) {
      return;
    }
    answering.current = true;
    api.answer.mutate(
      {
        id: trade.id,
        answer: {
          v: 1,
          stepId: next.id,
          approvalId: next.approvalId,
          fingerprint: next.fingerprint,
          decision,
        },
      },
      {
        onSettled: () => {
          answering.current = false;
        },
      }
    );
  };
  const error = api.answer.variables?.id === trade.id ? api.answer.error : null;
  const ponsCurve = trade.input.venue === "pons" && trade.phase === "curve";
  return (
    <Card data-trade-id={trade.id}>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>
            {
              {
                uniswap: "Uniswap",
                jupiter: "Jupiter",
                enso: "Enso",
                pons: "Pons",
                pump: "Pump",
              }[trade.input.venue]
            }{" "}
            · {label(trade.input.action)}
          </CardTitle>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{label(trade.status)}</Badge>
            {trade.stubbed ? (
              <Badge variant="outline">Simulated · no funds move</Badge>
            ) : null}
          </div>
        </div>
        <CardDescription>
          {networkWords(trade.input.network)} ·{" "}
          {new Date(trade.createdAt).toLocaleTimeString()}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-5">
        <dl className="grid min-w-0 gap-4 sm:grid-cols-2">
          <div className="min-w-0">
            <dt className="text-muted-foreground text-xs">
              {["pump", "pons"].includes(trade.input.venue)
                ? "Maximum input"
                : "Input amount"}{" "}
              · smallest units
            </dt>
            <dd className="text-money mt-1 text-2xl break-all">
              {trade.input.amount}
            </dd>
            <dd className="text-muted-foreground mt-1 font-mono text-xs break-all">
              {trade.input.tokenIn}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted-foreground text-xs">
              {ponsCurve ? "Minimum at full input" : "Minimum received"} ·
              smallest units
            </dt>
            <dd className="text-money mt-1 text-2xl break-all">
              {trade.minimumOutput ?? "Pending"}
            </dd>
            {ponsCurve ? (
              <dd className="text-muted-foreground mt-1 text-xs">
                A partial fill reduces this minimum in proportion to the input
                used. Unused input is refunded.
              </dd>
            ) : null}
            <dd className="text-muted-foreground mt-1 font-mono text-xs break-all">
              {trade.input.tokenOut}
            </dd>
          </div>
          <TradeGas trade={trade} />
          <div className="min-w-0">
            <dt className="text-muted-foreground text-xs">Wallet</dt>
            <dd className="mt-1 font-mono text-xs break-all">
              {trade.input.wallet}
            </dd>
          </div>
        </dl>
        <TradeSettlement trade={trade} />
        {trade.error === null ? null : (
          <Alert>
            <AlertTitle>Trade update</AlertTitle>
            <AlertDescription>{trade.error}</AlertDescription>
          </Alert>
        )}
        <ol className="flex flex-col gap-3" aria-label="Transaction steps">
          {trade.steps.map((step, index) => (
            <li className="border-border min-w-0 border-t pt-3" key={step.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium">
                  {index + 1}. {label(step.kind)}
                </span>
                <Badge variant="outline">{label(step.status)}</Badge>
              </div>
              <p className="text-muted-foreground mt-1 text-sm">
                {step.description}
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                Simulation {step.simulation.status} · {step.simulation.provider}{" "}
                · block {step.simulation.block}
              </p>
              {step.transactionId === null ? null : (
                <p className="mt-2 font-mono text-xs break-all">
                  Transaction: {step.transactionId}
                </p>
              )}
              <details className="mt-2 min-w-0 text-xs">
                <summary className="text-muted-foreground cursor-pointer">
                  Review exact transaction
                </summary>
                <pre className="bg-muted mt-2 max-h-48 overflow-auto rounded-lg p-3 break-all whitespace-pre-wrap">
                  {JSON.stringify(step.payload, null, 2)}
                </pre>
                <p className="mt-2 font-mono break-all">
                  Approval fingerprint: {step.fingerprint}
                </p>
              </details>
            </li>
          ))}
        </ol>
        {ready ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm">
              Approve step{" "}
              {trade.steps.findIndex((step) => step.id === next.id) + 1} once.
              Simulation is refreshed before signing these exact transaction
              bytes.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={
                  api.answer.isPending || api.stopped.data?.stopped === true
                }
                onClick={() => {
                  answer("allow_once");
                }}
              >
                {api.answer.isPending
                  ? "Checking & signing…"
                  : "Approve this step"}
              </Button>
              <Button
                disabled={api.answer.isPending}
                onClick={() => {
                  answer("deny");
                }}
                variant="outline"
              >
                Decline
              </Button>
              <Button
                disabled={api.answer.isPending}
                onClick={() => {
                  answer("deny_stop");
                }}
                variant="ghost"
              >
                Decline & stop trading
              </Button>
            </div>
          </div>
        ) : null}
        <TradeProceeds trade={trade} onUseProceeds={onUseProceeds} />
        {pending ? (
          <div className="flex flex-col items-start gap-2">
            <p className="text-muted-foreground text-sm">
              Capital remains reserved until the transaction outcome is known.
            </p>
            <Button
              disabled={api.inspect.isPending}
              onClick={() => {
                api.inspect.mutate(trade.id);
              }}
              variant="outline"
            >
              Check transaction status
            </Button>
          </div>
        ) : null}
        {error === null ? null : <FieldError>{error.message}</FieldError>}
        {trade.events.length === 0 ? null : (
          <details className="text-xs">
            <summary className="text-muted-foreground cursor-pointer">
              Audit receipts · {trade.events.length}
            </summary>
            <ol className="mt-3 flex flex-col gap-3">
              {trade.events.map((event) => (
                <li key={event.id}>
                  <p className="font-medium">
                    {label(event.outcome)} ·{" "}
                    {new Date(event.at).toLocaleTimeString()}
                  </p>
                  <p className="mt-1">{event.reason}</p>
                  <p className="text-muted-foreground mt-1 font-mono break-all">
                    {event.id}
                  </p>
                </li>
              ))}
            </ol>
          </details>
        )}
      </CardContent>
    </Card>
  );
};
