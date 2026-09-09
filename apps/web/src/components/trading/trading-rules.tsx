import type { TradeRule } from "@froggy/domain";
import { TradeRuleRequest } from "@froggy/protocol";
import { Badge } from "@froggy/ui/components/badge";
import { Button } from "@froggy/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@froggy/ui/components/card";
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
import { Schema } from "effect";
import { useId, useState } from "react";
import type { ReactElement } from "react";

import type { TradesApi } from "../../hooks/use-trades";
import { useTradingRules } from "../../hooks/use-trading-rules";
import type { TradingRulesApi } from "../../hooks/use-trading-rules";
import { networkWords } from "../../lib/mandate-words";

const text = (data: FormData, name: string): string =>
  Schema.decodeUnknownSync(Schema.String)(data.get(name)).trim();
const optionalNumber = (data: FormData, name: string): number | null => {
  const value = text(data, name);
  return value === "" ? null : Number(value);
};
type Route = NonNullable<TradesApi["capabilities"]["data"]>["routes"][number];
const routeKey = (route: Route): string =>
  `${route.network}:${route.venue}:${route.action}`;

const RuleLimits = ({ id }: { readonly id: string }): ReactElement => (
  <FieldGroup className="grid gap-4 sm:grid-cols-2">
    {[
      {
        name: "maxInputPerTrade",
        label: "Maximum entry input · base units",
        value: "",
        type: "text",
      },
      {
        name: "maxTotalInput",
        label: "Total entry input · base units",
        value: "",
        type: "text",
      },
      {
        name: "maxNativeFeePerTrade",
        label: "Maximum native fee per trade · base units",
        value: "",
        type: "text",
      },
      {
        name: "maxTotalNativeFee",
        label: "Total native fees · base units",
        value: "",
        type: "text",
      },
      {
        name: "maxTrades",
        label: "Maximum entries",
        value: "3",
        type: "number",
      },
      {
        name: "maxOpenPositions",
        label: "Maximum open positions",
        value: "1",
        type: "number",
      },
      {
        name: "maxSlippageBps",
        label: "Maximum slippage · basis points",
        value: "100",
        type: "number",
      },
    ].map((field) => (
      <Field key={field.name}>
        <FieldLabel htmlFor={`${id}-${field.name}`}>{field.label}</FieldLabel>
        <Input
          defaultValue={field.value}
          id={`${id}-${field.name}`}
          inputMode="numeric"
          min="1"
          name={field.name}
          pattern={field.type === "text" ? "[0-9]+" : undefined}
          required
          type={field.type}
        />
      </Field>
    ))}
  </FieldGroup>
);

const RuleExitFields = ({ id }: { readonly id: string }): ReactElement => (
  <FieldGroup className="grid gap-4 sm:grid-cols-2">
    {[
      {
        name: "maxHoldMinutes",
        label: "Attempt exit after · minutes",
        value: "1",
        required: true,
      },
      {
        name: "takeProfitBps",
        label: "Take profit · basis points (optional)",
        value: "",
        required: false,
      },
      {
        name: "stopLossBps",
        label: "Stop loss · basis points (optional)",
        value: "",
        required: false,
      },
      {
        name: "minimumQuoteLiquidity",
        label: "Quote reserve floor · base units (optional)",
        value: "",
        required: false,
      },
      {
        name: "maxAttempts",
        label: "Maximum exit attempts per position",
        value: "1",
        required: true,
      },
    ].map((field) => (
      <Field key={field.name}>
        <FieldLabel htmlFor={`${id}-${field.name}`}>{field.label}</FieldLabel>
        <Input
          defaultValue={field.value}
          id={`${id}-${field.name}`}
          inputMode="numeric"
          name={field.name}
          pattern="[0-9]*"
          required={field.required}
        />
      </Field>
    ))}
    <FieldDescription className="sm:col-span-2">
      100 basis points = 1%. Returns use the quoted proceeds against acquired
      principal, excluding native fees. Liquidity means curve reserves or active
      pool quote reserves, not USD value.
    </FieldDescription>
  </FieldGroup>
);

