/**
 * The wallet pane: the leash, made visible.
 *
 * Everything here answers a question someone nervous about an autonomous agent
 * actually asks — what can it spend, what has it spent, why was it allowed, and
 * how do I stop it. The freeze button is a client message rather than anything
 * the agent can reach, which is the whole reason it can be trusted.
 *
 * Stub chips are not decoration. A build whose Graph data came from a fixture
 * must not be able to look like one that queried a live provider, so the mode
 * is on screen and on every receipt it touched.
 */

import { formatUsd } from "@froggy/domain";
import type { Mandate, PolicyDecision, Receipt } from "@froggy/domain";
import type { ServiceModes, WalletSummary } from "@froggy/protocol";
import { Badge } from "@froggy/ui/components/badge";
import { Button } from "@froggy/ui/components/button";
import { Separator } from "@froggy/ui/components/separator";

interface WalletPaneProps {
  readonly lastDecision: PolicyDecision | null;
  readonly mandate: Mandate | null;
  readonly modes: ServiceModes | null;
  readonly onFreeze: (frozen: boolean) => void;
  readonly receipts: readonly Receipt[];
  readonly wallet: WalletSummary | null;
}

const ruleLabel = (rule: Mandate["rules"][number]): string => {
  switch (rule._tag) {
    case "per_tx_cap": {
      return `${formatUsd(rule.maxUsdMicros)} per transaction`;
    }
    case "window_cap": {
      return `${formatUsd(rule.maxUsdMicros)} per ${Math.round(rule.windowMs / 3_600_000)}h`;
    }
    case "payee_allowlist": {
      return `${rule.payeeIds.length} allowed payee${rule.payeeIds.length === 1 ? "" : "s"}`;
    }
    case "host_allowlist": {
      return `paid hosts: ${rule.hosts.join(", ") || "none"}`;
    }
    case "network_allowlist": {
      return `chains: ${rule.networks.join(", ")}`;
    }
    case "expiry": {
      return `expires ${new Date(rule.notAfter).toLocaleTimeString()}`;
    }
    case "approval_threshold": {
      return `ask above ${formatUsd(rule.overUsdMicros)}`;
    }
    case "ask_exemption": {
      return `pre-approved: ${rule.payeeId} up to ${formatUsd(rule.maxUsdMicros)}`;
    }
    default: {
      return "unknown rule";
    }
  }
};

const short = (address: string | null): string =>
  address === null ? "—" : `${address.slice(0, 6)}…${address.slice(-4)}`;

/**
 * Whether Privy is holding a signature for the agent.
 *
 * On screen because it is the difference between "the agent can spend from
 * this wallet" and "it cannot", and no other part of the UI distinguishes
 * those. A wallet address with no signer looks identical to one with a signer
 * right up until a payment silently fails.
 */
const signerLabel = (wallet: WalletSummary): string => {
  switch (wallet.agentSigner) {
    case "granted": {
      return "agent signer: granted";
    }
    case "pending": {
      return "agent signer: asking…";
    }
    case "absent": {
      return "agent signer: none";
    }
    default: {
      return "agent signer: unknown";
    }
  }
};

/**
 * Its own component so the pane stays under its complexity budget, and so the
 * "can the agent actually sign?" question has one place to live.
 */
const SignerState = ({
  wallet,
}: {
  readonly wallet: WalletSummary | null;
}): React.ReactElement | null => {
  if (wallet === null) {
    return null;
  }
  return (
    <div className="space-y-1">
      <p
        className={`text-xs ${
          wallet.agentSigner === "granted"
            ? "text-emerald-300/80"
            : "text-amber-300/80"
        }`}
      >
        {signerLabel(wallet)}
      </p>
      {wallet.agentNote === null ? null : (
        // Verbatim, including Privy's own wording. A paraphrase of someone
        // else's refusal is a second thing that can be wrong.
        <p className="text-[11px] text-white/50">{wallet.agentNote}</p>
      )}
    </div>
  );
};

/**
 * Shown when the spend history could not be read.
 *
 * A wallet reporting "$0 spent" because the database is unreachable looks
 * exactly like one with a full allowance left, so the difference is stated
 * rather than left to be inferred from a number that is quietly a floor.
 */
const LedgerNote = ({
  wallet,
}: {
  readonly wallet: WalletSummary | null;
}): React.ReactElement | null => {
  if (wallet === null || wallet.ledgerNote === null) {
    return null;
  }
  return (
    <p className="rounded-md bg-red-500/10 p-2 text-[11px] text-red-200 ring-1 ring-red-500/30">
      {wallet.ledgerNote}
    </p>
  );
};

