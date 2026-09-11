/**
 * The welcome flow's frame: the wordmark, the three step names, one column.
 *
 * Not the workspace frame. There is no rail and no pill while a person is
 * being welcomed — every step has its own way out — and the step names are
 * the whole progress indicator: no ring, no count of easy steps. Finished
 * steps get a tick, the current one is filled, the rest are outlined.
 */

import { Button } from "@froggy/ui/components/button";
import { FrogMark } from "@froggy/ui/components/frog-mark";
import { cn } from "@froggy/ui/lib/utils";
import { CheckIcon } from "lucide-react";
import type { ReactElement, ReactNode } from "react";

const STEPS = ["Welcome", "Spending rules", "Notifications"] as const;

/** Which step is open; `STEPS.length` once all three are behind the person. */
export type StepIndex = 0 | 1 | 2 | 3;

const Steps = ({ current }: { readonly current: StepIndex }): ReactElement => (
  <ol aria-label="Setup steps" className="flex items-center gap-1 sm:gap-3">
    {STEPS.map((label, index) => {
      const done = index < current;
      const active = index === current;
      return (
        <li
          aria-current={active ? "step" : undefined}
          className={cn(
            "flex items-center gap-1.5 text-xs",
            active ? "text-foreground font-medium" : "text-muted-foreground"
          )}
          key={label}
        >
          <span
            aria-hidden
            className={cn(
              "grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-semibold tabular-nums",
              active
                ? "bg-primary text-primary-foreground"
                : "border-border bg-card border",
              done ? "text-primary border-primary/50" : undefined
            )}
          >
            {done ? <CheckIcon className="size-3" /> : index + 1}
          </span>
          <span className={active ? undefined : "sr-only sm:not-sr-only"}>
            {label}
          </span>
        </li>
      );
    })}
  </ol>
);

export const WelcomeFrame = ({
  children,
  current,
  onSkip,
}: {
  readonly children: ReactNode;
  readonly current: StepIndex;
  /** Present on the first step only: from there on, each step has its own quiet exit. */
  readonly onSkip?: (() => void) | undefined;
}): ReactElement => (
  <div className="flex min-h-dvh flex-col">
    <header className="bg-background sticky top-0 z-20 border-b">
      <div className="mx-auto flex min-h-14 max-w-4xl items-center justify-between gap-3 px-4 py-2 sm:px-8">
        <div className="flex items-center gap-2">
          <span className="bg-brand-soft grid size-8 place-items-center rounded-lg">
            <FrogMark className="size-6" compact />
          </span>
          <span className="font-display hidden font-semibold sm:inline">
            Froggy
          </span>
        </div>
        <Steps current={current} />
        <div className="flex min-w-[5.5rem] justify-end">
          {onSkip === undefined ? null : (
            <Button
              className="min-h-11"
              onClick={onSkip}
              size="sm"
              variant="ghost"
            >
              Skip setup
            </Button>
          )}
        </div>
      </div>
    </header>
    <main className="flex flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-12">
        {children}
      </div>
    </main>
  </div>
);

/** A step's heading: one illustration, one sentence of title, one of detail. */
export const StepHeading = ({
  detail,
  illustration,
  title,
}: {
  readonly detail: string;
  readonly illustration: ReactNode;
  readonly title: string;
}): ReactElement => (
  <div className="flex items-start gap-4">
    <div className="shrink-0">{illustration}</div>
    <div className="min-w-0">
      <h1 className="text-greeting text-balance">{title}</h1>
      <p className="text-muted-foreground mt-2 max-w-prose text-sm leading-relaxed">
        {detail}
      </p>
    </div>
  </div>
);

/** A glyph in the brand's soft box, for a step with no mascot. */
export const StepGlyph = ({
  children,
}: {
  readonly children: ReactNode;
}): ReactElement => (
  <span className="bg-brand-soft text-brand grid size-12 place-items-center rounded-2xl">
    {children}
  </span>
);

/**
 * The actions row: Back on the left, the quiet option and the one primary
 * on the right. A note above them is where the step says what pressing the
 * primary does — one confirmation from Privy, nothing paid now.
 */
export const StepActions = ({
  back,
  note,
  primary,
  secondary,
}: {
  readonly back?: (() => void) | undefined;
  readonly note?: ReactNode;
  readonly primary: ReactNode;
  readonly secondary?: ReactNode;
}): ReactElement => (
  <div className="flex flex-col gap-3 border-t pt-6">
    {note === undefined ? null : (
      <div className="text-muted-foreground flex flex-col gap-1 text-xs">
        {note}
      </div>
    )}
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        {back === undefined ? null : (
          <Button className="min-h-11" onClick={back} variant="ghost">
            Back
          </Button>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {secondary}
        {primary}
      </div>
    </div>
  </div>
);
