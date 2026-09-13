import {
  flowAsset,
  foreignSigner,
  listChainNames,
  shortAddress,
  supportedPresence,
} from "@froggy/domain";
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
import { PlusIcon, Trash2Icon } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";

import { useNow } from "../../hooks/use-now";
import { useWalletMonitor } from "../../lib/wallet-monitor-client";
import {
  activeState,
  eventMeta,
  eventSentence,
  flowSentence,
  timeWords,
  windowLeft,
} from "../../lib/watch-words";
import type { AssetLabel, WatchState } from "../../lib/watch-words";
import { useWatchlistDetails } from "../../lib/watchlist-client";
import { useWorkspace } from "../../lib/workspace-context";
import { TelegramSettings } from "../agents/telegram-settings";

export const states = {
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
const kindWords: Record<WalletActivity["kind"], string> = {
  price: "Price alert",
  swap: "Swap",
  transfer: "Transfer",
  activity: "Wallet activity",
};
const explorerUrl = (activity: WalletActivity): string =>
  `https://${activity.network === "eip155:4663" ? "robinhoodchain.blockscout.com" : "basescan.org"}/tx/${activity.transactionHash}`;

/** The caveats an event carries: who signed, doubtful tokens, missing evidence. */
const EventNotes = ({ activity }: { readonly activity: WalletActivity }) => {
  const signer = foreignSigner(activity);
  const doubtful = activity.flows.some(
    (flow) => flowAsset(flow, activity.network).doubt !== null
  );
  return (
    <>
      {activity.finality === "unverified" ? (
        <p className="watch-row-words">
          Froggy could not confirm this activity after a gap in the stream.
        </p>
      ) : null}
      {signer === null ? null : (
        <p className="watch-row-words">
          Sent by {shortAddress(signer)}, not signed by this wallet: a contract
          acted for it, or a third party reported a movement it never made.
        </p>
      )}
      {doubtful ? (
        <p className="watch-row-words">
          Unverified token: no known symbol, or a lookalike name. Such tokens
          are used for address poisoning; never copy an address from here.
        </p>
      ) : null}
      {activity.complete ? null : (
        <p className="watch-row-words">
          Partial evidence: some movements may be missing.
        </p>
      )}
    </>
  );
};

/** One onchain event as a sentence; shared with the Inbox reader. */
export const ActivityCard = ({
  activity,
  fresh = false,
}: {
  readonly activity: WalletActivity;
  /** Newer than the person's last visit: a lime rail on the left. */
  readonly fresh?: boolean;
}) => {
  const now = useNow();
  const label: AssetLabel = (flow) => flowAsset(flow, activity.network).label;
  const swap = activity.flows.some((flow) => flow.swapSide !== undefined);
  const extra = swap ? [] : activity.flows.slice(1, 8);
  return (
    <article className="watch-event" data-new={fresh ? "" : undefined}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="playground-eyebrow">{kindWords[activity.kind]}</h3>
        <time
          className="watch-time"
          dateTime={new Date(activity.blockTime).toISOString()}
        >
          {timeWords(activity.blockTime, now)}
        </time>
      </div>
      <p className="watch-event-sentence">{eventSentence(activity, label)}</p>
      {activity.price ? (
        <p className="watch-row-words">{activity.price.sourceLabel}</p>
      ) : null}
      {extra.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {extra.map((flow, index) => (
            <li
              key={`${flow.asset}:${flow.direction}:${index}`}
              className="watch-row-words"
            >
              {flowSentence(flow, label)}
            </li>
          ))}
        </ul>
      ) : null}
      {activity.flows.length > 8 ? (
        <p className="watch-row-words">
          +{activity.flows.length - 8} movements in this transaction.
        </p>
      ) : null}
      <EventNotes activity={activity} />
      {activity.stubbed ? (
        <Badge variant="secondary" className="self-start">
          Simulated
        </Badge>
      ) : null}
      <p className="watch-event-meta">
        {eventMeta(activity).map((words) => (
          <span key={words}>{words}</span>
        ))}
        {activity.transactionHash === null ? null : (
          <a
            href={explorerUrl(activity)}
            target="_blank"
            rel="noopener noreferrer"
          >
            View transaction
          </a>
        )}
      </p>
    </article>
  );
};

