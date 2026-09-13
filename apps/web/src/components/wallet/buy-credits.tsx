import { formatUsd } from "@froggy/domain";
import type {
  CreditPurchase as Purchase,
  CreditState,
  WalletSummary,
} from "@froggy/protocol";
import { CreditPurchase } from "@froggy/protocol";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@froggy/ui/components/alert";
import { Badge } from "@froggy/ui/components/badge";
import { Button } from "@froggy/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@froggy/ui/components/dialog";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@froggy/ui/components/field";
import { Input } from "@froggy/ui/components/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@froggy/ui/components/native-select";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@froggy/ui/components/toggle-group";
import { useQuery } from "@tanstack/react-query";
import { Schema } from "effect";
import { PlusIcon } from "lucide-react";
import { useEffect, useId, useState } from "react";

import { useCredits } from "../../hooks/use-credits";
import { formatCredits, purchaseAmount } from "../../lib/credit-view";
import { explorerUrl } from "../../lib/format";
import { useWorkspace } from "../../lib/workspace-context";
import { AddFunds } from "./add-funds";

type CreditsApi = ReturnType<typeof useCredits>;
const paymentAmount = (purchase: Purchase): string => {
  const hedera = purchase.network.startsWith("hedera:");
  const decimals = hedera ? 8 : 6;
  const padded = purchase.amount.padStart(decimals + 1, "0");
  const fraction = padded.slice(-decimals).replace(/0+$/u, "");
  return `${padded.slice(0, -decimals)}${fraction ? `.${fraction}` : ""} ${hedera ? "HBAR" : "USDC"}`;
};
const purchaseWords = {
  quoted: "Review your purchase",
  pending: "Payment is confirming",
  confirmed: "Credits added",
  failed: "Payment failed",
  uncertain: "Checking the payment outcome",
};

