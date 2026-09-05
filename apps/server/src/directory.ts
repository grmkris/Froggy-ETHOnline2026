/**
 * The directory: how a stranger's 402 becomes payable.
 *
 * Paste a URL; it is probed, never paid. If the challenge is one this wallet
 * can honour, the person adds it, and only then do its host and payee go onto
 * the mandate's allowlists. The agent's `x402_fetch` still asks the allowlist
 * before sending anything, so an entry here is the one and only way a payment
 * leaves for a host the server did not put there itself.
 */

import { DirectoryId, publicHttpUrl } from "@froggy/domain";
import type { DirectoryEntry, UserId } from "@froggy/domain";
import { probe402 } from "@froggy/payments";
import type { ProbeSummary } from "@froggy/payments";

import { OutboundRefusedError, safeFetch } from "./outbound";
import type { Services } from "./services";
import type { Workspaces } from "./workspaces";

export interface DirectoryDeps {
  readonly services: Services;
  readonly workspaces: Workspaces;
}

/**
 * The networks this deployment can pay on. Hedera through the pocket; the
 * EVM legs only when Privy is live with an agent key, since the signature
 * comes from there.
 */
const payableNetworks = (deps: DirectoryDeps): readonly string[] => {
  const { environment } = deps.services;
  return environment.modes.privy === "live" && environment.privyAgent !== null
    ? ["hedera:testnet", "eip155:8453", "eip155:84532"]
    : ["hedera:testnet"];
};

/** A probe is a read: a GET with the same private-network rules as any other. */
export const probeUrl = async (
  deps: DirectoryDeps,
  url: string
): Promise<ProbeSummary> => {
  const outbound = {
    allowPrivate: !deps.services.environment.blockPrivateNetwork,
  };
  const check = publicHttpUrl(url, outbound);
  if (!check.ok) {
    return { host: url, kind: "unreachable", reason: check.reason, url };
  }
  return await probe402(
    check.url.toString(),
    async (target) => {
      try {
        return await safeFetch(target, {}, outbound);
      } catch (error) {
        throw error instanceof OutboundRefusedError
          ? error
          : new Error(
              error instanceof Error ? error.message : "request failed"
            );
      }
    },
    { payable: payableNetworks(deps) }
  );
};

export type AddOutcome =
  | { readonly added: DirectoryEntry; readonly kind: "added" }
  | { readonly kind: "unsupported"; readonly summary: ProbeSummary };

/** Probe again at the moment of adding: a seller can change its price. */
export const addToDirectory = async (
  deps: DirectoryDeps,
  userId: UserId,
  url: string
): Promise<AddOutcome> => {
  const summary = await probeUrl(deps, url);
  const option =
    summary.kind === "paid"
      ? summary.options.find((candidate) => candidate.supported)
      : undefined;
  if (summary.kind !== "paid" || option === undefined) {
    return { kind: "unsupported", summary };
  }
  const entry: DirectoryEntry = {
    addedAt: Date.now(),
    amount: option.amount,
    asset: option.asset,
    host: summary.host,
    id: DirectoryId.generate(),
    label: summary.host,
    network: option.network,
    payTo: option.payTo,
    url: summary.url,
  };
  await deps.services.store.directory.add(userId, entry);
  const workspace = await deps.workspaces.hydrate(userId);
  workspace.session.allow({ host: entry.host, payeeId: entry.payTo });
  return { added: entry, kind: "added" };
};

/**
 * Remove an entry, and its host and payee from the allowlists — unless another
 * entry still needs them.
 */
export const removeFromDirectory = async (
  deps: DirectoryDeps,
  userId: UserId,
  id: string
): Promise<boolean> => {
  const { store } = deps.services;
  const entries = await store.directory.list(userId);
  const gone = entries.find((entry) => entry.id === id);
  if (gone === undefined) {
    return false;
  }
  await store.directory.remove(userId, id);
  const remaining = entries.filter((entry) => entry.id !== id);
  const workspace = await deps.workspaces.hydrate(userId);
  const hostStillUsed = remaining.some((entry) => entry.host === gone.host);
  const payeeStillUsed = remaining.some((entry) => entry.payTo === gone.payTo);
  workspace.session.disallow({
    host: hostStillUsed ? "" : gone.host,
    payeeId: payeeStillUsed ? "" : gone.payTo,
  });
  return true;
};

/** What the agent is told when it asks. Sentences, because it reads them. */
export const describeProbe = (summary: ProbeSummary): string => {
  switch (summary.kind) {
    case "free": {
      return `${summary.url} answered ${summary.status}, not 402: it is not asking to be paid.`;
    }
    case "unreachable": {
      return `${summary.url} could not be probed: ${summary.reason}.`;
    }
    case "paid": {
      const lines = summary.options.map(
        (option) =>
          `- ${option.amount} of ${option.asset} on ${option.network} to ${option.payTo} (${option.scheme}): ${option.supported ? "payable from this wallet" : `not payable — ${option.reason ?? "unsupported"}`}`
      );
      return [
        `${summary.url} asks to be paid. ${summary.supported ? "This wallet could pay it, once the person adds it to the directory in Details → Directory." : "This wallet cannot pay any of its options."}`,
        ...lines,
      ].join("\n");
    }
    default: {
      return "Nothing known.";
    }
  }
};
