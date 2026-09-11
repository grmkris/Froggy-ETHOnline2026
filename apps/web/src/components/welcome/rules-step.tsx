/**
 * Step two: the numbers, and the one signature that lets Froggy pay.
 *
 * The same grant Settings asks for, moved to the front. The defaults come
 * from the policy minted at sign-in and are shown as four tiles in the order
 * a person reads them — the line below which Froggy pays on its own, the
 * most for one payment, the most in a day, and when it all ends. One button
 * calls Privy; Adjust opens the same form Settings uses. Skipping writes
 * nothing, and the first paid task asks then. Nothing here is a tool, and
 * nothing here widens what the agent may spend beyond what was just read.
 */

import { defaultAllowance, formatUsd } from "@froggy/domain";
import type { Allowance } from "@froggy/domain";
import type { WalletSummary } from "@froggy/protocol";
import { Button } from "@froggy/ui/components/button";
import { Skeleton } from "@froggy/ui/components/skeleton";
import { SlidersHorizontalIcon } from "lucide-react";
import { useState } from "react";
import type { ReactElement, ReactNode } from "react";

import { attachAgentSigner, signerGrantWords } from "../../lib/agent-policy";
import { useIdentity } from "../../lib/privy";
import { useSessionIds } from "../../lib/session-ids";
import { useSessionToken } from "../../lib/session-token";
import { walletAmounts } from "../../lib/wallet-view";
import { AllowanceForm } from "../settings/allowance-form";
import { StepActions, StepGlyph, StepHeading } from "./frame";

const DAY_MS = 86_400_000;

const endsOn = (expiresAt: number): string =>
  new Date(expiresAt).toLocaleDateString([], {
    day: "numeric",
    month: "short",
  });

/** The four numbers, each with the sentence a first-time reader needs under it. */
const Tiles = ({
  allowance,
  openedAt,
}: {
  readonly allowance: Allowance;
  readonly openedAt: number;
}): ReactElement => {
  const days = Math.max(
    1,
    Math.round((allowance.expiresAt - openedAt) / DAY_MS)
  );
  const tiles = [
    {
      label: "up to this without asking",
      value: formatUsd(allowance.askOverUsdMicros),
    },
    {
      label: "most for one payment",
      value: formatUsd(allowance.perSpendUsdMicros),
    },
    { label: "most in a day", value: formatUsd(allowance.dailyUsdMicros) },
    { label: `ends ${endsOn(allowance.expiresAt)}`, value: `${days} days` },
  ];
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {tiles.map((tile) => (
        <div
          className="bg-card shadow-card flex flex-col gap-1 rounded-xl p-4"
          key={tile.label}
        >
          <dd className="font-display text-xl font-semibold tracking-tight tabular-nums">
            {tile.value}
          </dd>
          <dt className="text-muted-foreground text-xs leading-snug">
            {tile.label}
          </dt>
        </div>
      ))}
    </dl>
  );
};

const LoadingTiles = (): ReactElement => (
  <output
    aria-label="Loading your rules"
    className="grid grid-cols-2 gap-3 sm:grid-cols-4"
  >
    {[0, 1, 2, 3].map((slot) => (
      <Skeleton aria-hidden className="h-[4.5rem] rounded-xl" key={slot} />
    ))}
    <span className="sr-only">Loading your rules</span>
  </output>
);

/** The balance, said plainly, because "pay with what?" is the first question. */
const balanceWords = (wallet: WalletSummary | null): string => {
  const total = walletAmounts(wallet).totalUsdMicros;
  if (total === null) {
    return "Froggy spends only from your wallet, and only within these rules.";
  }
  if (total === 0) {
    return "Your balance is $0.00. Froggy cannot spend anything until you add funds, and then only within these rules.";
  }
  return `Your balance is ${formatUsd(total)}. Froggy can spend it only within these rules.`;
};

