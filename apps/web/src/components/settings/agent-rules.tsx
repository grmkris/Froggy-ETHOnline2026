/**
 * The person's rules, on the Settings card: what they are, and changing them.
 *
 * Shown only once they have a policy of their own. Somebody still on the shared
 * policy is offered the move instead, by `AgentSignerConsent` above this — two
 * calls to action on one card would be one too many, and the move has to happen
 * first anyway.
 */

import type { WalletSummary } from "@froggy/protocol";
import { Button } from "@froggy/ui/components/button";
import { useState } from "react";
import type { ReactElement } from "react";

import { useWorkspace } from "../../lib/workspace-context";
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
  const { app } = useWorkspace();
  const [editing, setEditing] = useState(false);
  const allowance = wallet?.agentAllowance ?? null;
  if (wallet?.agentPolicyId === null || allowance === null) {
    return null;
  }
  if (editing) {
    return (
      <div className="flex flex-col gap-3">
        <AllowanceForm
          allowance={allowance}
          onSave={(next) => {
            app.send({ allowance: next, type: "allowance.update", v: 1 });
            setEditing(false);
          }}
        />
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
      <div className="flex flex-wrap gap-2">
        <Button
          className="min-h-11"
          onClick={() => {
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
            app.send({
              allowance: {
                ...allowance,
                expiresAt: Date.now() + 30 * 86_400_000,
              },
              type: "allowance.update",
              v: 1,
            });
          }}
          size="sm"
          variant="outline"
        >
          Extend by 30 days
        </Button>
      </div>
    </div>
  );
};
