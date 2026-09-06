/**
 * The mandate in plain words.
 *
 * The rules are data so a refusal can name one; a person meeting the product
 * for the first time needs them as a sentence. "$2.00 a payment · $10.00 a
 * day · your call above $1.00" is the whole leash in one line, and the lists
 * beneath it are who may be paid, where, and on what.
 */

import { formatUsd } from "@froggy/domain";
import type { Mandate } from "@froggy/domain";

import { shortAddress } from "./format";

const NETWORK_WORDS: ReadonlyMap<string, string> = new Map([
  ["eip155:1", "Ethereum"],
  ["eip155:8453", "Base"],
  ["eip155:84532", "Base Sepolia"],
  ["hedera:mainnet", "Hedera"],
  ["hedera:testnet", "Hedera testnet"],
]);

/** A chain by the name a person uses, or its id when we have no name. */
export const networkWords = (network: string): string =>
  NETWORK_WORDS.get(network) ?? network;

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** "a day", "an hour", "6h", "15 min". */
export const windowWords = (windowMs: number): string => {
  if (windowMs === DAY_MS) {
    return "a day";
  }
  if (windowMs === HOUR_MS) {
    return "an hour";
  }
  if (windowMs % HOUR_MS === 0) {
    return `${windowMs / HOUR_MS}h`;
  }
  return `${Math.round(windowMs / 60_000)} min`;
};

/** The caps, or null when the mandate has none to speak of. */
export const capsLine = (mandate: Mandate): string | null => {
  const parts: string[] = [];
  let widest: { maxUsdMicros: number; windowMs: number } | null = null;
  let threshold: number | null = null;
  for (const rule of mandate.rules) {
    if (rule._tag === "per_tx_cap") {
      parts.push(`${formatUsd(rule.maxUsdMicros)} a payment`);
    } else if (
      rule._tag === "window_cap" &&
      (widest === null || rule.windowMs > widest.windowMs)
    ) {
      widest = { maxUsdMicros: rule.maxUsdMicros, windowMs: rule.windowMs };
    } else if (rule._tag === "approval_threshold") {
      threshold = rule.overUsdMicros;
    }
  }
  if (widest !== null) {
    parts.push(
      `${formatUsd(widest.maxUsdMicros)} ${windowWords(widest.windowMs)}`
    );
  }
  if (threshold !== null) {
    parts.push(`your call above ${formatUsd(threshold)}`);
  }
  return parts.length === 0 ? null : parts.join(" · ");
};

export interface MandateLists {
  readonly hosts: readonly string[];
  readonly networks: readonly string[];
  readonly payees: readonly string[];
}

/** Who may be paid, where, and on what. */
export const mandateLists = (mandate: Mandate): MandateLists => ({
  hosts: mandate.rules.flatMap((rule) =>
    rule._tag === "host_allowlist" ? rule.hosts : []
  ),
  networks: mandate.rules.flatMap((rule) =>
    rule._tag === "network_allowlist" ? rule.networks.map(networkWords) : []
  ),
  payees: mandate.rules.flatMap((rule) =>
    rule._tag === "payee_allowlist"
      ? rule.payeeIds.map((id) => shortAddress(id))
      : []
  ),
});
