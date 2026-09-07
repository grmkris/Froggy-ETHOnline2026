/**
 * The one tap that lets the agent sign: Privy asks the person directly, in
 * its own prompt, and the server reads the answer off the wallet. Shown only
 * while the agent has no signer and everything needed to ask is known.
 */

import type { WalletSummary } from "@froggy/protocol";
import { Button } from "@froggy/ui/components/button";
import { useState } from "react";
import type { ReactElement } from "react";

import { useIdentity } from "../../lib/privy";
import { useSessionIds } from "../../lib/session-ids";
import { useSessionToken } from "../../lib/session-token";

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
  const grant = identity.grantAgentSigner;
  const address = wallet?.address ?? null;
  if (
    wallet?.agentSigner !== "absent" ||
    address === null ||
    grant === null ||
    agentSignerId === null ||
    policyId === null
  ) {
    return null;
  }
  const consent = async (): Promise<void> => {
    setBusy(true);
    const result = await grant({ address, policyId, signerId: agentSignerId });
    if (result.kind === "refused") {
      setOutcome(`Privy refused: ${result.reason}`);
      setBusy(false);
      return;
    }
    const token = await getToken();
    await fetch("/api/agent-signer/refresh", {
      headers: token === null ? {} : { authorization: `Bearer ${token}` },
      method: "POST",
    }).catch(() => null);
    setOutcome("Granted. The wallet updates in a moment.");
    setBusy(false);
  };
  return (
    <div className="flex flex-col gap-2">
      <Button
        className="min-h-11 self-start"
        disabled={busy}
        onClick={() => {
          void consent();
        }}
        size="sm"
      >
        {busy ? "Asking Privy…" : "Let the agent sign under policy"}
      </Button>
      {outcome === null ? null : (
        <output className="text-muted-foreground text-xs">{outcome}</output>
      )}
    </div>
  );
};
