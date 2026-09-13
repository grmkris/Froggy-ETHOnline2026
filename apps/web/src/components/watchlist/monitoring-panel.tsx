import { MonitorConfig } from "@froggy/domain";
import type { Monitor, MonitoringBook, WatchlistItem } from "@froggy/domain";
import { Badge } from "@froggy/ui/components/badge";
import { Button } from "@froggy/ui/components/button";
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
import { Link } from "@tanstack/react-router";
import { Schema } from "effect";
import { useId, useState } from "react";

import { formatCredits } from "../../lib/credit-view";
import { useMonitoring } from "../../lib/monitoring-client";
import { useWatchlist } from "../../lib/watchlist-client";

const zone = () => new Intl.DateTimeFormat().resolvedOptions().timeZone;

const conditionOf = (kind: string, value: string, currency: string) => {
  if (kind === "price_below") {
    return { _tag: "price_below", amount: Number(value), currency };
  }
  if (kind === "price_drop") {
    return { _tag: "price_drop", percent: Number(value), currency };
  }
  if (kind === "availability") {
    return { _tag: "availability", value };
  }
  return { _tag: "change", field: value };
};
const conditionLabel = (kind: string) =>
  new Map([
    ["change", "Field to watch"],
    ["availability", "Desired availability"],
    ["price_drop", "Drop (%)"],
    ["price_below", "Target price"],
  ]).get(kind) ?? "Condition";
const conditionPlaceholder = (kind: string) =>
  new Map([
    ["change", "For example: delivery date"],
    ["availability", "In stock"],
  ]).get(kind) ?? "";
const monitorButton = (monitor: Monitor) => {
  if (monitor.status === "needs_help") {
    return "Continue check";
  }
  return ["paused", "failed"].includes(monitor.status) ? "Resume" : "Pause";
};

const monthlySpending = (book: MonitoringBook | undefined) => {
  const month = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    timeZone: book?.budget.timezone ?? zone(),
  })
    .format(new Date())
    .slice(0, 7);
  const spent =
    book?.months.find((entry) => entry.month === month)?.spentUsdMicros ?? 0;
  const held =
    book?.checks
      .filter((entry) => entry.month === month)
      .reduce((total, entry) => total + entry.reservedUsdMicros, 0) ?? 0;
  return { spent, held };
};

export const MonitoringBudget = () => {
  const { state, budget } = useMonitoring();
  const id = useId();
  const [failure, setFailure] = useState<string | null>(null);
  const { spent, held } = monthlySpending(state.data);
  return (
    <section
      className="bg-card flex flex-col gap-4 rounded-3xl border p-5"
      aria-label="Monitoring budget"
    >
      <div>
        <h2 className="text-lg font-semibold">
          A little attention, on your terms
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Set one monthly credit limit for all your checks. Your credit limits
          also apply.
        </p>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const amount = Number(data.get("budget"));
          if (!Number.isFinite(amount) || amount < 0 || amount > 100_000) {
            setFailure(
              "Choose a monthly budget between 0 and 100,000 credits."
            );
            return;
          }
          setFailure(null);
          budget.mutate(
            {
              monthlyUsdMicros: Math.round(amount * 10_000),
              timezone:
                state.data !== undefined && state.data.checks.length > 0
                  ? state.data.budget.timezone
                  : zone(),
            },
            {
              onError: (error) => {
                setFailure(error.message);
              },
            }
          );
        }}
      >
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor={id}>
              Monthly monitoring limit (credits)
            </FieldLabel>
            <Input
              key={state.data?.budget.monthlyUsdMicros ?? "loading"}
              id={id}
              disabled={state.isPending || state.isError || budget.isPending}
              name="budget"
              type="number"
              min="0"
              max="100000"
              step="1"
              defaultValue={(state.data?.budget.monthlyUsdMicros ?? 0) / 10_000}
              required
            />
            <FieldDescription>
              Checks use up to 100 credits each. A zero limit stops new checks.
              No automatic budget increases.
            </FieldDescription>
          </Field>
          <Button type="submit" disabled={budget.isPending || state.isPending}>
            {budget.isPending ? "Saving…" : "Save budget"}
          </Button>
        </FieldGroup>
      </form>
      <p className="text-muted-foreground text-xs">
        This month: {formatCredits(spent)} spent, {formatCredits(held)}{" "}
        reserved. Budget resets each calendar month in{" "}
        {state.data?.budget.timezone ?? zone()}.
      </p>
      {failure !== null || state.error !== null ? (
        <p role="alert" className="text-destructive text-sm">
          {failure ?? state.error?.message}
        </p>
      ) : null}
      {budget.isSuccess ? (
        <output className="text-sm">Monitoring budget saved.</output>
      ) : null}
    </section>
  );
};

