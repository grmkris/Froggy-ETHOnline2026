/** Loading and signed-out stay distinct while the identity provider starts. */

import { Button } from "@froggy/ui/components/button";
import { FrogMark } from "@froggy/ui/components/frog-mark";
import { Skeleton } from "@froggy/ui/components/skeleton";

import { useIdentity } from "../lib/privy";

const BEATS = [
  ["Fund", "Add funds for the work you want your agents to do."],
  ["Control", "Freeze spending or disconnect an agent whenever you need."],
  ["Follow", "Watch the work, take control, and keep the receipts."],
] as const;

const Frame = ({
  children,
}: {
  readonly children: React.ReactNode;
}): React.ReactElement => (
  <div className="grid min-h-dvh place-items-center px-4 py-10 sm:p-8">
    <div className="bg-card shadow-card w-full max-w-lg rounded-3xl p-6 sm:p-10">
      {children}
    </div>
  </div>
);

const Wordmark = (): React.ReactElement => (
  <div className="mb-8">
    <div className="mb-7 flex items-center gap-3">
      <span className="bg-primary grid size-11 place-items-center rounded-2xl">
        <FrogMark className="size-8" />
      </span>
      <span className="font-display text-xl font-semibold tracking-tight">
        Froggy
      </span>
    </div>
    <h1 className="text-greeting max-w-xs text-balance">
      A wallet for your agents.
    </h1>
    <p className="text-muted-foreground mt-4 text-base leading-relaxed">
      Fund tasks and follow the work your agents do.
    </p>
  </div>
);

export const SignInGate = (): React.ReactElement => {
  const identity = useIdentity();

  if (identity.status === "loading") {
    return (
      <Frame>
        <Wordmark />
        <output aria-label="Preparing sign-in" className="flex flex-col gap-3">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-11 w-full rounded-xl" />
          <span className="sr-only">Preparing sign-in</span>
        </output>
      </Frame>
    );
  }

  if (identity.status === "failed") {
    return (
      <Frame>
        <Wordmark />
        <p
          className="bg-refused-soft text-refused mb-4 rounded-xl p-4 text-sm"
          role="alert"
        >
          Sign-in couldn’t start. Retry to reconnect.
        </p>
        <Button
          className="min-h-11 w-full"
          onClick={() => {
            window.location.reload();
          }}
          size="lg"
        >
          Retry sign-in
        </Button>
      </Frame>
    );
  }

  return (
    <Frame>
      <Wordmark />
      <ol className="mb-8 flex flex-col gap-4">
        {BEATS.map(([title, text]) => (
          <li className="flex gap-4" key={title}>
            <span className="text-brand w-16 shrink-0 text-sm font-semibold">
              {title}
            </span>
            <span className="text-muted-foreground text-sm leading-relaxed">
              {text}
            </span>
          </li>
        ))}
      </ol>
      <Button
        className="min-h-11 w-full rounded-xl text-base"
        onClick={() => {
          identity.login();
        }}
        size="lg"
      >
        Sign in with email or Google
      </Button>
      <p className="text-muted-foreground mt-4 text-center text-xs">
        Bring your own agent, or start a task with Froggy.
      </p>
    </Frame>
  );
};