type MonitorClient = ReturnType<typeof useWalletMonitor>;
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
/** The chip's colour for a stream state; the words stay the stream's own. */
const chipState = (state: WalletMonitorStatus["state"]): WatchState => {
  if (activeState(state)) {
    return "watching";
  }
  if (state === "paused") {
    return "paused";
  }
  if (state === "expired") {
    return "ended";
  }
  return state === "triggered" ? "needs_you" : "saved";
};
const WatchWindow = ({
  status,
  now,
}: {
  readonly status: WalletMonitorStatus | null;
  readonly now: number;
}) => {
  const monitor = status?.monitor;
  if (!monitor) {
    return null;
  }
  const left = windowLeft(monitor, now);
  const paused = status.state === "paused";
  return (
    <div className="flex flex-col gap-1.5">
      <span
        aria-hidden
        className="watch-time-bar"
        data-paused={paused ? "" : undefined}
      >
        <span style={{ width: `${left.percent}%` }} />
      </span>
      <p className="watch-help">
        {left.words}
        {paused ? " · pausing does not extend it" : ""}
      </p>
    </div>
  );
};
const StreamDetails = ({
  status,
}: {
  readonly status: WalletMonitorStatus | null;
}) => {
  if (!status) {
    return null;
  }
  return (
    <>
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
        <p className="watch-row-words">
          The source is catching up. Froggy will resume from its saved position.
        </p>
      ) : null}
      <details className="watch-disclosure">
        <summary className="playground-eyebrow min-h-11">
          Stream details
        </summary>
        <div className="flex flex-col gap-1 pt-2">
          {status.latestBlock === null ? null : (
            <p className="watch-time">
              Last observed block {status.latestBlock.toLocaleString()}
              {status.latestBlockAt === null
                ? ""
                : ` · ${new Date(status.latestBlockAt).toLocaleTimeString()}`}
            </p>
          )}
          <p className="watch-row-words">{status.coverage}</p>
        </div>
      </details>
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
    <ul className="watch-rules">
      {rules.map((rule) => (
        <li key={rule.id}>
          <div className="flex min-w-0 flex-col gap-1">
            <span>
              {ruleLabel(rule)}
              {rule.triggeredBlock === null ? "" : " · matched"}
            </span>
            <PriceRuleEvidence rule={rule} />
          </div>
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
    <div className="flex flex-wrap gap-3">
      <button
        type="button"
        className="playground-chip"
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
      </button>
      {activeState(state) || state === "paused" ? (
        <button
          type="button"
          className="playground-chip"
          disabled={busy}
          onClick={() => {
            change.mutate("extend");
          }}
        >
          Extend for 24 hours
        </button>
      ) : null}
      <button
        type="button"
        className="playground-chip"
        disabled={busy}
        onClick={() => {
          setEditing(true);
        }}
      >
        Edit alerts
      </button>
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
      <p className="watch-row-words text-foreground">
        Telegram on · alerts go to your paired chat
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="watch-row-words">
        Telegram off · activity stays here. Connect it for future alerts.
      </p>
      <TelegramSettings active configured={app.modes?.telegram === "live"} />
    </div>
  );
};
const emptyWords = (price: boolean, active: boolean): string => {
  if (price) {
    return "A matching price will appear here and notify your paired Telegram. You can close Froggy while it watches.";
  }
  if (active) {
    return "Make a swap or transfer in your external wallet after Watching appears. You can close Froggy; the watch keeps running.";
  }
  return "Start a watch to see new wallet activity here.";
};
const MonitorActivityList = ({
  view,
  price,
  seenAt,
}: {
  readonly view: MonitorClient["view"];
  readonly price: boolean;
  readonly seenAt: number;
}) => {
  const activities = view.data?.activities ?? [];
  const active = activeState(view.data?.status.state ?? "saved");
  return (
    <div
      className="flex flex-col gap-3"
      aria-label="Recent onchain activity"
      aria-live="polite"
    >
      {activities.length === 0 ? (
        <Empty className="watch-card py-6">
          <EmptyHeader>
            <EmptyTitle>No activity yet</EmptyTitle>
            <EmptyDescription>{emptyWords(price, active)}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        activities.map((activity) => (
          <ActivityCard
            key={activity.id}
            activity={activity}
            fresh={activity.observedAt > seenAt}
          />
        ))
      )}
      {view.hasNextPage ? (
        <button
          type="button"
          className="playground-chip playground-chip-sm self-start"
          disabled={view.isFetchingNextPage}
          onClick={() => {
            void view.fetchNextPage();
          }}
        >
          {view.isFetchingNextPage ? "Loading…" : "Load older activity"}
        </button>
      ) : null}
    </div>
  );
};
const seenKey = (id: WatchlistItem["id"]): string => `froggy.watch-seen.${id}`;
const readSeen = (id: WatchlistItem["id"]): number => {
  try {
    return Number(localStorage.getItem(seenKey(id)) ?? 0);
  } catch {
    return 0;
  }
};
/** Remember the visit so the next one can mark what is new; storage is best effort. */
const useSeen = (id: WatchlistItem["id"]): number => {
  const seenAt = useMemo(() => readSeen(id), [id]);
  useEffect(() => {
    const stamp = (): void => {
      try {
        localStorage.setItem(seenKey(id), String(Date.now()));
      } catch {
        // Private mode or a full quota: the rail simply shows nothing as new.
      }
    };
    stamp();
    return stamp;
  }, [id]);
  return seenAt;
};
const UnsupportedCoverage = () => (
  <section
    aria-label="Onchain alert coverage"
    className="watch-card flex flex-col gap-2 p-5"
  >
    <h2 className="playground-eyebrow">Onchain alerts</h2>
    <p className="watch-row-words">
      Live alerts currently support Base and Robinhood. Scheduled checks remain
      available for this item.
    </p>
  </section>
);
const WatchCardHead = ({
  price,
  status,
  networks,
  pending,
}: {
  readonly price: boolean;
  readonly status: WalletMonitorStatus | null;
  readonly networks: readonly string[];
  readonly pending: boolean;
}) => {
  const state = status?.state ?? "saved";
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="playground-eyebrow">What Froggy is watching</h2>
        <span className="watch-state" data-state={chipState(state)}>
          {states[state]}
        </span>
      </div>
      <p className="watch-row-words">
        {price ? "A price condition" : "Swaps and ETH or token transfers"} on{" "}
        {listChainNames(networks)} for 24 hours. Included with Froggy.
      </p>
      {pending ? <Skeleton className="h-16 w-full" /> : null}
      {status?.stubbed === true ? (
        <Badge variant="outline" className="self-start">
          Simulated stream · local demo
        </Badge>
      ) : null}
    </>
  );
};
const TimelineHead = ({ count }: { readonly count: number }) => (
  <h2 className="playground-eyebrow">
    What happened
    {count > 0 ? (
      <span className="text-muted-foreground font-normal tracking-normal normal-case">
        {count} {count === 1 ? "event" : "events"}
      </span>
    ) : null}
  </h2>
);
const WalletMonitorDetails = ({ item }: { readonly item: WatchlistItem }) => {
  const details = useWatchlistDetails(item.id);
  const networks = supportedPresence(details.data?.data.presence ?? []);
  const supported = networks.length > 0;
  const client = useWalletMonitor(item.id, supported);
  const [editing, setEditing] = useState(false);
  const seenAt = useSeen(item.id);
  const now = useNow();
  const status = client.view.data?.status ?? null;
  const price = item.source._tag === "token";
  const failure =
    client.configure.error ?? client.change.error ?? client.view.error;
  if (!supported) {
    return <UnsupportedCoverage />;
  }
  return (
    <section
      aria-label={price ? "Token price alerts" : "Wallet activity monitor"}
      className="flex min-w-0 flex-col gap-6"
    >
      <div className="watch-card flex min-w-0 flex-col gap-4 p-5">
        <WatchCardHead
          price={price}
          status={status}
          networks={networks}
          pending={client.view.isPending}
        />
        <MonitorRules rules={status?.monitor?.rules ?? []} editing={editing} />
        <WatchWindow status={status} now={now} />
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
        <StreamDetails status={status} />
      </div>
      <div className="flex min-w-0 flex-col gap-3">
        <TimelineHead count={client.view.data?.activities.length ?? 0} />
        <MonitorActivityList view={client.view} price={price} seenAt={seenAt} />
      </div>
    </section>
  );
};

export const WalletMonitorPanel = ({
  item,
}: {
  readonly item: WatchlistItem;
}) =>
  item.source._tag === "token" || item.source._tag === "wallet" ? (
    <WalletMonitorDetails item={item} />
  ) : null;