const CreditQuoteForm = ({
  api,
  funding,
  onQuoted,
}: {
  readonly api: CreditsApi;
  readonly funding: CreditState["funding"];
  readonly onQuoted: (purchase: Purchase) => void;
}) => {
  const [amount, setAmount] = useState("5");
  const [pack, setPack] = useState("5");
  const [network, setNetwork] = useState("");
  const [key, setKey] = useState(() => crypto.randomUUID());
  const id = useId();
  const rail =
    funding.find((entry) => entry.network === network) ??
    funding.find((entry) => entry.available);
  const units = purchaseAmount(amount);
  const disabled =
    units === null || rail?.available !== true || api.create.isPending;
  const edit = () => {
    setKey(crypto.randomUUID());
    api.create.reset();
  };
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (disabled || units === null || rail === undefined) {
          return;
        }
        api.create.mutate(
          {
            idempotencyKey: key,
            amountUsdMicros: units,
            network: rail.network,
          },
          { onSuccess: onQuoted }
        );
      }}
    >
      <FieldGroup>
        <Field>
          <FieldLabel>Choose an amount</FieldLabel>
          <ToggleGroup
            aria-label="Credit packs"
            value={[pack]}
            variant="outline"
            onValueChange={(values) => {
              const [value] = values;
              if (value === undefined || value === "") {
                return;
              }
              setPack(value);
              if (value !== "custom") {
                setAmount(value);
              }
              edit();
            }}
          >
            {["5", "10", "25", "custom"].map((value) => (
              <ToggleGroupItem key={value} value={value}>
                {value === "custom" ? "Custom" : `$${value}`}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Field>
        {pack === "custom" ? (
          <Field data-invalid={units === null}>
            <FieldLabel htmlFor={`${id}-amount`}>Amount in USD</FieldLabel>
            <Input
              id={`${id}-amount`}
              inputMode="decimal"
              value={amount}
              aria-invalid={units === null}
              onChange={(event) => {
                setAmount(event.target.value);
                edit();
              }}
            />
            <FieldDescription>
              From $1 to $100, in whole cents.
            </FieldDescription>
          </Field>
        ) : null}
        <Field>
          <FieldLabel htmlFor={`${id}-network`}>Pay with</FieldLabel>
          <NativeSelect
            id={`${id}-network`}
            value={rail?.network ?? ""}
            onChange={(event) => {
              setNetwork(event.target.value);
              edit();
            }}
          >
            {rail === undefined ? (
              <NativeSelectOption value="">
                No payment method available
              </NativeSelectOption>
            ) : null}
            {funding.map((entry) => (
              <NativeSelectOption
                value={entry.network}
                key={entry.network}
                disabled={!entry.available}
              >
                {entry.label}
                {entry.available ? "" : " · unavailable"}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <FieldDescription>
            The next step shows the exact token amount before you confirm.
          </FieldDescription>
          {funding
            .filter((entry) => !entry.available && entry.reason !== null)
            .map((entry) => (
              <p key={entry.network} className="text-muted-foreground text-xs">
                {entry.label}: {entry.reason}
              </p>
            ))}
        </Field>
        {units === null ? null : (
          <p className="text-money text-xl tabular-nums">
            {formatCredits(units)}{" "}
            <span className="text-muted-foreground text-sm">
              for {formatUsd(units)}
            </span>
          </p>
        )}
        <Button type="submit" disabled={disabled}>
          {api.create.isPending ? "Preparing purchase…" : "Review purchase"}
        </Button>
      </FieldGroup>
    </form>
  );
};

const CreditPurchaseReview = ({
  purchase,
  api,
  onChanged,
  onNew,
}: {
  readonly purchase: Purchase;
  readonly api: CreditsApi;
  readonly onChanged: (purchase: Purchase) => void;
  readonly onNew: () => void;
}) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  }, []);
  const pending = ["pending", "uncertain"].includes(purchase.status);
  const expired = now >= purchase.expiresAt;
  const transaction =
    purchase.transactionId === null
      ? null
      : explorerUrl(purchase.network, purchase.transactionId);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium">{purchaseWords[purchase.status]}</h3>
        {purchase.stubbed ? <Badge variant="outline">Simulated</Badge> : null}
      </div>
      <p className="text-money text-2xl tabular-nums">
        {formatCredits(purchase.creditUnits)}
      </p>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Payment</dt>
        <dd>{paymentAmount(purchase)}</dd>
        <dt className="text-muted-foreground">Network</dt>
        <dd>
          {purchase.network.startsWith("hedera:")
            ? purchase.network.replace("hedera:", "Hedera ")
            : "Base"}
        </dd>
        <dt className="text-muted-foreground">Recipient</dt>
        <dd className="text-machine break-all">{purchase.payTo}</dd>
      </dl>
      {purchase.status === "quoted" ? (
        <>
          <p className="text-muted-foreground text-xs">
            This quote expires at{" "}
            {new Date(purchase.expiresAt).toLocaleTimeString()}. Credits are
            added after payment confirms.
          </p>
          <Button
            disabled={api.pay.isPending || api.pay.isError || expired}
            onClick={() => {
              api.pay.mutate(purchase.id, { onSuccess: onChanged });
            }}
          >
            {api.pay.isPending
              ? "Confirming…"
              : `Confirm · ${paymentAmount(purchase)}`}
          </Button>
          {expired ? (
            <output>This quote expired. Start a new purchase.</output>
          ) : null}
        </>
      ) : null}
      {pending ? (
        <Alert>
          <AlertTitle>Keep this purchase</AlertTitle>
          <AlertDescription>
            The outcome is still being checked. Credits appear only after
            confirmation. You can close this window and return to the same
            purchase.
          </AlertDescription>
        </Alert>
      ) : null}
      {purchase.error === null ? null : <p role="alert">{purchase.error}</p>}
      {transaction === null ? null : (
        <a
          className="text-sm underline underline-offset-4"
          href={transaction}
          target="_blank"
          rel="noreferrer"
        >
          View payment on explorer
        </a>
      )}
      {purchase.status === "confirmed" ? (
        <p className="text-muted-foreground text-sm">
          Your credits are ready. Tools use this balance without another wallet
          payment.
        </p>
      ) : null}
      {!pending && !api.pay.isPending && !api.pay.isError ? (
        <Button variant="outline" onClick={onNew}>
          New purchase
        </Button>
      ) : null}
    </div>
  );
};

