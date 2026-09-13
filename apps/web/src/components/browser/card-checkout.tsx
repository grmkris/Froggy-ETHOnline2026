import type { CardCheckout, TaskId } from "@froggy/domain";
import { CardCheckoutView } from "@froggy/protocol";
import { Button } from "@froggy/ui/components/button";
import { Field, FieldLabel } from "@froggy/ui/components/field";
import {
  NativeSelect,
  NativeSelectOption,
} from "@froggy/ui/components/native-select";
import { Schema } from "effect";
import { useEffect, useState } from "react";
import type { ReactElement } from "react";

import {
  useCardApi,
  useCardApproval,
  useCardCheckouts,
  usePaymentMethods,
} from "../../hooks/use-card-checkouts";

const labels: Readonly<Record<CardCheckout["stage"], string>> = {
  inspecting: "Inspecting checkout",
  awaiting_approval: "Awaiting approval",
  funding: "Funding",
  paying: "Paying",
  needs_help: "Needs your help",
  order_observed: "Order observed",
  outcome_unknown: "Outcome unknown",
  stopped: "Stopped",
  recovery_required: "Funding needs recovery",
};
const usdc = (value: string) =>
  `${(Number(value) / 1_000_000).toFixed(6)} USDC`;
const approvalLabel = (
  expired: boolean,
  busy: boolean,
  debit: string | undefined
): string => {
  if (expired) {
    return "Review expired";
  }
  if (busy) {
    return "Approving…";
  }
  return debit === "0" ? "Approve purchase" : "Fund & buy";
};
const PurchaseReview = ({
  checkout,
}: {
  readonly checkout: CardCheckout;
}): ReactElement => {
  const api = useCardApi();
  const approve = useCardApproval();
  const [busy, setBusy] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const { funding, inspection } = checkout;
  const act = (work: () => Promise<void>) => {
    setBusy(true);
    setRequestError(null);
    void (async () => {
      try {
        await work();
      } catch (error) {
        setRequestError(
          error instanceof Error ? error.message : "Purchase request failed."
        );
      }
      setBusy(false);
    })();
  };
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const expired = checkout.expiresAt !== null && checkout.expiresAt <= now;
  return (
    <section
      aria-label="Saved card purchase"
      className="bg-muted/40 flex flex-col gap-3 rounded-xl border p-4"
      aria-live="polite"
    >
      <div className="flex justify-between gap-3">
        <strong>{labels[checkout.stage]}</strong>
        {checkout.stubbed ? (
          <span className="text-muted-foreground text-xs">
            Demo · no real purchase
          </span>
        ) : null}
      </div>
      {inspection === null ? null : (
        <>
          <p className="text-sm">
            {inspection.item} · {inspection.merchant}
          </p>
          <p className="text-2xl font-semibold tabular-nums">
            {inspection.total}{" "}
            <span className="text-muted-foreground text-sm">
              {inspection.currency}
            </span>
          </p>
        </>
      )}
      {funding === null ? null : (
        <>
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-sm tabular-nums">
            {[
              ["Estimated card cost", funding.cost],
              ["Purchase buffer", funding.buffer],
              ["Existing Linea balance", funding.balance],
              ["Reserved for other purchases", funding.reserved],
              ["Bridge deduction", funding.bridgeDeduction],
              ["Exact Base debit", funding.baseDebit],
            ].map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-muted-foreground">{label}</dt>
                <dd>{usdc(value ?? "0")}</dd>
              </div>
            ))}
          </dl>
          <p className="text-muted-foreground text-xs">
            Coinbase estimate, including 5% or at least $1 buffer. Your issuer
            determines the settlement rate. Unspent USDC stays in your external
            wallet.
          </p>
        </>
      )}
      <p className="text-muted-foreground font-mono text-xs break-all">
        Linea destination: {checkout.fundingAddress}
      </p>
      {inspection?.paymentHosts.length ? (
        <p className="text-muted-foreground text-xs break-all">
          Payment frames: {inspection.paymentHosts.join(", ")}
        </p>
      ) : null}
      {checkout.bridge === null ? null : (
        <div className="text-xs">
          <p>
            Base deposit:{" "}
            {checkout.bridge.sourceConfirmed ? "Confirmed" : "Pending"}
          </p>
          <p>
            Linea arrival:{" "}
            {checkout.bridge.destinationConfirmed ? "Confirmed" : "Pending"}
          </p>
          <p className="text-muted-foreground">
            Block confirmations, not L1 finality.
          </p>
          {checkout.bridge.sourceTransaction === null ? null : (
            <p className="font-mono break-all">
              {checkout.bridge.sourceTransaction}
            </p>
          )}
          {checkout.bridge.fillTransaction === null ? null : (
            <p className="font-mono break-all">
              {checkout.bridge.fillTransaction}
            </p>
          )}
        </div>
      )}
      {checkout.order === null ? null : (
        <p className="text-sm">Observed order: {checkout.order}</p>
      )}
      <p className="text-muted-foreground text-xs">
        Card charge: unverified. Confirm it in your issuer dashboard. Froggy
        controls funding and credential release; the issuer controls merchant
        charging.
      </p>
      {checkout.error === null ? null : (
        <p className="text-sm">{checkout.error}</p>
      )}
      {requestError === null ? null : (
        <p role="alert" className="text-destructive text-sm">
          {requestError}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {checkout.stage === "awaiting_approval" ? (
          <Button
            disabled={busy || expired}
            onClick={() =>
              act(async () => {
                const view = Schema.decodeUnknownSync(CardCheckoutView)(
                  await api.request(`/api/card-checkouts/${checkout.id}`)
                );
                await approve(view);
              })
            }
          >
            {approvalLabel(expired, busy, funding?.baseDebit)}
          </Button>
        ) : null}
        {checkout.stoppedAt === null && checkout.stage !== "order_observed" ? (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() =>
              act(async () => {
                await api.request(`/api/card-checkouts/${checkout.id}/stop`, {
                  v: 1,
                });
                await api.refresh();
              })
            }
          >
            Stop purchase
          </Button>
        ) : null}
      </div>
    </section>
  );
};
export const BrowserCardCheckout = ({
  taskId,
}: {
  readonly taskId: TaskId;
}): ReactElement | null => {
  const methods = usePaymentMethods();
  const checkouts = useCardCheckouts();
  const api = useCardApi();
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const current = checkouts.data?.checkouts.find(
    (checkout) => checkout.taskId === taskId
  );
  const available =
    methods.data?.methods.filter(({ method }) => method.revokedAt === null) ??
    [];
  if (methods.data?.enabled !== true) {
    return null;
  }
  return (
    <div className="flex flex-col gap-3 border-t pt-3">
      {current === undefined ? (
        <>
          <Field>
            <FieldLabel htmlFor={`card-choice-${taskId}`}>
              Buy with saved card
            </FieldLabel>
            <NativeSelect
              id={`card-choice-${taskId}`}
              value={selected}
              onChange={(event) => setSelected(event.target.value)}
            >
              <NativeSelectOption value="">
                Choose a payment method
              </NativeSelectOption>
              {available.map(({ method }) => (
                <NativeSelectOption key={method.id} value={method.id}>
                  {method.label} ···· {method.last4}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Button
            variant="outline"
            disabled={selected === "" || busy}
            onClick={() => {
              setBusy(true);
              setRequestError(null);
              void (async () => {
                try {
                  await api.request("/api/card-checkouts/prepare", {
                    v: 1,
                    paymentMethodId: selected,
                    taskId,
                    idempotencyKey: crypto.randomUUID(),
                  });
                  await api.refresh();
                } catch (error) {
                  setRequestError(
                    error instanceof Error
                      ? error.message
                      : "Could not inspect checkout."
                  );
                }
                setBusy(false);
              })();
            }}
          >
            {busy ? "Preparing…" : "Review purchase"}
          </Button>
          {available.length === 0 ? (
            <a className="text-sm underline" href="/settings#payment-methods">
              Add a payment method in Account
            </a>
          ) : null}
        </>
      ) : (
        <PurchaseReview checkout={current} />
      )}
      {requestError === null ? null : (
        <p role="alert" className="text-destructive text-sm">
          {requestError}
        </p>
      )}
    </div>
  );
};
