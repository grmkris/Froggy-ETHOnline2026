import { TradingServiceName, TradingServiceRequest } from "@froggy/protocol";
import type { ServiceCard } from "@froggy/protocol";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@froggy/ui/components/alert";
import { Button } from "@froggy/ui/components/button";
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
import { Spinner } from "@froggy/ui/components/spinner";
import { Textarea } from "@froggy/ui/components/textarea";
import { Schema } from "effect";
import { useId, useState } from "react";
import type { ReactElement } from "react";

import type { ServiceApi } from "../../hooks/use-service-api";
import { formatCredits } from "../../lib/credit-view";
import { runLabel } from "../../lib/services-view";

const NETWORK_NAMES = new Map<string, string>(
  Object.entries({
    "eip155:1": "Ethereum",
    "eip155:10": "Optimism",
    "eip155:56": "BNB Chain",
    "eip155:137": "Polygon",
    "eip155:324": "ZKsync",
    "eip155:999": "HyperEVM",
    "eip155:4663": "Robinhood",
    "eip155:5000": "Mantle",
    "eip155:8453": "Base",
    "eip155:84532": "Base Sepolia",
    "eip155:42161": "Arbitrum",
    "eip155:43114": "Avalanche",
    "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp": "Solana",
    "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1": "Solana devnet",
  })
);

const defaultRpc = (network: string): string =>
  JSON.stringify(
    network.startsWith("eip155:")
      ? { method: "eth_blockNumber", params: [] }
      : { method: "getSlot", params: [{ commitment: "confirmed" }] },
    null,
    2
  );

const AddressField = ({
  label,
  name,
  prefix,
  disabled,
}: {
  readonly disabled: boolean;
  readonly label: string;
  readonly name: string;
  readonly prefix: string;
}): ReactElement => (
  <Field>
    <FieldLabel htmlFor={`${prefix}-${name}`}>{label}</FieldLabel>
    <Input
      autoComplete="off"
      disabled={disabled}
      id={`${prefix}-${name}`}
      maxLength={44}
      name={name}
      required
      spellCheck={false}
    />
  </Field>
);

const requestFrom = (
  card: ServiceCard,
  data: FormData,
  key: string
): TradingServiceRequest => {
  const read = (name: string) =>
    Schema.decodeUnknownSync(Schema.String)(data.get(name));
  const network = read("network");
  const service = Schema.decodeUnknownSync(TradingServiceName)(card.name);
  const shared = { v: 2, service: card.name, idempotencyKey: key };
  let input;
  switch (service) {
    case "watch_launches": {
      input = {
        network,
        durationMinutes: Number(data.get("durationMinutes")),
        minimumLiquidityUsd:
          read("minimumLiquidityUsd").trim() === ""
            ? null
            : Number(data.get("minimumLiquidityUsd")),
        source: read("source").trim() || null,
      };
      break;
    }
    case "market_search": {
      input = {
        network,
        query: read("query").trim() || null,
        limit: Number(data.get("limit")),
      };
      break;
    }
    case "token_inspect": {
      input = { network, address: read("address").trim() };
      break;
    }
    case "rpc_read": {
      input = {
        network,
        call: Schema.decodeUnknownSync(Schema.Json)(JSON.parse(read("call"))),
      };
      break;
    }
    case "quote_action": {
      input = {
        network,
        wallet: read("wallet").trim(),
        tokenIn: read("tokenIn").trim(),
        tokenOut: read("tokenOut").trim(),
        amount: read("amount").trim(),
        slippageBps: Math.round(Number(data.get("slippage")) * 100),
      };
      break;
    }
    case "token_research": {
      input = {
        network,
        address: read("address").trim(),
        cohortWindowBlocks: Number(data.get("cohortWindowBlocks") ?? 600),
        holderPageBudget: Number(data.get("holderPageBudget") ?? 20),
      };
      break;
    }
    default: {
      throw new Error("Choose a trading service.");
    }
  }
  return Schema.decodeUnknownSync(TradingServiceRequest)({ ...shared, input });
};