/** What the numbers mean, in the order a payment meets them. */
const rulesWords = (allowance: Allowance): string => {
  const ask = formatUsd(allowance.askOverUsdMicros);
  const per = formatUsd(allowance.perSpendUsdMicros);
  const daily = formatUsd(allowance.dailyUsdMicros);
  const below =
    allowance.askOverUsdMicros < allowance.perSpendUsdMicros
      ? `Between ${ask} and ${per} for one payment, Froggy asks you first.`
      : `Up to ${per} for one payment, Froggy pays on its own.`;
  return `${below} Above ${per}, or past ${daily} in a day, it cannot pay at all.`;
};

/** Why there is nothing to press but Continue, when there is not. */
const cannotWords = (
  standing: WalletSummary["agentSigner"] | null,
  stubbed: boolean
): string => {
  if (stubbed) {
    return "A local identity has no wallet for Privy to hold, so Froggy can look but not pay here.";
  }
  if (standing === "pending") {
    return "Asking Privy for the agent’s signer… Continue, and Account will say when it is there.";
  }
  return "Froggy cannot ask Privy for a signature right now. Continue, and Account will offer it once it can.";
};

/** What the step is, from what the wallet says and what was just pressed. */
type Phase = "loading" | "ask" | "granted" | "cannot";

const Notes = ({
  allowance,
  wallet,
}: {
  readonly allowance: Allowance;
  readonly wallet: WalletSummary | null;
}): ReactElement => (
  <ul className="flex flex-col gap-2 text-sm leading-relaxed">
    <li>{balanceWords(wallet)}</li>
    <li className="text-muted-foreground">{rulesWords(allowance)}</li>
    <li className="text-muted-foreground">
      Only services you have added can be paid. A link you paste is checked
      first, never paid.
    </li>
    <li className="text-muted-foreground">
      You can change these numbers, or stop the agent, at any time in Account.
    </li>
  </ul>
);

/** What sits under the actions: what the primary does, or why there is none. */
const noteFor = (
  phase: Phase,
  granted: boolean,
  standing: WalletSummary["agentSigner"] | null,
  stubbed: boolean
): ReactNode => {
  if (phase === "ask") {
    return (
      <>
        <span>
          One confirmation from Privy, which holds the wallet. Nothing is paid
          now.
        </span>
        <span>Skip, and Froggy asks when it first needs to pay.</span>
      </>
    );
  }
  if (phase === "loading") {
    return <span>Reading your wallet…</span>;
  }
  if (phase === "cannot") {
    return <span>{cannotWords(standing, stubbed)}</span>;
  }
  return (
    <span>
      {granted
        ? "Granted. The wallet updates in a moment."
        : "Froggy may already pay under these rules. Change them any time in Account."}
    </span>
  );
};

interface Grant {
  readonly busy: boolean;
  readonly consent: () => Promise<void>;
  readonly granted: boolean;
  readonly outcome: string | null;
  readonly phase: Phase;
}

/** The grant, as the step drives it: what can be asked, and asking it. */
const useGrant = (
  wallet: WalletSummary | null,
  chosen: Allowance | null,
  onGranted: () => void
): Grant => {
  const identity = useIdentity();
  const { agentSignerId, policyId } = useSessionIds();
  const { getToken } = useSessionToken();
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<string | null>(null);
  // Privy said yes: held here as well as read from the wallet, because the
  // wallet is refreshed by the server a moment later and a button that still
  // said "Let Froggy pay" in that moment would be asking for a second grant.
  const [granted, setGranted] = useState(false);

  const grant = identity.grantAgentSigner;
  const address = wallet?.address ?? null;
  const standing = wallet?.agentSigner ?? null;
  const theirs = wallet?.agentPolicyId ?? policyId;
  const askable =
    !granted &&
    (standing === "absent" || standing === "shared") &&
    address !== null &&
    grant !== null &&
    agentSignerId !== null &&
    theirs !== null;
  const phase = ((): Phase => {
    if (wallet === null) {
      return "loading";
    }
    if (granted || standing === "granted") {
      return "granted";
    }
    return askable ? "ask" : "cannot";
  })();

  const consent = async (): Promise<void> => {
    if (!askable) {
      return;
    }
    setBusy(true);
    setOutcome(null);
    const result = await attachAgentSigner({
      address,
      chosen,
      getToken,
      grant,
      policyId: theirs,
      sign: identity.signPrivyRequest,
      signerId: agentSignerId,
    });
    setBusy(false);
    if (result.kind === "refused") {
      setOutcome(signerGrantWords(result));
      return;
    }
    setGranted(true);
    if (result.kind === "granted") {
      onGranted();
      return;
    }
    // The signer is there and the defaults hold; the numbers the person typed
    // are not. Said here, before they move on, since Account is where to retry.
    setOutcome(signerGrantWords(result));
  };
  return { busy, consent, granted, outcome, phase };
};