const submitRule = (
  form: HTMLFormElement,
  options: {
    readonly api: TradingRulesApi;
    readonly route: Route;
    readonly watch:
      | NonNullable<TradingRulesApi["watches"]["data"]>["watches"][number]
      | undefined;
    readonly onError: (message: string | null) => void;
    readonly onSaved: () => void;
  }
): void => {
  const { api, route, watch, onError, onSaved } = options;
  const now = Date.now();
  const data = new FormData(form);
  try {
    const base = {
      v: 1,
      label: text(data, "label"),
      network: route.network,
      wallet: route.wallet,
      venues: [route.venue],
      actions: [route.action],
      inputAsset: route.quoteAsset ?? text(data, "inputAsset"),
      outputAssets: watch === undefined ? [text(data, "outputAsset")] : [],
      launchFactory: watch === undefined ? null : route.launchFactory,
      expiresAt:
        watch?.expiresAt ??
        now + Number(text(data, "durationMinutes")) * 60_000,
      maxInputPerTrade: text(data, "maxInputPerTrade"),
      maxTotalInput: text(data, "maxTotalInput"),
      maxNativeFeePerTrade: text(data, "maxNativeFeePerTrade"),
      maxTotalNativeFee: text(data, "maxTotalNativeFee"),
      maxTrades: Number(text(data, "maxTrades")),
      maxOpenPositions: Number(text(data, "maxOpenPositions")),
      maxSlippageBps: Number(text(data, "maxSlippageBps")),
    };
    const request =
      watch === undefined
        ? base
        : {
            ...base,
            watchId: watch.id,
            exits: {
              maxHoldMinutes: Number(text(data, "maxHoldMinutes")),
              takeProfitBps: optionalNumber(data, "takeProfitBps"),
              stopLossBps: optionalNumber(data, "stopLossBps"),
              minimumQuoteLiquidity:
                text(data, "minimumQuoteLiquidity") || null,
              maxAttempts: Number(text(data, "maxAttempts")),
            },
          };
    const checked = Schema.decodeUnknownSync(TradeRuleRequest)(request);
    onError(null);
    api.create.mutate(checked, {
      onSuccess: () => {
        onSaved();
        form.reset();
      },
    });
  } catch {
    onError(
      "Check the wallet, token addresses, positive unit amounts and bounded limits. Slippage must be 1–5000 basis points."
    );
  }
};

