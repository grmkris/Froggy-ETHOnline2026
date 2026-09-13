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
  FieldGroup,
  FieldLabel,
} from "@froggy/ui/components/field";
import { Input } from "@froggy/ui/components/input";
import { Skeleton } from "@froggy/ui/components/skeleton";
import { useId, useState } from "react";

import { useCredits } from "../../hooks/use-credits";
import {
  creditLimit,
  creditNumber,
  formatCredits,
} from "../../lib/credit-view";
import { BuyCredits } from "./buy-credits";

const ACTIVITY_WORDS = {
  funding: "Added",
  reserve: "Held",
  capture: "Used",
  release: "Returned",
  refusal: "Refused",
};

export const CreditLimitsForm = () => {
  const { summary, limits } = useCredits();
  const id = useId();
  const [error, setError] = useState<string | null>(null);
  const current = summary.data?.limits;
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const perTaskUnits = creditLimit(form.get("perTask"));
        const dailyUnits = creditLimit(form.get("daily"));
        if (
          perTaskUnits === null ||
          dailyUnits === null ||
          perTaskUnits > dailyUnits
        ) {
          setError(
            "Enter valid credit limits. The daily limit must cover the per-task limit."
          );
          return;
        }
        setError(null);
        limits.mutate({ perTaskUnits, dailyUnits });
      }}
    >
      <FieldGroup>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor={`${id}-task`}>
              Most per task (credits)
            </FieldLabel>
            <Input
              id={`${id}-task`}
              name="perTask"
              inputMode="decimal"
              key={current?.perTaskUnits ?? "loading"}
              defaultValue={
                current ? String(current.perTaskUnits / 10_000) : ""
              }
              disabled={!current || limits.isPending}
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${id}-day`}>
              Most in 24 hours (credits)
            </FieldLabel>
            <Input
              id={`${id}-day`}
              name="daily"
              inputMode="decimal"
              key={current?.dailyUnits ?? "loading"}
              defaultValue={current ? String(current.dailyUnits / 10_000) : ""}
              disabled={!current || limits.isPending}
              required
            />
          </Field>
        </div>
        <FieldDescription>
          Tasks run within these limits without asking each time. Active
          reservations count toward your rolling 24-hour limit. A zero limit
          stops new paid work.
        </FieldDescription>
        <Button
          className="self-start"
          type="submit"
          disabled={!current || limits.isPending}
        >
          {limits.isPending ? "Saving…" : "Save credit limits"}
        </Button>
        {error !== null || limits.error !== null ? (
          <p role="alert" className="text-destructive text-sm">
            {error ?? limits.error?.message}
          </p>
        ) : null}
        {limits.isSuccess ? (
          <output className="text-sm">Credit limits saved.</output>
        ) : null}
      </FieldGroup>
    </form>
  );
};

export const CreditsPanel = () => {
  const { summary, activity } = useCredits(true);
  const state = summary.data;
  return (
    <section aria-label="Platform credits" className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Froggy credits</CardTitle>
            {state?.stubbed === true ? (
              <Badge variant="outline">Simulated</Badge>
            ) : null}
          </div>
          <CardDescription>
            One balance for tools, browser tasks and paid monitoring.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {summary.isPending ? (
            <Skeleton className="h-12 w-40" aria-label="Loading credits" />
          ) : (
            <div>
              <p
                className="text-money text-4xl tabular-nums"
                data-slot="credit-total"
              >
                {state ? creditNumber(state.availableUnits) : "Unavailable"}
              </p>
              <p className="text-muted-foreground mt-1 text-sm">
                credits available · 100 credits = $1
              </p>
            </div>
          )}
          {state && state.reservedUnits > 0 ? (
            <p className="text-muted-foreground text-sm">
              {formatCredits(state.reservedUnits)} held for active work.
            </p>
          ) : null}
          {state?.availableUnits === 0 ? (
            <p className="text-sm">
              Start with free conversation and account tools. Buy credits when
              you want paid work.
            </p>
          ) : null}
          {summary.error ? (
            <p role="alert" className="text-destructive text-sm">
              {summary.error.message}
            </p>
          ) : null}
          <div>
            <BuyCredits />
          </div>
          <p className="text-muted-foreground text-xs">
            Credits are nontransferable usage credits. Wallet funds, trading
            capital and external purchases stay separate.
          </p>
          <details>
            <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">
              Credit limits
            </summary>
            <CreditLimitsForm />
          </details>
        </CardContent>
      </Card>
      <section aria-label="Credit activity" className="flex flex-col gap-3">
        <h2 className="text-section">Credit activity</h2>
        {activity.isPending ? (
          <Skeleton
            className="h-16 w-full"
            aria-label="Loading credit activity"
          />
        ) : null}
        {activity.error ? (
          <p role="alert" className="text-destructive text-sm">
            {activity.error.message}
          </p>
        ) : null}
        {activity.data?.entries.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Your purchases, usage and returned credits appear here.
          </p>
        ) : null}
        <ul className="flex flex-col divide-y">
          {(activity.data?.entries ?? []).map((entry) => (
            <li
              key={entry.id}
              className="flex items-start justify-between gap-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm">{entry.note}</p>
                <p className="text-muted-foreground mt-1 text-xs">
                  {new Date(entry.at).toLocaleString()} ·{" "}
                  {ACTIVITY_WORDS[entry.kind]}
                  {entry.stubbed ? " · Simulated" : ""}
                </p>
              </div>
              <span className="shrink-0 text-sm tabular-nums">
                {formatCredits(entry.units)}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
};
