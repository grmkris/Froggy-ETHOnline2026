/**
 * The one tap that lets the agent sign: Privy asks the person directly, in
 * its own prompt, and the server reads the answer off the wallet. Shown only
 * while the agent has no signer and everything needed to ask is known.
 */

import { defaultAllowance } from "@froggy/domain";
import type { Allowance } from "@froggy/domain";
import type { WalletSummary } from "@froggy/protocol";
import { Button } from "@froggy/ui/components/button";
import { useState } from "react";
import type { ReactElement } from "react";

import { attachAgentSigner, signerGrantWords } from "../../lib/agent-policy";
import { useIdentity } from "../../lib/privy";
import { useSessionIds } from "../../lib/session-ids";
import { useSessionToken } from "../../lib/session-token";
import { AllowanceForm } from "./allowance-form";

const dollars = (micros: number): string =>
  `$${(micros / 1_000_000).toFixed(2)}`;

/** What the one button says, which depends on which of the three states this is. */
const label = (busy: boolean, standing: string | null): string => {
  if (busy) {
    return "Asking Privy…";
  }
  return standing === "shared"
    ? "Move the agent onto these rules"
    : "Let the agent pay under these rules";
};

export const AgentSignerConsent = ({
  wallet,
}: {
  readonly wallet: WalletSummary | null;
}): ReactElement | null => {
  const identity = useIdentity();
  const { agentSignerId, policyId } = useSessionIds();
  const { getToken } = useSessionToken();
  const [outcome, setOutcome] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [chosen, setChosen] = useState<Allowance | null>(null);
  // Held rather than read during render: a clock called on every render makes
  // the proposed expiry drift while the person reads it. Re-read when they open
  // the form, so thirty days counts from when they act rather than from
  // whenever this page happened to load.
  const [openedAt, setOpenedAt] = useState(() => Date.now());
  const grant = identity.grantAgentSigner;
  const address = wallet?.address ?? null;
  const standing = wallet?.agentSigner ?? null;
  // The person's own policy when they have one; the app-wide policy otherwise,
  // which is what a deployment that mints none still signs under.
  const theirs = wallet?.agentPolicyId ?? policyId;
  if (
    (standing !== "absent" && standing !== "shared") ||
    address === null ||
    grant === null ||
    agentSignerId === null ||
    theirs === null
  ) {
    return null;
  }
  const consent = async (): Promise<void> => {
    setBusy(true);
    const result = await attachAgentSigner({
      address,
      chosen,
      getToken,
      grant,
      policyId: theirs,
      sign: identity.signPrivyRequest,
      signerId: agentSignerId,
    });
    setOutcome(signerGrantWords(result));
    setBusy(false);
  };
  // The defaults are shown, not imposed: one tap still grants, and Adjust opens
  // the same form Settings uses rather than a second version of it.
  const proposed =
    chosen ?? wallet?.agentAllowance ?? defaultAllowance(openedAt);
  if (adjusting) {
    return (
      <div className="flex flex-col gap-3">
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
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-muted-foreground text-xs">
        Up to {dollars(proposed.perSpendUsdMicros)} a payment,{" "}
        {dollars(proposed.dailyUsdMicros)} a day, asking you above{" "}
        {dollars(proposed.askOverUsdMicros)}, for{" "}
        {Math.round((proposed.expiresAt - openedAt) / 86_400_000)} days.{" "}
        <button
          className="underline underline-offset-2"
          onClick={() => {
            setOpenedAt(Date.now());
            setAdjusting(true);
          }}
          type="button"
        >
          Adjust
        </button>
      </p>
      {standing === "shared" ? (
        <p className="text-muted-foreground text-xs">
          Moving it takes one tap. Privy allows a signer only one set of rules,
          so the old ones are removed before yours are added, and the agent can
          pay nothing for the moment in between.
        </p>
      ) : null}
      <Button
        className="min-h-11 self-start"
        disabled={busy}
        onClick={() => {
          void consent();
        }}
        size="sm"
      >
        {label(busy, standing)}
      </Button>
      {outcome === null ? null : (
        <output className="text-muted-foreground text-xs">{outcome}</output>
      )}
    </div>
  );
};