const creditFailure = (api: CreditsApi, error: Error | null): Error | null =>
  api.create.error ??
  api.pay.error ??
  error ??
  api.activity.error ??
  api.summary.error;
const CreditWalletHelp = ({
  wallet,
}: {
  readonly wallet: WalletSummary | null;
}) => (
  <details className="text-sm">
    <summary className="min-h-11 cursor-pointer py-3">
      Need funds in your wallet?
    </summary>
    <p className="text-muted-foreground mb-3">
      Deposit to your own wallet, then return here to buy credits.
    </p>
    {wallet?.hederaAccountId === null ||
    wallet?.hederaAccountId === undefined ? null : (
      <p className="mb-3 break-all">
        Your Hedera account:{" "}
        <span className="text-machine">{wallet.hederaAccountId}</span>
      </p>
    )}
    <AddFunds wallet={wallet} />
  </details>
);

export const BuyCredits = ({
  compact = false,
}: {
  readonly compact?: boolean;
}) => {
  const api = useCredits(true);
  const { app } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [resumeSaved, setResumeSaved] = useState(true);
  const [selected, setSelected] = useState<Purchase | null>(null);
  const saved = api.activity.data?.purchases.find((item) =>
    ["quoted", "pending", "uncertain"].includes(item.status)
  );
  const purchase = selected ?? (resumeSaved ? saved : null) ?? null;
  const state = useQuery({
    queryKey: ["credits", app.sessionId, "purchase", purchase?.id],
    enabled: open && purchase !== null,
    queryFn: async () =>
      Schema.decodeUnknownSync(CreditPurchase)(
        await api.request(`/purchases/${purchase?.id}`)
      ),
    refetchInterval: 3000,
    retry: false,
  });
  const current = state.data ?? purchase;
  const error = creditFailure(api, state.error);
  const changed = (value: Purchase) => {
    setSelected(value);
    void state.refetch();
  };
  const ready =
    api.activity.data !== undefined && api.summary.data !== undefined;
  const { wallet } = app;
  return (
    <>
      <Button
        size={compact ? "sm" : "default"}
        disabled={api.summary.isPending || api.activity.isPending}
        onClick={() => {
          setOpen(true);
        }}
      >
        <PlusIcon data-icon="inline-start" />
        Buy credits
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Buy credits</DialogTitle>
            <DialogDescription>
              100 credits = $1. Use credits for Froggy tools and browser tasks.
              Only you can buy more.
            </DialogDescription>
          </DialogHeader>
          {ready ? null : <output>Loading your saved purchases…</output>}
          {ready && current === null ? (
            <CreditQuoteForm
              api={api}
              funding={api.summary.data?.funding ?? []}
              onQuoted={setSelected}
            />
          ) : null}
          {current === null ? null : (
            <CreditPurchaseReview
              purchase={current}
              api={api}
              onChanged={changed}
              onNew={() => {
                setSelected(null);
                setResumeSaved(false);
                api.create.reset();
                api.pay.reset();
                void api.refresh();
              }}
            />
          )}
          {error === null ? null : (
            <Alert variant="destructive">
              <AlertTitle>Purchase needs attention</AlertTitle>
              <AlertDescription>{error.message}</AlertDescription>
              <Button
                variant="outline"
                onClick={() => {
                  void (async () => {
                    if (purchase !== null) {
                      const result = await state.refetch();
                      if (result.isSuccess) {
                        api.pay.reset();
                      }
                    }
                    await api.refresh();
                  })();
                }}
              >
                Check status
              </Button>
            </Alert>
          )}
          <CreditWalletHelp wallet={wallet} />
        </DialogContent>
      </Dialog>
    </>
  );
};