const RuleForm = ({
  api,
  route,
}: {
  readonly api: TradingRulesApi;
  readonly route: Route;
}): ReactElement => {
  const id = useId();
  const [watchId, setWatchId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const watches =
    api.watches.data?.watches.filter(
      (watch) =>
        watch.status === "active" &&
        watch.input.network === route.network &&
        watch.reaction === undefined
    ) ?? [];
  const watch = watches.find((entry) => entry.id === watchId);
  return (
    <form
      aria-label="Create trading rule"
      onSubmit={(event) => {
        event.preventDefault();
        submitRule(event.currentTarget, {
          api,
          route,
          watch,
          onError: setError,
          onSaved: () => {
            setWatchId("");
          },
        });
      }}
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor={`${id}-label`}>Rule name</FieldLabel>
          <Input
            id={`${id}-label`}
            maxLength={120}
            name="label"
            placeholder="My bounded trading rule"
            required
          />
        </Field>
        {route.launchFactory === undefined ? null : (
          <Field>
            <FieldLabel htmlFor={`${id}-watch`}>
              Automatic launch watch
            </FieldLabel>
            <NativeSelect
              id={`${id}-watch`}
              onChange={(event) => {
                setWatchId(event.target.value);
              }}
              value={watchId}
            >
              <NativeSelectOption value="">
                No watch · agent selects the trade
              </NativeSelectOption>
              {watches.map((entry) => (
                <NativeSelectOption key={entry.id} value={entry.id}>
                  {entry.input.durationMinutes} minutes ·{" "}
                  {entry.stubbed ? "Simulated" : "Live"} · {entry.id.slice(-6)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <FieldDescription>
              Buy a listing watch in Services first to authorize automatic
              entries and exits. One rule can attach to each watch.
            </FieldDescription>
          </Field>
        )}
        <Field>
          <FieldLabel htmlFor={`${id}-input`}>
            Authorized input asset
          </FieldLabel>
          <Input
            defaultValue={route.quoteAsset ?? ""}
            id={`${id}-input`}
            name="inputAsset"
            readOnly={route.quoteAsset !== undefined}
            required
            spellCheck={false}
          />
        </Field>
        {watch === undefined ? (
          <>
            <Field>
              <FieldLabel htmlFor={`${id}-output`}>
                Authorized output token
              </FieldLabel>
              <Input
                id={`${id}-output`}
                name="outputAsset"
                required
                spellCheck={false}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${id}-duration`}>
                Rule duration · minutes
              </FieldLabel>
              <Input
                defaultValue="15"
                id={`${id}-duration`}
                max="10080"
                min="1"
                name="durationMinutes"
                required
                type="number"
              />
            </Field>
          </>
        ) : (
          <p className="text-sm break-all">
            Authorize future {route.venue === "pons" ? "Pons" : "Pump"} launches
            verified against {route.launchFactory}. Only listings observed after
            activation can trigger entries. Expires{" "}
            {new Date(watch.expiresAt).toLocaleTimeString()}.
          </p>
        )}
        <RuleLimits id={id} />
        {watch === undefined ? null : <RuleExitFields id={id} />}
        <p className="text-muted-foreground text-sm">
          Principal stays in your wallet. Automatic checks stop at expiry and a
          trigger may not fill. Use the trading form to exit remaining tokens
          manually. Live signing also requires a matching Privy agent policy.
        </p>
        {error === null ? null : <FieldError>{error}</FieldError>}
        {api.create.isError ? (
          <FieldError>{api.create.error.message}</FieldError>
        ) : null}
        <Button
          className="min-h-11"
          disabled={
            !api.enabled ||
            api.create.isPending ||
            route.wallet === null ||
            route.mode === "unavailable"
          }
          type="submit"
        >
          {api.create.isPending
            ? "Authorizing…"
            : "Authorize this trading rule"}
        </Button>
      </FieldGroup>
    </form>
  );
};

const RuleSummary = ({
  rule,
  api,
}: {
  readonly rule: TradeRule;
  readonly api: TradingRulesApi;
}): ReactElement => {
  const revoked = rule.revokedAt !== null;
  return (
    <article className="border-border flex min-w-0 flex-col gap-3 border-t pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-medium">{rule.label}</h3>
        <Badge variant="secondary">
          {revoked ? "Revoked" : "Authorized until expiry"}
        </Badge>
      </div>
      <p className="text-machine break-all">{rule.id}</p>
      <p className="text-sm">
        {networkWords(rule.network)} · {rule.maxTrades} entries ·{" "}
        {rule.maxOpenPositions} open positions maximum
      </p>
      <p className="text-muted-foreground text-sm break-all">
        Input {rule.maxInputPerTrade} per entry / {rule.maxTotalInput} total.
        Native fees {rule.maxNativeFeePerTrade} per trade /{" "}
        {rule.maxTotalNativeFee} total. All amounts are base units.
      </p>
      <p className="text-muted-foreground text-xs">
        Expires {new Date(rule.expiresAt).toLocaleString()}.
      </p>
      {revoked ? null : (
        <Button
          className="min-h-11 self-start"
          disabled={api.revoke.isPending}
          onClick={() => {
            api.revoke.mutate(rule.id);
          }}
          variant="outline"
        >
          Revoke rule
        </Button>
      )}
    </article>
  );
};

export const TradingRules = ({
  trading,
  sessionId,
}: {
  readonly trading: TradesApi;
  readonly sessionId: string | null;
}): ReactElement => {
  const api = useTradingRules(sessionId);
  const id = useId();
  const [selected, setSelected] = useState("");
  const routes = trading.capabilities.data?.routes ?? [];
  const route =
    routes.find((entry) => routeKey(entry) === selected) ??
    routes.find((entry) => entry.mode !== "unavailable");
  return (
    <section aria-label="Trading rules">
      <Card>
        <CardHeader>
          <CardTitle>Trading rules</CardTitle>
          <CardDescription>
            You choose the assets and limits. Agents can use an existing rule;
            only you can authorize or revoke one.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex min-w-0 flex-col gap-5">
          <Field>
            <FieldLabel htmlFor={`${id}-route`}>
              Rule network & route
            </FieldLabel>
            <NativeSelect
              id={`${id}-route`}
              onChange={(event) => {
                setSelected(event.target.value);
              }}
              value={route === undefined ? "" : routeKey(route)}
            >
              {routes.map((entry) => (
                <NativeSelectOption
                  disabled={entry.mode === "unavailable"}
                  key={routeKey(entry)}
                  value={routeKey(entry)}
                >
                  {networkWords(entry.network)} · {entry.venue} · {entry.action}
                  {entry.mode === "stub" ? " · simulated" : ""}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          {route === undefined ? (
            <p className="text-muted-foreground text-sm">
              Trading routes are unavailable.
            </p>
          ) : (
            <RuleForm api={api} key={routeKey(route)} route={route} />
          )}
          {api.rules.isError ? (
            <FieldError>{api.rules.error.message}</FieldError>
          ) : null}
          {api.revoke.isError ? (
            <FieldError>{api.revoke.error.message}</FieldError>
          ) : null}
          {api.rules.data?.rules.toReversed().map((rule) => (
            <RuleSummary api={api} key={rule.id} rule={rule} />
          ))}
        </CardContent>
      </Card>
    </section>
  );
};
