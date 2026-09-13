import type {
  OnchainAlertCondition,
  OnchainAlertRule,
  WalletActivity,
  WalletMonitor,
  WalletMonitorStatus,
  WatchlistItem,
} from "@froggy/domain";
import { OnchainMonitorConfigure } from "@froggy/protocol";
import { Alert, AlertDescription } from "@froggy/ui/components/alert";
import { Badge } from "@froggy/ui/components/badge";
import { Button } from "@froggy/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@froggy/ui/components/empty";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@froggy/ui/components/field";
import { Input } from "@froggy/ui/components/input";
import { Skeleton } from "@froggy/ui/components/skeleton";
import { Switch } from "@froggy/ui/components/switch";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@froggy/ui/components/toggle-group";
import { Schema } from "effect";
import {
  ArrowDownLeftIcon,
  ArrowUpRightIcon,
  PlusIcon,
  RadioIcon,
  Trash2Icon,
} from "lucide-react";
import { useId, useState } from "react";

import { networkWords } from "../../lib/mandate-words";
import { useWalletMonitor } from "../../lib/wallet-monitor-client";
import { useWorkspace } from "../../lib/workspace-context";
import { TelegramSettings } from "../agents/telegram-settings";

const states = {
  saved: "Saved",
  starting: "Starting",
  watching: "Watching",
  waiting_price: "Waiting for a price",
  triggered: "Price matched",
  delayed: "Delayed",
  paused: "Paused",
  expired: "Expired",
  unavailable: "Unavailable",
} as const;
const delivery = {
  waiting: "Telegram queued",
  delivered: "Delivered to Telegram",
  not_paired: "Telegram was disconnected",
  cancelled: "Telegram alert cancelled",
  uncertain: "Telegram delivery uncertain",
  failed: "Telegram delivery failed",
  summarized: "Included in Telegram summary",
} as const;
const flowAmount = (flow: WalletActivity["flows"][number]): string => {
  if (flow.decimals === null) {
    return `${flow.amount} raw units`;
  }
  if (flow.decimals === 0) {
    return flow.amount;
  }
  const digits = flow.amount.padStart(flow.decimals + 1, "0");
  return `${digits.slice(0, -flow.decimals)}.${digits.slice(-flow.decimals)}`.replace(
    /\.?0+$/u,
    ""
  );
};
const assetLabel = (value: string | null): string => {
  if (value === null) {
    return "any token";
  }
  if (value === "native") {
    return "ETH";
  }
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
};
const conditionDirection = (condition: OnchainAlertCondition): string => {
  if (condition._tag === "price") {
    return condition.comparison;
  }
  return condition._tag === "transfer" ? condition.direction : condition.side;
};
const saveLabel = (
  busy: boolean,
  monitor: WalletMonitor | null,
  price: boolean
): string => {
  if (busy) {
    return "Saving…";
  }
  if (monitor) {
    return "Save alert conditions";
  }
  return price ? "Start price alert" : "Track this wallet";
};
const ruleLabel = ({ condition }: OnchainAlertRule): string => {
  if (condition._tag === "price") {
    return `Price ${condition.comparison} ${condition.threshold} ${condition.quoteCurrency}`;
  }
  const words =
    condition._tag === "transfer"
      ? { both: "Sends or receives", sent: "Sends", received: "Receives" }[
          condition.direction
        ]
      : { both: "Buys or sells", bought: "Buys", sold: "Sells" }[
          condition.side
        ];
  return `${words} ${assetLabel(condition.token)}`;
};
interface RuleDraft {
  readonly key: number;
  readonly kind: "transfer" | "swap" | "price";
  readonly direction: string;
  readonly token: string;
  readonly threshold: string;
  readonly quoteCurrency: string;
}
const draftRule = (
  key: number,
  condition: OnchainAlertCondition
): RuleDraft => ({
  key,
  kind: condition._tag,
  direction: conditionDirection(condition),
  token: condition._tag === "price" ? "" : (condition.token ?? ""),
  threshold: condition._tag === "price" ? condition.threshold : "",
  quoteCurrency: condition._tag === "price" ? condition.quoteCurrency : "USD",
});
const initialDrafts = (
  item: WatchlistItem,
  monitor: WalletMonitor | null
): readonly RuleDraft[] => {
  const savedRules = monitor?.rules ?? [];
  if (savedRules.length > 0) {
    return savedRules.map((rule, key) => draftRule(key, rule.condition));
  }
  if (item.source._tag === "token") {
    return [
      draftRule(0, {
        _tag: "price",
        comparison: "below",
        threshold: "",
        quoteCurrency: "USD",
      }),
    ];
  }
  const conditions: OnchainAlertCondition[] = [];
  if (monitor?.transfers !== false) {
    conditions.push({ _tag: "transfer", direction: "both", token: null });
  }
  if (monitor?.swaps !== false) {
    conditions.push({ _tag: "swap", side: "both", token: null });
  }
  return conditions.map((condition, key) => draftRule(key, condition));
};
const RuleChoices = ({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  readonly label: string;
  readonly value: string;
  readonly options: readonly (readonly [string, string])[];
  readonly disabled: boolean;
  readonly onChange: (value: string) => void;
}) => (
  <ToggleGroup
    aria-label={label}
    variant="outline"
    size="sm"
    disabled={disabled}
    value={[value]}
    onValueChange={(values) => {
      const selected = Schema.decodeUnknownResult(Schema.String)(values[0]);
      if (selected._tag === "Success") {
        onChange(selected.success);
      }
    }}
  >
    {options.map(([choice, text]) => (
      <ToggleGroupItem key={choice} value={choice}>
        {text}
      </ToggleGroupItem>
    ))}
  </ToggleGroup>
);
const AlertRuleForm = ({
  item,
  monitor,
  busy,
  onSubmit,
  onCancel,
}: {
  readonly item: WatchlistItem;
  readonly monitor: WalletMonitor | null;
  readonly busy: boolean;
  readonly onSubmit: (value: typeof OnchainMonitorConfigure.Type) => void;
  readonly onCancel: () => void;
}) => {
  const prefix = useId();
  const [drafts, setDrafts] = useState(() => initialDrafts(item, monitor));
  const [telegram, setTelegram] = useState(monitor?.telegram ?? true);
  const [error, setError] = useState<string | null>(null);
  const change = (key: number, patch: Partial<RuleDraft>): void => {
    setDrafts((current) =>
      current.map((draft) =>
        draft.key === key ? { ...draft, ...patch } : draft
      )
    );
  };
  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        const decoded = Schema.decodeUnknownResult(OnchainMonitorConfigure)({
          v: 1,
          telegram,
          conditions: drafts.map((draft) =>
            draft.kind === "price"
              ? {
                  _tag: "price",
                  comparison: draft.direction,
                  threshold: draft.threshold.trim(),
                  quoteCurrency: draft.quoteCurrency,
                }
              : {
                  _tag: draft.kind,
                  ...(draft.kind === "transfer"
                    ? { direction: draft.direction }
                    : { side: draft.direction }),
                  token: draft.token.trim() || null,
                }
          ),
        });
        if (
          decoded._tag === "Failure" ||
          drafts.some(
            (draft) => draft.kind === "price" && !/[1-9]/u.test(draft.threshold)
          )
        ) {
          setError(
            "Use a valid token address or native, and a positive decimal price."
          );
          return;
        }
        setError(null);
        onSubmit(decoded.success);
      }}
    >
      <FieldGroup>
        {drafts.map((draft, index) => (
          <FieldSet
            key={draft.key}
            disabled={busy}
            data-invalid={error !== null}
          >
            <FieldLegend variant="label">Condition {index + 1}</FieldLegend>
            {draft.kind === "price" ? (
              <>
                <RuleChoices
                  label={`Price comparison ${index + 1}`}
                  disabled={busy}
                  value={draft.direction}
                  options={[
                    ["below", "Below"],
                    ["above", "Above"],
                  ]}
                  onChange={(direction) => {
                    change(draft.key, { direction });
                  }}
                />
                <Field data-invalid={error !== null}>
                  <FieldLabel htmlFor={`${prefix}-${draft.key}-price`}>
                    Price per token
                  </FieldLabel>
                  <Input
                    id={`${prefix}-${draft.key}-price`}
                    inputMode="decimal"
                    placeholder="0.01"
                    autoComplete="off"
                    value={draft.threshold}
                    aria-invalid={error !== null}
                    onChange={(event) => {
                      change(draft.key, { threshold: event.target.value });
                    }}
                    required
                  />
                  <RuleChoices
                    label={`Quote currency ${index + 1}`}
                    disabled={busy}
                    value={draft.quoteCurrency}
                    options={[
                      ["USD", "USD"],
                      ["USDC", "USDC"],
                      ["USDG", "USDG"],
                      ["ETH", "ETH"],
                    ]}
                    onChange={(quoteCurrency) => {
                      change(draft.key, { quoteCurrency });
                    }}
                  />
                </Field>
              </>
            ) : (
              <>
                <RuleChoices
                  label={`Activity type ${index + 1}`}
                  disabled={busy}
                  value={draft.kind}
                  options={[
                    ["transfer", "Transfers"],
                    ["swap", "Swaps"],
                  ]}
                  onChange={(value) => {
                    if (value === "transfer" || value === "swap") {
                      change(draft.key, { kind: value, direction: "both" });
                    }
                  }}
                />
                <RuleChoices
                  label={`Direction ${index + 1}`}
                  disabled={busy}
                  value={draft.direction}
                  options={
                    draft.kind === "transfer"
                      ? [
                          ["both", "Both"],
                          ["sent", "Sends"],
                          ["received", "Receives"],
                        ]
                      : [
                          ["both", "Both"],
                          ["bought", "Buys"],
                          ["sold", "Sells"],
                        ]
                  }
                  onChange={(direction) => {
                    change(draft.key, { direction });
                  }}
                />
                <Field data-invalid={error !== null}>
                  <FieldLabel htmlFor={`${prefix}-${draft.key}-token`}>
                    Token filter
                  </FieldLabel>
                  <Input
                    id={`${prefix}-${draft.key}-token`}
                    placeholder="Any token"
                    autoComplete="off"
                    value={draft.token}
                    aria-invalid={error !== null}
                    onChange={(event) => {
                      change(draft.key, { token: event.target.value });
                    }}
                  />
                  <FieldDescription>
                    Leave blank for all tokens. Use a token address, or native
                    for ETH.
                  </FieldDescription>
                </Field>
              </>
            )}
            {drafts.length > 1 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDrafts((current) =>
                    current.filter((entry) => entry.key !== draft.key)
                  );
                }}
              >
                <Trash2Icon data-icon="inline-start" aria-hidden />
                Remove condition {index + 1}
              </Button>
            ) : null}
          </FieldSet>
        ))}
        {drafts.length < 4 ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => {
              const key = Math.max(...drafts.map((draft) => draft.key), -1) + 1;
              const condition: OnchainAlertCondition =
                item.source._tag === "token"
                  ? {
                      _tag: "price",
                      comparison: "below",
                      threshold: "",
                      quoteCurrency: "USD",
                    }
                  : { _tag: "transfer", direction: "both", token: null };
              setDrafts((current) => [...current, draftRule(key, condition)]);
            }}
          >
            <PlusIcon data-icon="inline-start" aria-hidden />
            Add condition
          </Button>
        ) : null}
        <Field orientation="horizontal">
          <FieldLabel htmlFor={`${prefix}-telegram`}>
            Send Telegram alerts
          </FieldLabel>
          <Switch
            id={`${prefix}-telegram`}
            checked={telegram}
            disabled={busy}
            onCheckedChange={setTelegram}
          />
        </Field>
      </FieldGroup>
      <p className="text-muted-foreground text-xs">
        Any matching condition can alert. Watches last 24 hours.
        {item.source._tag === "token"
          ? " Each price condition alerts once, including when the current price already matches. USD requires a verified conversion; token quote units stay explicit."
          : " A swap and its transfers appear together."}
      </p>
      {error === null ? null : (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy}>
          {saveLabel(busy, monitor, item.source._tag === "token")}
        </Button>
        {monitor ? (
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={onCancel}
          >
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
};
const PriceRuleEvidence = ({ rule }: { readonly rule: OnchainAlertRule }) => {
  if (rule.condition._tag !== "price") {
    return null;
  }
  return (
    <div className="text-muted-foreground flex flex-col gap-1 text-xs">
      <span>
        {rule.source?.label ?? "Price source pending"} ·{" "}
        {rule.condition.quoteCurrency} per token
      </span>
      {rule.latest?.status === "available" ? (
        <span>
          Latest {rule.latest.price} {rule.condition.quoteCurrency} ·{" "}
          {new Date(rule.latest.blockTime).toLocaleTimeString()}
        </span>
      ) : (
        <span>
          {rule.latest?.reason ?? "Waiting for a reliable price observation."}
        </span>
      )}
      {rule.source?.limitations.map((limitation) => (
        <span key={limitation}>{limitation}</span>
      ))}
    </div>
  );
};
const ActivityCard = ({ activity }: { readonly activity: WalletActivity }) => {
  const quote = activity.price?.quoteCurrency ?? "";
  return (
    <article className="motion-safe:animate-in motion-safe:fade-in flex min-w-0 flex-col gap-2 rounded-xl border p-4 duration-300">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">
          {
            {
              price: "Price alert",
              swap: "Swap",
              transfer: "Transfer",
              activity: "Wallet activity",
            }[activity.kind]
          }
        </h3>
        <Badge variant="outline">
          {
            {
              provisional: "Observed · awaiting confirmation",
              reverted: "Reverted by chain reorganization",
              finalized: "Confirmed",
              unverified: "Unverified · stream gap",
            }[activity.finality]
          }
        </Badge>
      </div>
      {activity.stubbed ? <Badge variant="secondary">Simulated</Badge> : null}
      {activity.finality === "unverified" ? (
        <p className="text-muted-foreground text-xs">
          Froggy could not confirm this provisional activity after a stream
          interruption.
        </p>
      ) : null}

      {activity.price ? (
        <>
          <p className="text-sm break-words">
            {activity.price.initiallyMatched ? "Price already" : "Price moved"}{" "}
            {activity.price.comparison} {activity.price.threshold} {quote}.
          </p>
          <p className="text-muted-foreground text-xs break-words">
            Observed {activity.price.observation.price} {quote} ·{" "}
            {activity.price.sourceLabel}
          </p>
        </>
      ) : null}
      {activity.flows.slice(0, 8).map((flow, index) => {
        const Icon =
          flow.direction === "sent" ? ArrowUpRightIcon : ArrowDownLeftIcon;
        return (
          <p
            key={`${flow.asset}:${flow.direction}:${index}`}
            className="flex min-w-0 items-start gap-2 text-sm"
          >
            <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span className="break-all">
              {flow.direction === "sent" ? "Sent" : "Received"}{" "}
              {flowAmount(flow)} {flow.symbol ?? flow.asset}
            </span>
          </p>
        );
      })}
      {activity.flows.length > 8 ? (
        <p className="text-muted-foreground text-xs">
          +{activity.flows.length - 8} movements in this transaction.
        </p>
      ) : null}
      {activity.complete ? null : (
        <p className="text-muted-foreground text-xs">
          Partial evidence: some movements may be missing.
        </p>
      )}
      <div className="text-muted-foreground flex flex-wrap justify-between gap-2 text-xs">
        <span>
          {networkWords(activity.network)} · {delivery[activity.delivery]}
        </span>
        {activity.transactionHash === null ? null : (
          <a
            className="text-primary underline underline-offset-4"
            href={`https://${activity.network === "eip155:4663" ? "robinhoodchain.blockscout.com" : "basescan.org"}/tx/${activity.transactionHash}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            View transaction
          </a>
        )}
      </div>
    </article>
  );
};
export const WalletMonitorBadge = ({
  item,
}: {
  readonly item: WatchlistItem;
}) => {
  const { view } = useWalletMonitor(
    item.id,
    !!item.walletMonitor && !item.archived
  );
  if (item.archived) {
    return <span>Archived</span>;
  }
  if (view.data) {
    return <span>{states[view.data.status.state]}</span>;
  }
  return <span>{item.walletMonitor ? "Loading watch…" : "Saved"}</span>;
};
type MonitorClient = ReturnType<typeof useWalletMonitor>;
const activeState = (state: WalletMonitorStatus["state"]): boolean =>
  ["starting", "watching", "waiting_price", "delayed"].includes(state);
const primaryAction = (
  state: WalletMonitorStatus["state"]
): "pause" | "resume" | "extend" | "rearm" => {
  if (activeState(state)) {
    return "pause";
  }
  if (state === "expired") {
    return "extend";
  }
  return state === "triggered" ? "rearm" : "resume";
};
const MonitorProgress = ({
  status,
}: {
  readonly status: WalletMonitorStatus | null;
}) => {
  if (!status) {
    return null;
  }
  return (
    <>
      {status.stubbed ? (
        <Badge variant="outline">Simulated stream · local demo</Badge>
      ) : null}
      {status.monitor ? (
        <p className="text-muted-foreground text-xs">
          Watch ends {new Date(status.monitor.expiresAt).toLocaleString()}.
          Pausing does not extend this time.
        </p>
      ) : null}
      {status.latestBlock === null ? null : (
        <p className="text-muted-foreground text-xs tabular-nums">
          Last observed block {status.latestBlock.toLocaleString()} ·{" "}
          {status.latestBlockAt === null
            ? ""
            : new Date(status.latestBlockAt).toLocaleTimeString()}
        </p>
      )}
      {status.gapSince === null ? null : (
        <Alert variant="destructive">
          <AlertDescription>
            There was a stream gap after{" "}
            {new Date(status.gapSince).toLocaleString()}. Activity during that
            gap may be missing.
          </AlertDescription>
        </Alert>
      )}
      {status.state === "delayed" ? (
        <p className="text-muted-foreground text-sm">
          The source is catching up. Froggy will resume from its saved position.
        </p>
      ) : null}
    </>
  );
};
const MonitorRules = ({
  rules,
  editing,
}: {
  readonly rules: readonly OnchainAlertRule[];
  readonly editing: boolean;
}) => {
  if (editing || rules.length === 0) {
    return null;
  }
  return (
    <ul className="flex flex-col gap-3">
      {rules.map((rule) => (
        <li key={rule.id} className="flex flex-col gap-1">
          <p className="text-sm font-medium">
            {ruleLabel(rule)}
            {rule.triggeredBlock === null ? "" : " · matched"}
          </p>
          <PriceRuleEvidence rule={rule} />
        </li>
      ))}
    </ul>
  );
};
const MonitorEditor = ({
  item,
  client,
  editing,
  setEditing,
}: {
  readonly item: WatchlistItem;
  readonly client: MonitorClient;
  readonly editing: boolean;
  readonly setEditing: (value: boolean) => void;
}) => {
  const { view, change, configure } = client;
  const monitor = view.data?.status.monitor ?? null;
  const state = view.data?.status.state ?? "saved";
  const busy = change.isPending || configure.isPending;
  if (view.isPending || item.archived) {
    return null;
  }
  if (!monitor || editing) {
    return (
      <AlertRuleForm
        key={`${item.id}:${monitor?.revision ?? 0}`}
        item={item}
        monitor={monitor}
        busy={busy || state === "unavailable"}
        onCancel={() => {
          setEditing(false);
        }}
        onSubmit={(input) => {
          configure.mutate(input, {
            onSuccess: () => {
              setEditing(false);
            },
          });
        }}
      />
    );
  }
  const action = primaryAction(state);
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        disabled={busy || state === "unavailable"}
        onClick={() => {
          change.mutate(action);
        }}
      >
        {busy
          ? "Updating…"
          : {
              pause: "Pause watch",
              resume: "Resume watch",
              extend: "Track for another 24 hours",
              rearm: "Rearm price alert",
            }[action]}
      </Button>
      {activeState(state) || state === "paused" ? (
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => {
            change.mutate("extend");
          }}
        >
          Extend for 24 hours
        </Button>
      ) : null}
      <Button
        variant="ghost"
        disabled={busy}
        onClick={() => {
          setEditing(true);
        }}
      >
        Edit alerts
      </Button>
    </div>
  );
};
const MonitorDelivery = ({
  status,
}: {
  readonly status: WalletMonitorStatus | null;
}) => {
  const { app } = useWorkspace();
  if (!status) {
    return null;
  }
  if (status.telegramPaired) {
    return (
      <p className="text-muted-foreground text-xs">
        Telegram connected · alerts go to your paired chat.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-sm">
        Activity stays here while Telegram is disconnected. Connect it for
        future alerts.
      </p>
      <TelegramSettings active configured={app.modes?.telegram === "live"} />
    </div>
  );
};
const MonitorActivityList = ({
  view,
  price,
}: {
  readonly view: MonitorClient["view"];
  readonly price: boolean;
}) => {
  const activities = view.data?.activities ?? [];
  let emptyText = "Start a watch to see new wallet activity here.";
  if (price) {
    emptyText =
      "A matching price will appear here and notify your paired Telegram. You can close Froggy while it watches.";
  } else if (activeState(view.data?.status.state ?? "saved")) {
    emptyText =
      "Make a swap or transfer in your external wallet after Watching appears. You can close Froggy; the watch keeps running.";
  }
  return (
    <div
      className="flex flex-col gap-3"
      aria-label="Recent onchain activity"
      aria-live="polite"
    >
      {activities.length === 0 ? (
        <Empty className="py-6">
          <EmptyHeader>
            <EmptyTitle>No activity yet</EmptyTitle>
            <EmptyDescription>{emptyText}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        activities.map((activity) => (
          <ActivityCard key={activity.id} activity={activity} />
        ))
      )}
      {view.hasNextPage ? (
        <Button
          variant="outline"
          disabled={view.isFetchingNextPage}
          onClick={() => {
            void view.fetchNextPage();
          }}
        >
          {view.isFetchingNextPage ? "Loading…" : "Load older activity"}
        </Button>
      ) : null}
    </div>
  );
};
const supportedItem = (item: WatchlistItem): boolean =>
  (item.source._tag === "wallet" || item.source._tag === "token") &&
  ["eip155:8453", "eip155:4663"].includes(item.source.network);
export const WalletMonitorPanel = ({
  item,
}: {
  readonly item: WatchlistItem;
}) => {
  const supported = supportedItem(item);
  const client = useWalletMonitor(item.id, supported);
  const [editing, setEditing] = useState(false);
  const status = client.view.data?.status ?? null;
  const state = status?.state ?? "saved";
  const price = item.source._tag === "token";
  const failure =
    client.configure.error ?? client.change.error ?? client.view.error;
  const network =
    item.source._tag === "wallet" || item.source._tag === "token"
      ? networkWords(item.source.network)
      : "your chain";
  if (!supported) {
    return (
      <section
        aria-label="Onchain alert coverage"
        className="bg-card flex flex-col gap-2 rounded-2xl border p-5"
      >
        <h2 className="font-semibold">Onchain alerts</h2>
        <p className="text-muted-foreground text-sm">
          Live alerts currently support Base and Robinhood. Scheduled checks
          remain available for this item.
        </p>
      </section>
    );
  }
  return (
    <section
      aria-label={price ? "Token price alerts" : "Wallet activity monitor"}
      className="bg-card flex min-w-0 flex-col gap-5 rounded-2xl border p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <RadioIcon aria-hidden className="text-brand size-5" />
          <h2 className="font-semibold">
            {price ? "Onchain price alerts" : "Wallet activity"}
          </h2>
        </div>
        <Badge variant={state === "watching" ? "default" : "secondary"}>
          {states[state]}
        </Badge>
      </div>
      <p className="text-muted-foreground text-sm">
        {price
          ? "Watch a price condition"
          : "Follow swaps and ETH or token transfers"}{" "}
        on {network} for 24 hours. Included with Froggy.
      </p>
      {client.view.isPending ? <Skeleton className="h-16 w-full" /> : null}
      <MonitorProgress status={status} />
      <MonitorRules rules={status?.monitor?.rules ?? []} editing={editing} />
      <MonitorEditor
        item={item}
        client={client}
        editing={editing}
        setEditing={setEditing}
      />
      {failure ? (
        <Alert variant="destructive">
          <AlertDescription>{failure.message}</AlertDescription>
        </Alert>
      ) : null}
      <MonitorDelivery status={status} />
      <p className="text-muted-foreground text-xs">{status?.coverage}</p>
      <MonitorActivityList view={client.view} price={price} />
    </section>
  );
};