export const WalletPane = ({
  lastDecision,
  mandate,
  modes,
  onFreeze,
  receipts,
  wallet,
}: WalletPaneProps): React.ReactElement => {
  const stubs =
    modes === null
      ? []
      : Object.entries(modes)
          .filter(([, mode]) => mode === "stub")
          .map(([name]) => name);

  return (
    <aside className="flex w-full min-w-0 flex-col gap-4 overflow-y-auto rounded-lg bg-white/[0.02] p-4 ring-1 ring-white/10 lg:w-80">
      <header className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium">Wallet</h2>
          <Button
            onClick={() => {
              onFreeze(!(mandate?.frozen ?? false));
            }}
            size="sm"
            variant={mandate?.frozen === true ? "default" : "outline"}
          >
            {mandate?.frozen === true ? "Frozen — unfreeze" : "Freeze"}
          </Button>
        </div>
        <p className="font-mono text-xs text-white/70">
          {short(wallet?.address ?? null)}
        </p>
        <SignerState wallet={wallet} />
        {stubs.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {stubs.map((name) => (
              <Badge
                className="border-amber-500/50 text-[10px] text-amber-300 uppercase"
                key={name}
                variant="outline"
              >
                {name} stub
              </Badge>
            ))}
          </div>
        ) : null}
      </header>

      <Separator />

      <section className="space-y-2">
        <h3 className="text-xs tracking-wide text-white/50 uppercase">
          Mandate
        </h3>
        <p className="text-sm">
          {wallet === null
            ? "—"
            : `${formatUsd(wallet.windowSpentUsdMicros)} spent in the window`}
        </p>
        <LedgerNote wallet={wallet} />
        <ul className="space-y-1 text-xs text-white/70">
          {(mandate?.rules ?? []).map((rule) => (
            <li key={rule.id}>· {ruleLabel(rule)}</li>
          ))}
        </ul>
      </section>

      {lastDecision !== null && lastDecision._tag !== "allow" ? (
        <section
          className={`rounded-md p-3 text-xs ring-1 ${
            lastDecision._tag === "deny"
              ? "bg-red-500/10 text-red-200 ring-red-500/30"
              : "bg-amber-500/10 text-amber-200 ring-amber-500/30"
          }`}
        >
          <p className="font-medium">
            {lastDecision._tag === "deny"
              ? "Refused by policy"
              : "Waiting on you"}
          </p>
          <p className="mt-1">
            {lastDecision._tag === "deny"
              ? lastDecision.message
              : lastDecision.question}
          </p>
          {lastDecision._tag === "deny" && lastDecision.ruleId !== undefined ? (
            <p className="mt-1 font-mono text-[10px] opacity-70">
              {lastDecision.code} · {lastDecision.ruleId}
            </p>
          ) : null}
        </section>
      ) : null}

      <Separator />

      <section className="space-y-2">
        <h3 className="text-xs tracking-wide text-white/50 uppercase">
          Receipts
        </h3>
        {receipts.length === 0 ? (
          <p className="text-xs text-white/40">Nothing spent or refused yet.</p>
        ) : (
          <ul className="space-y-2">
            {receipts.map((receipt) => (
              <li
                className="space-y-1 rounded-md bg-black/30 p-2 text-xs ring-1 ring-white/5"
                key={receipt.id}
              >
                <div className="flex items-center justify-between gap-2">
                  <span>{formatUsd(receipt.intent.usdMicros)}</span>
                  <Badge
                    className="text-[10px]"
                    variant={
                      receipt.decision._tag === "allow"
                        ? "outline"
                        : "destructive"
                    }
                  >
                    {receipt.decision._tag}
                  </Badge>
                </div>
                <p className="text-white/60">{receipt.intent.purpose}</p>
                {receipt.evidence === undefined ? null : (
                  <p className="font-mono text-[10px] text-white/40">
                    evidence {receipt.evidence.snapshotHash.slice(0, 12)}…
                  </p>
                )}
                {receipt.settlement === undefined ? null : (
                  <p className="font-mono text-[10px] text-white/40">
                    {receipt.settlement.transactionId}
                  </p>
                )}
                {receipt.stubbed ? (
                  <Badge
                    className="border-amber-500/50 text-[10px] text-amber-300"
                    variant="outline"
                  >
                    stubbed
                  </Badge>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  );
};
