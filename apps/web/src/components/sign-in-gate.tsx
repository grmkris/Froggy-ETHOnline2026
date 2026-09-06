/**
 * The front door.
 *
 * Three states, each with its own sentence. Loading is not "signed out" — a
 * signed-in person must never see a sign-in button flash while Privy wakes
 * up — and a Privy that failed to start is not "click again".
 */

import { Button } from "@froggy/ui/components/button";
import { FrogMark } from "@froggy/ui/components/frog-mark";
import { Skeleton } from "@froggy/ui/components/skeleton";

import { useIdentity } from "../lib/privy";

const BEATS = [
  [
    "Watch",
    "The agent drives a real browser you can see, and take, at any moment.",
  ],
  [
    "Leash",
    "Every payment goes through your mandate. The model cannot raise a limit.",
  ],
  ["Stop", "One word ends the run, and one button disconnects an agent."],
] as const;

const Frame = ({
  children,
}: {
  readonly children: React.ReactNode;
}): React.ReactElement => (
  <div className="grid min-h-dvh place-items-center p-6">
    <div className="rise-in w-full max-w-md">{children}</div>
  </div>
);

const Wordmark = (): React.ReactElement => (
  <div className="mb-6 flex items-center gap-3">
    <span className="bg-primary shadow-card grid size-11 place-items-center rounded-2xl">
      <FrogMark className="size-8" />
    </span>
    <div>
      <h1 className="font-display text-2xl font-semibold tracking-tight">
        Froggy
      </h1>
      <p className="text-muted-foreground text-sm">
        An agent with a browser you can watch, and a wallet that says no.
      </p>
    </div>
  </div>
);

export const SignInGate = (): React.ReactElement => {
  const identity = useIdentity();

  if (identity.status === "loading") {
    return (
      <Frame>
        <Wordmark />
        <div className="space-y-3">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-10 w-full rounded-xl" />
        </div>
      </Frame>
    );
  }

  if (identity.status === "failed") {
    return (
      <Frame>
        <Wordmark />
        <p className="bg-refused-soft rounded-xl p-4 text-sm">
          Sign-in could not start. The reason is in the browser console, logged
          as “Privy failed to initialise”.
        </p>
      </Frame>
    );
  }

  return (
    <Frame>
      <Wordmark />
      <ol className="mb-6 space-y-3">
        {BEATS.map(([title, text]) => (
          <li className="flex gap-3" key={title}>
            <span className="font-display text-brand w-14 shrink-0 text-sm font-semibold">
              {title}
            </span>
            <span className="text-sm">{text}</span>
          </li>
        ))}
      </ol>
      <Button
        className="h-11 w-full rounded-xl text-base"
        onClick={() => {
          identity.login();
        }}
        size="lg"
      >
        Sign in with email or Google
      </Button>
      <p className="text-muted-foreground mt-3 text-center text-xs">
        Testnets only. Nothing here holds real funds.
      </p>
    </Frame>
  );
};