export const MonitorSetup = ({
  item,
  onDone,
  items,
}: {
  readonly items?: readonly WatchlistItem[];
  readonly item: WatchlistItem;
  readonly onDone?: () => void;
}) => {
  const { configure, state } = useMonitoring();
  const [kind, setKind] = useState("change");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const id = useId();
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const value = Schema.decodeUnknownSync(Schema.String)(
          data.get("value") ?? ""
        ).trim();
        const currency = Schema.decodeUnknownSync(Schema.String)(
          data.get("currency") ?? "USD"
        ).toUpperCase();
        const condition = conditionOf(kind, value, currency);
        const result = Schema.decodeUnknownResult(MonitorConfig)({
          itemId: item.id,
          cadence: data.get("cadence"),
          timezone: zone(),
          condition,
          context: data.get("context"),
        });
        if (result._tag === "Failure") {
          setFailure(
            "Choose a cadence, valid condition, and exact item details."
          );
          return;
        }
        setFailure(null);
        setBusy(true);
        const targets = items ?? [item];
        void (async () => {
          const results = await Promise.allSettled(
            targets.map(
              async (target) =>
                await configure.mutateAsync({
                  ...result.success,
                  itemId: target.id,
                  context: items
                    ? `${target.title}. ${target.notes}`.slice(0, 1000)
                    : result.success.context,
                })
            )
          );
          setBusy(false);
          const failed = results.filter((entry) => entry.status === "rejected");
          if (failed.length) {
            setFailure(
              `${failed.length} items could not be configured. Successfully configured items are already scheduled; review the remaining items before retrying.`
            );
          } else {
            onDone?.();
          }
        })();
      }}
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor={`${id}-cadence`}>How often?</FieldLabel>
          <NativeSelect
            className="w-full min-w-0"
            id={`${id}-cadence`}
            name="cadence"
            defaultValue=""
            required
          >
            <NativeSelectOption value="" disabled>
              Choose a cadence
            </NativeSelectOption>
            <NativeSelectOption value="hourly">
              Every hour · up to 74,400 credits/month
            </NativeSelectOption>
            <NativeSelectOption value="daily">
              Every day · up to 3,100 credits/month
            </NativeSelectOption>
            <NativeSelectOption value="weekly">
              Every week · up to 500 credits/month
            </NativeSelectOption>
          </NativeSelect>
          <FieldDescription>
            Your shared monthly limit can stop checks sooner.
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor={`${id}-condition`}>Notify me when</FieldLabel>
          <NativeSelect
            className="w-full min-w-0"
            id={`${id}-condition`}
            value={kind}
            onChange={(event) => {
              setKind(event.target.value);
            }}
          >
            <NativeSelectOption value="change">
              A field changes
            </NativeSelectOption>
            <NativeSelectOption value="price_below">
              Price reaches my target
            </NativeSelectOption>
            <NativeSelectOption value="price_drop">
              Price drops by a percentage
            </NativeSelectOption>
            <NativeSelectOption value="availability">
              Availability matches
            </NativeSelectOption>
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor={`${id}-value`}>
            {conditionLabel(kind)}
          </FieldLabel>
          <Input
            id={`${id}-value`}
            name="value"
            required
            maxLength={1000}
            placeholder={conditionPlaceholder(kind)}
          />
        </Field>
        {kind.startsWith("price_") ? (
          <Field>
            <FieldLabel htmlFor={`${id}-currency`}>Currency</FieldLabel>
            <Input
              id={`${id}-currency`}
              name="currency"
              defaultValue="USD"
              pattern="[A-Za-z]{3}"
              maxLength={3}
              required
            />
          </Field>
        ) : null}
        <Field>
          <FieldLabel htmlFor={`${id}-context`}>Exact item details</FieldLabel>
          <Input
            id={`${id}-context`}
            name="context"
            defaultValue={item.notes || item.title}
            required
            maxLength={1000}
          />
          <FieldDescription>
            Include size, colour, dates, travellers, or other details that
            affect the comparison.
          </FieldDescription>
        </Field>
      </FieldGroup>
      <p className="text-muted-foreground text-sm">
        We establish a baseline first, then notify you about matching changes in
        Froggy and paired Telegram. Login or CAPTCHA pauses the check for your
        help.
      </p>
      {(state.data?.budget.monthlyUsdMicros ?? 0) < 1_000_000 ? (
        <output className="text-sm">
          Set your monitoring budget below before enabling checks.
        </output>
      ) : null}
      {failure === null ? null : (
        <p role="alert" className="text-destructive text-sm">
          {failure}
        </p>
      )}
      <Button
        type="submit"
        disabled={
          busy || (state.data?.budget.monthlyUsdMicros ?? 0) < 1_000_000
        }
      >
        {busy ? "Setting up…" : "Enable monitoring"}
      </Button>
      {configure.isSuccess ? <output>Monitoring enabled.</output> : null}
    </form>
  );
};

