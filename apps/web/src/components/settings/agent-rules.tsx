/**
 * The person's rules, on the Settings card: what they are, and changing them.
 *
 * Shown only once they have a policy of their own. Somebody still on the shared
 * policy is offered the move instead, by `AgentSignerConsent` above this — two
 * calls to action on one card would be one too many, and the move has to happen
 * first anyway.
 */

import type { Allowance } from "@froggy/domain";
import type { WalletSummary } from "@froggy/protocol";
import { Button } from "@froggy/ui/components/button";
import { useState } from "react";
import type { ReactElement } from "react";

import { changeAllowance } from "../../lib/agent-policy";
import { useIdentity } from "../../lib/privy";
import { useSessionToken } from "../../lib/session-token";
import { AllowanceForm } from "./allowance-form";

const money = (micros: number): string => `$${(micros / 1_000_000).toFixed(2)}`;

/** How long is left, in the coarsest unit that is still honest. */
const left = (expiresAt: number): string => {
  const days = Math.floor((expiresAt - Date.now()) / 86_400_000);
  if (days < 0) {
    return "This permission has expired, so the agent can pay nothing.";
  }
  if (days === 0) {
    return "This permission runs out today.";
  }
  return `This permission runs out in ${days} days.`;
};

export const AgentRules = ({
  wallet,
}: {
  readonly wallet: WalletSummary | null;
}): ReactElement | null => {
  const identity = useIdentity();
  const { getToken } = useSessionToken();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<string | null>(null);

  const apply = async (next: Allowance): Promise<void> => {
    setBusy(true);
    setOutcome(null);
    const result = await changeAllowance({
      allowance: next,
      sign: identity.signPrivyRequest,
      token: await getToken(),
    });
    setBusy(false);
    if (result.kind === "refused") {
      // Shown rather than swallowed. If Privy will not let a person edit a
      // policy they own, this is where everyone finds out, and a button that
      // silently does nothing would hide exactly the thing worth knowing.
      setOutcome(result.reason);
      return;
    }
    setEditing(false);
    setOutcome("Saved. Your agent is held to these from now on.");
  };
  const allowance = wallet?.agentAllowance ?? null;
  const grantSheetHandlesIt =
    identity.grantAgentSigner !== null &&
    (wallet?.agentSigner === "absent" || wallet?.agentSigner === "shared");
  // Shown once there are numbers to edit. Until they grant, the consent sheet
  // is the editor; a local identity cannot grant, so this is the editor.
  if (allowance === null || grantSheetHandlesIt) {
    return null;
  }
  if (editing) {
    return (
      <div className="flex flex-col gap-3">
        <AllowanceForm
          allowance={allowance}
          busyLabel={busy ? "Asking Privy…" : undefined}
          onSave={(next) => {
            void apply(next);
          }}
        />
        {outcome === null ? null : (
          <output className="text-muted-foreground text-xs">{outcome}</output>
        )}
        <Button
          className="self-start"
          onClick={() => {
            setEditing(false);
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
      <p className="text-sm">
        Your agent may pay up to {money(allowance.perSpendUsdMicros)} at a time
        and {money(allowance.dailyUsdMicros)} a day, and asks you above{" "}
        {money(allowance.askOverUsdMicros)}. {left(allowance.expiresAt)}
      </p>
      {outcome === null ? null : (
        <output className="text-muted-foreground text-xs">{outcome}</output>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          className="min-h-11"
          disabled={busy}
          onClick={() => {
            setOutcome(null);
            setEditing(true);
          }}
          size="sm"
          variant="outline"
        >
          Change these
        </Button>
        <Button
          className="min-h-11"
          onClick={() => {
            // Thirty days from today, not thirty on top of what is left:
            // Privy's ceiling is thirty, so adding to a live grant would ask
            // for something it refuses. The label says "to" for that reason.
            void apply({
              ...allowance,
              expiresAt: Date.now() + 30 * 86_400_000,
            });
          }}
          size="sm"
          variant="outline"
        >
          Extend to 30 days
        </Button>
      </div>
    </div>
  );
};
