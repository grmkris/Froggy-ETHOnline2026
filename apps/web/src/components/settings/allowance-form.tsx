/**
 * The four numbers a person's agent is held to.
 *
 * Written once and mounted twice, in the grant sheet behind **Adjust** and in
 * Settings as **Change**, because they are the same act: a judge who asks "do
 * they set their own rules?" should be shown this in two seconds, and one tap
 * should still be enough for everyone who does not care.
 *
 * It sends on the app socket rather than over HTTP, like an approval and a
 * mandate edit. What may be spent is changed by a human on that channel and
 * nowhere else; a route the model could reach would be the one hole this whole
 * design exists to keep shut.
 *
 * Dollars on the way in and out, micro-dollars on the wire: the person types
 * `2.50`, the leash compares `2500000`, and nothing in between rounds.
 */

import { usd } from "@froggy/domain";
import type { Allowance } from "@froggy/domain";
import { Button } from "@froggy/ui/components/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@froggy/ui/components/field";
import { Input } from "@froggy/ui/components/input";
import { useId, useState } from "react";
import type { ReactElement } from "react";

const DAY_MS = 86_400_000;

/** What the form holds while it is being typed: strings, because inputs are. */
interface Draft {
  readonly askOver: string;
  readonly daily: string;
  readonly days: string;
  readonly perSpend: string;
}

const toDraft = (allowance: Allowance): Draft => ({
  askOver: (allowance.askOverUsdMicros / 1_000_000).toString(),
  daily: (allowance.dailyUsdMicros / 1_000_000).toString(),
  days: Math.max(
    0,
    Math.round((allowance.expiresAt - Date.now()) / DAY_MS)
  ).toString(),
  perSpend: (allowance.perSpendUsdMicros / 1_000_000).toString(),
});

/** A positive number, or null. Rejects blanks, text and negatives alike. */
const amount = (raw: string): number | null => {
  const value = Number(raw);
  return raw.trim() !== "" && Number.isFinite(value) && value > 0
    ? value
    : null;
};

/**
 * What is wrong with these numbers, in the person's terms, or null.
 *
 * The two relationships are checked as well as the values, because a daily cap
 * under the per-spend cap and an ask-line above the per-spend cap are both
 * *accepted everywhere else* and both mean the opposite of what the person
 * intended: the first makes one spend impossible, the second makes the approval
 * card unreachable.
 */
export const allowanceProblem = (draft: Draft): string | null => {
  const perSpend = amount(draft.perSpend);
  const daily = amount(draft.daily);
  const askOver = amount(draft.askOver);
  const days = Number(draft.days);
  if (perSpend === null || daily === null || askOver === null) {
    return "Every amount has to be more than zero.";
  }
  if (!Number.isFinite(days) || days < 1) {
    return "A grant has to last at least a day.";
  }
  if (days > 30) {
    return "Privy allows at most thirty days; ask again when it runs out.";
  }
  if (daily < perSpend) {
    return "The daily limit is below the single-spend limit, so no spend could ever happen.";
  }
  if (askOver > perSpend) {
    return "Asking above the single-spend limit means you would never be asked.";
  }
  return null;
};

const toAllowance = (draft: Draft): Allowance => ({
  askOverUsdMicros: usd(Number(draft.askOver)),
  dailyUsdMicros: usd(Number(draft.daily)),
  expiresAt: Date.now() + Number(draft.days) * DAY_MS,
  perSpendUsdMicros: usd(Number(draft.perSpend)),
});

export const AllowanceForm = ({
  allowance,
  busyLabel,
  onSave,
  saveLabel,
}: {
  readonly allowance: Allowance;
  readonly busyLabel?: string;
  readonly onSave: (next: Allowance) => void;
  readonly saveLabel?: string;
}): ReactElement => {
  const [draft, setDraft] = useState<Draft>(() => toDraft(allowance));
  const [touched, setTouched] = useState(false);
  const ids = {
    askOver: useId(),
    daily: useId(),
    days: useId(),
    perSpend: useId(),
  };
  const problem = allowanceProblem(draft);
  const set = (key: keyof Draft, value: string): void => {
    setTouched(true);
    setDraft((current) => ({ ...current, [key]: value }));
  };
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (problem === null) {
          onSave(toAllowance(draft));
        }
      }}
    >
      <Field>
        <FieldLabel htmlFor={ids.perSpend}>Most in one payment</FieldLabel>
        <Input
          id={ids.perSpend}
          inputMode="decimal"
          onChange={(event) => {
            set("perSpend", event.target.value);
          }}
          value={draft.perSpend}
        />
        <FieldDescription>
          Dollars. Anything above this is refused outright, not asked about.
        </FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor={ids.daily}>Most in a day</FieldLabel>
        <Input
          id={ids.daily}
          inputMode="decimal"
          onChange={(event) => {
            set("daily", event.target.value);
          }}
          value={draft.daily}
        />
        <FieldDescription>
          Rolling, not midnight to midnight, so it cannot be emptied twice in
          two minutes.
        </FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor={ids.askOver}>Ask me above</FieldLabel>
        <Input
          id={ids.askOver}
          inputMode="decimal"
          onChange={(event) => {
            set("askOver", event.target.value);
          }}
          value={draft.askOver}
        />
        <FieldDescription>
          Below this the agent pays on its own. Paying a person always asks,
          whatever this says.
        </FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor={ids.days}>Expires after</FieldLabel>
        <Input
          id={ids.days}
          inputMode="numeric"
          onChange={(event) => {
            set("days", event.target.value);
          }}
          value={draft.days}
        />
        <FieldDescription>
          Days, up to thirty. After this the agent can pay nothing until you
          extend it here.
        </FieldDescription>
      </Field>
      {touched && problem !== null ? <FieldError>{problem}</FieldError> : null}
      <Button
        className="min-h-11 self-start"
        disabled={problem !== null}
        size="sm"
        type="submit"
      >
        {busyLabel ?? saveLabel ?? "Save these rules"}
      </Button>
    </form>
  );
};
