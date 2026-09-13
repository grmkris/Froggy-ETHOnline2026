import { TradeInput } from "@froggy/domain";
import type {
  TradePrepare,
  TradeTicket,
  TradePosition,
} from "@froggy/protocol";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@froggy/ui/components/alert";
import { Badge } from "@froggy/ui/components/badge";
import { Button, buttonVariants } from "@froggy/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@froggy/ui/components/card";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "@froggy/ui/components/empty";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@froggy/ui/components/field";
import { Input } from "@froggy/ui/components/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@froggy/ui/components/native-select";
import { Link } from "@tanstack/react-router";
import { Schema } from "effect";
import { useId, useRef, useState } from "react";
import type { ReactElement } from "react";

import type { TradesApi } from "../../hooks/use-trades";
import { useTrades } from "../../hooks/use-trades";
import { networkWords } from "../../lib/mandate-words";
import { useWorkspace } from "../../lib/workspace-context";
import { TradePositionsPanel } from "./trade-positions";
import { TradeReview } from "./trade-review";
import { TradingRules } from "./trading-rules";

const routeKey = (route: {
  readonly venue: string;
  readonly network: string;
  readonly action: string;
}): string => `${route.venue}:${route.network}:${route.action}`;

type TradeRoute = NonNullable<
  TradesApi["capabilities"]["data"]
>["routes"][number];
const selectedRoute = (api: TradesApi, key: string): TradeRoute | undefined => {
  const routes = api.capabilities.data?.routes ?? [];
  return (
    routes.find((route) => routeKey(route) === key) ??
    routes.find((route) => route.mode !== "unavailable") ??
    routes[0]
  );
};
const tradeFormDisabled = (
  api: TradesApi,
  selected: TradeRoute | undefined
): boolean =>
  api.prepare.isPending ||
  api.capabilities.isPending ||
  api.capabilities.isError ||
  !api.enabled ||
  selected === undefined ||
  selected.mode === "unavailable" ||
  selected.wallet === null ||
  api.stopped.data?.stopped === true;