export const TradingServiceForm = ({
  card,
  onBack,
  onStarted,
  run,
}: {
  readonly card: ServiceCard;
  readonly onBack: () => void;
  readonly onStarted: () => void;
  readonly run: ServiceApi["run"];
}): ReactElement => {
  const prefix = useId();
  const [network, setNetwork] = useState(
    () =>
      card.networks?.find((value) => value === "eip155:8453") ??
      card.networks?.[0] ??
      ""
  );
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<string | null>(null);
  const disabled = run.isPending || card.status === "unavailable";
  return (
    <form
      aria-label={`Request ${card.title}`}
      className="bg-card shadow-card flex flex-col gap-5 rounded-2xl p-4 sm:p-5"
      onChange={() => {
        setKey(crypto.randomUUID());
        setError(null);
        run.reset();
      }}
      onSubmit={(event) => {
        event.preventDefault();
        if (disabled) {
          return;
        }
        try {
          const request = requestFrom(
            card,
            new FormData(event.currentTarget),
            key
          );
          run.mutate(request, { onSuccess: onStarted });
        } catch {
          setError(
            card.name === "rpc_read"
              ? "Use an allowed read method with its exact JSON parameters and network."
              : "Check the addresses, network and amounts. Amounts use whole smallest-token units."
          );
        }
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display text-lg font-semibold">{card.title}</h3>
        <Button
          disabled={run.isPending}
          onClick={onBack}
          size="sm"
          type="button"
          variant="ghost"
        >
          Back
        </Button>
      </div>
      {card.status === "demo" ? (
        <Alert>
          <AlertTitle>Simulated on this build</AlertTitle>
          <AlertDescription>{card.note}</AlertDescription>
        </Alert>
      ) : null}
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor={`${prefix}-network`}>Network</FieldLabel>
          <NativeSelect
            className="w-full"
            disabled={disabled}
            id={`${prefix}-network`}
            name="network"
            onChange={(event) => {
              setNetwork(event.target.value);
            }}
            value={network}
          >
            {(card.networks ?? []).map((value) => (
              <NativeSelectOption key={value} value={value}>
                {NETWORK_NAMES.get(value) ?? value}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        {card.name === "watch_launches" ? (
          <>
            <Field>
              <FieldLabel htmlFor={`${prefix}-duration`}>
                Duration (minutes)
              </FieldLabel>
              <Input
                defaultValue={5}
                disabled={disabled}
                id={`${prefix}-duration`}
                name="durationMinutes"
                min={1}
                max={60}
                required
                type="number"
              />
              <FieldDescription>
                One fixed price for the selected duration. Up to two polls per
                minute, 20 recent listings per poll, and 100 saved matches. No
                automatic renewal.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor={`${prefix}-liquidity`}>
                Minimum reported liquidity (USD, optional)
              </FieldLabel>
              <Input
                disabled={disabled}
                id={`${prefix}-liquidity`}
                name="minimumLiquidityUsd"
                min={0}
                step="any"
                type="number"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${prefix}-source`}>
                Listing source (optional)
              </FieldLabel>
              <Input
                disabled={disabled}
                id={`${prefix}-source`}
                name="source"
                maxLength={80}
              />
              <FieldDescription>
                Matches provider metadata exactly, ignoring case. This does not
                verify a launch program. Failed polls consume capacity; missed
                listings cannot be recovered.
              </FieldDescription>
            </Field>
          </>
        ) : null}
        {card.name === "market_search" ? (
          <>
            <Field>
              <FieldLabel htmlFor={`${prefix}-query`}>
                Token name or symbol
              </FieldLabel>
              <Input
                disabled={disabled}
                id={`${prefix}-query`}
                maxLength={120}
                name="query"
              />
              <FieldDescription>
                Leave empty for recent listings. A listing does not guarantee a
                trading route.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor={`${prefix}-limit`}>
                Maximum results
              </FieldLabel>
              <Input
                defaultValue={10}
                disabled={disabled}
                id={`${prefix}-limit`}
                max={20}
                min={1}
                name="limit"
                required
                type="number"
              />
            </Field>
          </>
        ) : null}
        {card.name === "token_inspect" ? (
          <AddressField
            disabled={disabled}
            label="Token address"
            name="address"
            prefix={prefix}
          />
        ) : null}
        {card.name === "token_research" ? (
          <>
            <AddressField
              disabled={disabled}
              label="Token address"
              name="address"
              prefix={prefix}
            />
            <Field>
              <FieldLabel htmlFor={`${prefix}-cohort`}>
                Cohort window (blocks)
              </FieldLabel>
              <Input
                defaultValue={600}
                disabled={disabled}
                id={`${prefix}-cohort`}
                max={3000}
                min={1}
                name="cohortWindowBlocks"
                required
                type="number"
              />
              <FieldDescription>
                Blocks after launch used for insider and early-sell checks. On
                Robinhood 600 blocks is about one minute; on Base it is longer.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor={`${prefix}-holders`}>
                Holder page budget
              </FieldLabel>
              <Input
                defaultValue={20}
                disabled={disabled}
                id={`${prefix}-holders`}
                max={20}
                min={1}
                name="holderPageBudget"
                required
                type="number"
              />
              <FieldDescription>
                Each page covers up to 10,000 blocks of Transfer history.
                Partial coverage is reported, never rounded away.
              </FieldDescription>
            </Field>
          </>
        ) : null}
        {card.name === "quote_action" ? (
          <>
            <AddressField
              disabled={disabled}
              label="Wallet address"
              name="wallet"
              prefix={prefix}
            />
            <AddressField
              disabled={disabled}
              label="Input token address"
              name="tokenIn"
              prefix={prefix}
            />
            <AddressField
              disabled={disabled}
              label="Output token address"
              name="tokenOut"
              prefix={prefix}
            />
            <Field>
              <FieldLabel htmlFor={`${prefix}-amount`}>
                Amount in smallest token units
              </FieldLabel>
              <Input
                disabled={disabled}
                id={`${prefix}-amount`}
                inputMode="numeric"
                maxLength={78}
                name="amount"
                pattern="[1-9][0-9]*"
                required
              />
              <FieldDescription>
                For a token with 6 decimals, 1 token is 1000000 units.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor={`${prefix}-slippage`}>
                Slippage tolerance (%)
              </FieldLabel>
              <Input
                defaultValue="0.5"
                disabled={disabled}
                id={`${prefix}-slippage`}
                max={50}
                min={0.01}
                name="slippage"
                required
                step={0.01}
                type="number"
              />
              <FieldDescription>
                ERC-20 tokens only, including wrapped native tokens. This
                requests a quote; no approval or trade is signed.
              </FieldDescription>
            </Field>
          </>
        ) : null}
        {card.name === "rpc_read" ? (
          <Field>
            <FieldLabel htmlFor={`${prefix}-call`}>RPC read (JSON)</FieldLabel>
            <Textarea
              className="text-machine min-h-36"
              defaultValue={defaultRpc(network)}
              disabled={disabled}
              id={`${prefix}-call`}
              key={network}
              maxLength={12_000}
              name="call"
              required
              spellCheck={false}
            />
            <FieldDescription>
              Use method and params. Only bounded balance, account, call and
              transaction-status reads are accepted. No signing or submission.
            </FieldDescription>
          </Field>
        ) : null}
      </FieldGroup>
      {error !== null || run.isError ? (
        <FieldError role="alert">{error ?? run.error?.message}</FieldError>
      ) : null}
      <p className="text-muted-foreground text-xs">
        {card.note} Credits are held while the task runs and used when its
        result is saved. Failed or canceled work returns credits once the
        outcome is known.
      </p>
      <Button
        className="min-h-11 self-start"
        disabled={disabled || network === ""}
        type="submit"
      >
        {run.isPending ? (
          <>
            <Spinner data-icon="inline-start" label="Starting" />
            Starting…
          </>
        ) : (
          runLabel(
            card,
            formatCredits(card.priceCreditUnits ?? card.priceUsdMicros)
          )
        )}
      </Button>
    </form>
  );
};