export const RulesStep = ({
  onBack,
  onContinue,
  wallet,
}: {
  readonly onBack: () => void;
  /** Whether granted, skipped or already there: the next step is the same. */
  readonly onContinue: () => void;
  readonly wallet: WalletSummary | null;
}): ReactElement => {
  const identity = useIdentity();
  const [adjusting, setAdjusting] = useState(false);
  const [chosen, setChosen] = useState<Allowance | null>(null);
  // Held rather than read during render, so the proposed expiry does not
  // drift while the person reads it; re-read when they open the form.
  const [openedAt, setOpenedAt] = useState(() => Date.now());
  const { busy, consent, granted, outcome, phase } = useGrant(
    wallet,
    chosen,
    onContinue
  );
  const proposed =
    chosen ?? wallet?.agentAllowance ?? defaultAllowance(openedAt);

  return (
    <>
      <StepHeading
        detail="One click sets the rules. They are checked by code on every payment, outside the AI — Froggy cannot talk its way past them."
        illustration={
          <StepGlyph>
            <SlidersHorizontalIcon aria-hidden className="size-6" />
          </StepGlyph>
        }
        title="How much may Froggy spend?"
      />
      {phase === "loading" ? (
        <LoadingTiles />
      ) : (
        <Tiles allowance={proposed} openedAt={openedAt} />
      )}
      {adjusting ? (
        <div className="bg-card shadow-card flex flex-col gap-3 rounded-xl p-4">
          <AllowanceForm
            allowance={proposed}
            onSave={(next) => {
              setChosen(next);
              setAdjusting(false);
            }}
            saveLabel="Use these numbers"
          />
          <Button
            className="self-start"
            onClick={() => {
              setAdjusting(false);
            }}
            size="sm"
            variant="ghost"
          >
            Never mind
          </Button>
        </div>
      ) : null}
      {adjusting || phase !== "ask" ? null : (
        <button
          className="text-primary self-start text-sm underline underline-offset-4"
          onClick={() => {
            setOpenedAt(Date.now());
            setAdjusting(true);
          }}
          type="button"
        >
          Adjust these numbers
        </button>
      )}
      <Notes allowance={proposed} wallet={wallet} />
      {outcome === null ? null : (
        <output className="text-refused text-sm" role="alert">
          {outcome}
        </output>
      )}
      <StepActions
        back={onBack}
        note={noteFor(
          phase,
          granted,
          wallet?.agentSigner ?? null,
          identity.stubbed
        )}
        primary={
          phase === "ask" ? (
            <Button
              className="min-h-11"
              disabled={busy || adjusting}
              onClick={() => {
                void consent();
              }}
            >
              {busy ? "Asking Privy…" : "Let Froggy pay under these rules"}
            </Button>
          ) : (
            <Button
              className="min-h-11"
              disabled={phase === "loading"}
              onClick={onContinue}
            >
              Continue
            </Button>
          )
        }
        secondary={
          phase === "ask" ? (
            <Button
              className="min-h-11"
              disabled={busy}
              onClick={onContinue}
              variant="outline"
            >
              Not now
            </Button>
          ) : undefined
        }
      />
    </>
  );
};