const TradeRouteFields = ({
  api,
  selected,
  id,
  onChange,
  locked,
}: {
  readonly api: TradesApi;
  readonly selected: TradeRoute | undefined;
  readonly id: string;
  readonly onChange: (key: string) => void;
  readonly locked: boolean;
}): ReactElement => (
  <>
    <Field>
      <FieldLabel htmlFor={`${id}-network`}>Network & route</FieldLabel>
      <NativeSelect
        disabled={
          locked ||
          api.prepare.isPending ||
          api.capabilities.isPending ||
          !api.enabled
        }
        id={`${id}-network`}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        value={selected === undefined ? "" : routeKey(selected)}
      >
        {api.capabilities.data?.routes.map((entry) => (
          <NativeSelectOption
            disabled={entry.mode === "unavailable"}
            key={routeKey(entry)}
            value={routeKey(entry)}
          >
            {networkWords(entry.network)} ·{" "}
            {
              {
                jupiter: "Jupiter swap",
                uniswap: "Uniswap V3 swap",
                enso: `Enso ${entry.action}`,
                pons: "Pons",
                pump: "Pump swap",
              }[entry.venue]
            }
            {entry.mode === "unavailable" ? " · unavailable" : ""}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </Field>
    <Field>
      <div className="flex items-center justify-between gap-2">
        <FieldLabel>Wallet</FieldLabel>
        <Badge variant="outline">
          {selected?.mode === "stub"
            ? "Simulated · no funds move"
            : (selected?.mode ?? "Loading")}
        </Badge>
      </div>
      <p className="text-muted-foreground font-mono text-xs break-all">
        {selected?.wallet ??
          "Create your embedded wallet on the Wallet page to trade."}
      </p>
    </Field>
  </>
);

const vaultPosition = (
  action: string | undefined,
  tokenIn: string,
  tokenOut: string
): string | null => {
  if (action === "deposit") {
    return tokenOut.trim();
  }
  return action === "withdraw" ? tokenIn.trim() : null;
};

const resolveTradeForm = (
  api: TradesApi,
  source: TradeTicket | null,
  network: string,
  tokenIn: string,
  amount: string
) => {
  const sourceKey =
    source === null
      ? network
      : `${source.input.network.startsWith("solana:") ? "jupiter" : "uniswap"}:${source.input.network}:swap`;
  const selected = selectedRoute(api, sourceKey);
  const spendToken = source?.input.tokenOut ?? tokenIn;
  const spendAmount = source?.actualOutput ?? amount;
  const solana = selected?.network.startsWith("solana:") === true;
  const disabled =
    tradeFormDisabled(api, selected) ||
    (source !== null && selected?.network !== source.input.network);
  return { selected, spendToken, spendAmount, solana, disabled };
};

const initialTradeFields = (withdrawal: TradePosition | null) => ({
  network: withdrawal === null ? "" : "enso:eip155:1:withdraw",
  tokenIn: withdrawal?.asset ?? "",
  tokenOut: withdrawal?.underlying ?? "",
  amount: withdrawal?.withdrawableShares ?? "",
});

const TradeForm = ({
  api,
  source,
  clearSource,
  withdrawal,
}: {
  readonly api: TradesApi;
  readonly source: TradeTicket | null;
  readonly clearSource: () => void;
  readonly withdrawal: TradePosition | null;
}): ReactElement => {
  const id = useId();
  const initial = initialTradeFields(withdrawal);
  const [network, setNetwork] = useState(initial.network);
  const [tokenIn, setTokenIn] = useState(initial.tokenIn);
  const [tokenOut, setTokenOut] = useState(initial.tokenOut);
  const [amount, setAmount] = useState(initial.amount);
  const [fee, setFee] = useState("");
  const [slippage, setSlippage] = useState("100");
  const [error, setError] = useState<string | null>(null);
  const keys = useRef(new Map<string, string>());
  const submitting = useRef(false);
  const { selected, spendToken, spendAmount, solana, disabled } =
    resolveTradeForm(api, source, network, tokenIn, amount);
  const submit = (): void => {
    if (submitting.current || disabled) {
      return;
    }
    const decoded = Schema.decodeUnknownResult(TradeInput)({
      network: selected?.network,
      venue: selected?.venue,
      action: selected?.action,
      wallet: selected?.wallet,
      tokenIn: spendToken.trim(),
      tokenOut: tokenOut.trim(),
      amount: spendAmount.trim(),
      position: vaultPosition(selected?.action, tokenIn, tokenOut),
      slippageBps: Number(slippage),
      maxNativeFee: fee.trim(),
    });
    if (decoded._tag === "Failure") {
      setError(
        "Enter valid token addresses, positive whole-unit amounts, and slippage from 1 to 5000 basis points."
      );
      return;
    }
    setError(null);
    const digest = JSON.stringify({
      input: decoded.success,
      source: source?.id,
    });
    let key = keys.current.get(digest);
    if (key === undefined) {
      key = crypto.randomUUID();
      keys.current.set(digest, key);
    }
    let request: TradePrepare = {
      v: 1,
      input: decoded.success,
      idempotencyKey: key,
    };
    if (source !== null) {
      request = { ...request, sourceTradeId: source.id };
    }
    submitting.current = true;
    api.prepare.mutate(request, {
      onSettled: () => {
        submitting.current = false;
      },
    });
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>Prepare a trade</CardTitle>
        <CardDescription>
          Exact input · each transaction approved separately
        </CardDescription>
      </CardHeader>
      <CardContent>
        {source === null ? null : (
          <Alert className="mb-5">
            <AlertTitle>Use confirmed withdrawal proceeds</AlertTitle>
            <AlertDescription>
              {spendAmount} received base units. The swap needs a new approval
              and its own fee budget.
              <Button type="button" variant="link" onClick={clearSource}>
                Choose a different trade
              </Button>
            </AlertDescription>
          </Alert>
        )}
        <form
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <FieldGroup>
            <TradeRouteFields
              api={api}
              id={id}
              onChange={setNetwork}
              selected={selected}
              locked={source !== null}
            />
            <Field>
              <FieldLabel htmlFor={`${id}-in`}>
                {selected?.action === "withdraw"
                  ? "Vault shares to redeem"
                  : "Token to spend"}
              </FieldLabel>
              <Input
                disabled={disabled || source !== null}
                id={`${id}-in`}
                onChange={(event) => {
                  setTokenIn(event.target.value);
                }}
                placeholder={solana ? "Mint address or native" : "0x…"}
                required
                spellCheck={false}
                value={spendToken}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${id}-out`}>
                {selected?.action === "deposit"
                  ? "Vault shares to receive"
                  : "Token to receive"}
              </FieldLabel>
              <Input
                disabled={disabled}
                id={`${id}-out`}
                onChange={(event) => {
                  setTokenOut(event.target.value);
                }}
                placeholder={solana ? "Mint address or native" : "0x…"}
                required
                spellCheck={false}
                value={tokenOut}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${id}-amount`}>
                Input amount · smallest units
              </FieldLabel>
              <Input
                disabled={disabled || source !== null}
                id={`${id}-amount`}
                inputMode="numeric"
                onChange={(event) => {
                  setAmount(event.target.value);
                }}
                pattern="[0-9]+"
                required
                value={spendAmount}
              />
              <FieldDescription>
                {solana && tokenIn.trim() === "native"
                  ? "1 SOL = 1000000000 lamports."
                  : "For a token with 6 decimals, 1 token is 1000000 units."}
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor={`${id}-fee`}>
                Maximum native fee · {solana ? "lamports" : "wei"}
              </FieldLabel>
              <Input
                disabled={disabled}
                id={`${id}-fee`}
                inputMode="numeric"
                onChange={(event) => {
                  setFee(event.target.value);
                }}
                pattern="[0-9]+"
                required
                value={fee}
              />
              <FieldDescription>
                This budget is separate from the token amount.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor={`${id}-slippage`}>
                Slippage · basis points
              </FieldLabel>
              <Input
                disabled={disabled}
                id={`${id}-slippage`}
                max={5000}
                min={1}
                onChange={(event) => {
                  setSlippage(event.target.value);
                }}
                required
                type="number"
                value={slippage}
              />
              <FieldDescription>100 basis points = 1%.</FieldDescription>
            </Field>
          </FieldGroup>
          {selected?.limitations.map((limitation) => (
            <p className="text-muted-foreground text-xs" key={limitation}>
              {limitation}
            </p>
          ))}
          {error === null ? null : <FieldError>{error}</FieldError>}
          {api.prepare.isError ? (
            <FieldError>{api.prepare.error.message}</FieldError>
          ) : null}
          <Button disabled={disabled} type="submit">
            {api.prepare.isPending
              ? "Preparing & simulating…"
              : "Prepare trade"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

export const TradePanel = (): ReactElement => {
  const { app } = useWorkspace();
  const api = useTrades(app.sessionId);
  const [source, setSource] = useState<TradeTicket | null>(null);
  const [withdrawal, setWithdrawal] = useState<TradePosition | null>(null);
  const capabilities = api.capabilities.data;
  const stopped = api.stopped.data?.stopped === true;
  return (
    <section
      aria-label="Trading desk"
      className="flex min-w-0 scroll-mt-6 flex-col gap-5"
      id="trading"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-section">Trading desk</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Prepare, inspect, approve. Every transaction has a receipt.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">Owner approvals</Badge>
          <Button
            disabled={api.stop.isPending || !api.enabled}
            onClick={() => {
              api.stop.mutate(!stopped);
            }}
            variant={stopped ? "outline" : "destructive"}
          >
            {stopped ? "Resume trading" : "Stop trading"}
          </Button>
        </div>
      </div>
      {stopped ? (
        <Alert>
          <AlertTitle>Trading stopped</AlertTitle>
          <AlertDescription>
            New signing attempts are blocked. Submitted transactions can still
            settle and remain available for reconciliation.
          </AlertDescription>
        </Alert>
      ) : null}
      {capabilities?.routes.every((route) => route.mode === "unavailable") ===
      true ? (
        <Alert>
          <AlertTitle>Live trading is not configured</AlertTitle>
          <AlertDescription>
            Execution needs the trading provider, independent simulation, and
            chain connection. Existing trade records remain available below.
          </AlertDescription>
        </Alert>
      ) : null}
      <TradePositionsPanel
        api={api}
        onWithdraw={(position) => {
          setSource(null);
          setWithdrawal(position);
        }}
      />
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(17rem,1fr)_minmax(0,1.5fr)]">
        <TradeForm
          key={`${source?.id ?? ""}:${withdrawal?.asset ?? ""}`}
          withdrawal={withdrawal}
          api={api}
          source={source}
          clearSource={() => {
            setSource(null);
          }}
        />
        <div aria-label="Trade history" className="flex min-w-0 flex-col gap-4">
          {api.trades.isError ? (
            <Alert>
              <AlertTitle>Could not load trades</AlertTitle>
              <AlertDescription>{api.trades.error.message}</AlertDescription>
            </Alert>
          ) : null}
          {api.trades.data?.trades.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>No trades yet</EmptyTitle>
                <EmptyDescription>
                  Your prepared trades and audit receipts will appear here.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : null}
          {api.trades.data?.trades.map((trade) => (
            <TradeReview
              api={api}
              key={trade.id}
              trade={trade}
              onUseProceeds={(selectedTrade) => {
                setWithdrawal(null);
                setSource(selectedTrade);
              }}
            />
          ))}
        </div>
      </div>
      <TradingRules sessionId={app.sessionId} trading={api} />
      {api.stop.isError ? (
        <FieldError>{api.stop.error.message}</FieldError>
      ) : null}
    </section>
  );
};

export const TradeNotice = ({
  api,
}: {
  readonly api: TradesApi;
}): ReactElement | null => {
  const pending =
    api.trades.data?.trades.filter(
      (trade) => trade.status === "awaiting_approval"
    ) ?? [];
  if (pending.length === 0) {
    return null;
  }
  return (
    <output className="border-border bg-background flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-[26px] py-3">
      <span className="text-sm">
        {pending.length === 1
          ? "A trade is ready for your review."
          : `${pending.length} trades are ready for your review.`}
      </span>
      <Link
        className={buttonVariants({ variant: "outline", size: "sm" })}
        search={{ view: "trading" }}
        to="/services"
      >
        Review trades
      </Link>
    </output>
  );
};
