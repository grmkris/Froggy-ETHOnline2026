/** The plumbing, named: the signer, the agent's standing, the session, WebMCP. */

import type { WalletSummary } from "@froggy/protocol";
import type { ReactElement } from "react";

import { shortAddress } from "../../lib/format";
import { useSessionIds } from "../../lib/session-ids";
import type { WebMcpStatus } from "../../lib/webmcp";
import { AgentRules } from "./agent-rules";
import { AgentSignerConsent } from "./agent-signer-consent";

const SIGNER_WORDS: ReadonlyMap<WalletSummary["agentSigner"], string> = new Map(
  [
    ["absent", "the agent has no signer"],
    ["granted", "the agent may sign under your rules"],
    ["pending", "asking Privy for the agent's signer…"],
    ["shared", "the agent signs under shared rules, not yours"],
  ]
);

/** How long a grant has left, in the coarsest unit that is still honest. */
const remaining = (expiresAt: number): string => {
  const days = Math.floor((expiresAt - Date.now()) / 86_400_000);
  if (days < 0) {
    return "expired";
  }
  return days === 0 ? "expires today" : `expires in ${days} days`;
};

/** The second layer, named: the policy Privy holds the agent's signer to. */
const SignerPolicy = ({
  wallet,
}: {
  readonly wallet: WalletSummary | null;
}): ReactElement | null => {
  const { policyId } = useSessionIds();
  // The person's own policy when they have one, and the app-wide one otherwise.
  const shown = wallet?.agentPolicyId ?? policyId;
  const expiresAt = wallet?.agentAllowance?.expiresAt ?? null;
  if (shown === null) {
    return null;
  }
  return (
    <p className="text-muted-foreground text-xs">
      Beneath the allowlists the signer is held to Privy policy{" "}
      <span className="text-machine text-foreground/80">{shown}</span>
      {expiresAt === null ? "" : `, which ${remaining(expiresAt)}`}: a spend the
      mandate allows can still be refused there, and Privy says why.
    </p>
  );
};

export const ConnectionDetails = ({
  sessionId,
  wallet,
  webMcp,
}: {
  readonly sessionId: string | null;
  readonly wallet: WalletSummary | null;
  readonly webMcp: WebMcpStatus;
}): ReactElement => (
  <div className="flex flex-col gap-4 text-sm">
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2.5 wrap-anywhere">
      <dt className="text-muted-foreground">Signer</dt>
      <dd className="text-machine">
        {shortAddress(wallet?.signerAddress ?? null)}
      </dd>
      <dt className="text-muted-foreground">Agent</dt>
      <dd>
        {wallet === null ? "—" : (SIGNER_WORDS.get(wallet.agentSigner) ?? "—")}
      </dd>
      <dt className="text-muted-foreground">Session</dt>
      <dd className="text-machine">{sessionId ?? "—"}</dd>
      <dt className="text-muted-foreground">WebMCP</dt>
      <dd>
        {webMcp.kind === "registered"
          ? `${webMcp.tools} tools offered to this browser's agent`
          : "unavailable in this browser (needs Web Model Context)"}
      </dd>
    </dl>
    {wallet?.agentNote === null || wallet?.agentNote === undefined ? null : (
      <p className="text-muted-foreground text-xs">{wallet.agentNote}</p>
    )}
    <AgentSignerConsent wallet={wallet} />
    <AgentRules wallet={wallet} />
    <SignerPolicy wallet={wallet} />
  </div>
);