const statusWords: Record<Monitor["status"], string> = {
  scheduled: "Scheduled",
  checking: "Checking",
  needs_help: "Needs your help",
  budget_exhausted: "Budget exhausted",
  failed: "Failed",
  paused: "Paused",
};
export const ItemMonitoring = ({ item }: { readonly item: WatchlistItem }) => {
  const { state, action } = useMonitoring();
  const monitor = state.data?.monitors.find(
    (entry) => entry.itemId === item.id
  );
  const [editing, setEditing] = useState(false);
  return (
    <section
      className="bg-card flex flex-col gap-4 rounded-3xl border p-5"
      aria-label={`Monitoring ${item.title}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Keep an eye on it</h2>
        {monitor ? (
          <Badge variant="secondary">{statusWords[monitor.status]}</Badge>
        ) : null}
      </div>
      {monitor ? (
        <>
          <p className="text-sm">
            {monitor.latest
              ? `${monitor.latest.stubbed ? "Demo observation: " : ""}${monitor.latest.value}`
              : "Waiting for the first observation."}
          </p>
          <p className="text-muted-foreground text-xs">
            {monitor.latest
              ? `Last checked ${new Date(monitor.latest.at).toLocaleString()}. `
              : ""}
            Next check:{" "}
            {monitor.status === "scheduled"
              ? new Date(monitor.nextAt).toLocaleString()
              : "paused"}
            .
          </p>
          {monitor.error === null ? null : (
            <output className="text-sm">{monitor.error}</output>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={action.isPending}
              onClick={() => {
                action.mutate({
                  id: monitor.id,
                  action:
                    monitor.status === "paused" ||
                    monitor.status === "needs_help" ||
                    monitor.status === "failed"
                      ? "resume"
                      : "pause",
                });
              }}
            >
              {monitorButton(monitor)}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={action.isPending || monitor.status === "checking"}
              onClick={() => {
                action.mutate({ id: monitor.id, action: "check" });
              }}
            >
              Check now
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditing(!editing);
              }}
            >
              Edit monitoring
            </Button>
          </div>
        </>
      ) : null}
      {monitor?.status === "needs_help" ? (
        <div className="flex flex-col gap-2">
          <Button variant="outline" render={<Link to="/browser" />}>
            Open browser to help
          </Button>
          <p className="text-muted-foreground text-sm">
            Complete the login or CAPTCHA, then use Resume in the browser. The
            same check continues with its existing reservation.
          </p>
        </div>
      ) : null}
      {monitor ? (
        <details className="text-sm">
          <summary className="min-h-11 cursor-pointer py-3">
            Recent checks and costs
          </summary>
          <ul className="flex flex-col gap-3">
            {(state.data?.checks ?? [])
              .filter((entry) => entry.monitorId === monitor.id)
              .slice(-10)
              .toReversed()
              .map((check) => (
                <li
                  key={check.id}
                  className="flex flex-col gap-1 border-t pt-3"
                >
                  <p>
                    {new Date(check.createdAt).toLocaleString()} ·{" "}
                    {check.status.replaceAll("_", " ")} ·{" "}
                    {formatCredits(check.spentUsdMicros)}
                  </p>
                  {check.observation ? (
                    <a
                      className="text-muted-foreground underline underline-offset-4"
                      href={check.observation.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {check.observation.stubbed ? "Demo: " : ""}
                      {check.observation.evidence}
                    </a>
                  ) : (
                    <p className="text-muted-foreground">
                      {check.error ?? "Check in progress"}
                    </p>
                  )}
                </li>
              ))}
          </ul>
        </details>
      ) : null}
      {!monitor || editing ? (
        <MonitorSetup
          item={item}
          onDone={() => {
            setEditing(false);
          }}
        />
      ) : null}
      {action.error ? (
        <p role="alert" className="text-destructive text-sm">
          {action.error.message}
        </p>
      ) : null}
    </section>
  );
};

export const ExistingMonitoring = () => {
  const { list } = useWatchlist();
  const { state } = useMonitoring();
  const [open, setOpen] = useState(false);
  const items = (list.data?.items ?? []).filter(
    (item) =>
      !item.archived &&
      state.data?.monitors.some((monitor) => monitor.itemId === item.id) !==
        true
  );
  if (items.length === 0) {
    return null;
  }
  return (
    <section className="flex flex-col gap-4 rounded-3xl border p-5">
      <h2 className="font-semibold">Start watching your saved items</h2>
      <p className="text-muted-foreground text-sm">
        {items.length} saved items have no checks yet. Choose defaults for these
        items. Saved variants and itinerary details are preserved.
      </p>
      <Button
        variant="outline"
        onClick={() => {
          setOpen(!open);
        }}
      >
        {open ? "Close setup" : "Enable monitoring for saved items"}
      </Button>
      {open && items[0] ? (
        <MonitorSetup
          item={items[0]}
          items={items}
          onDone={() => {
            setOpen(false);
          }}
        />
      ) : null}
    </section>
  );
};
