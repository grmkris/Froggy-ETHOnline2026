/**
 * A name for this service that anyone can derive and nobody issues.
 *
 * HCS-14 gives an agent a universal identifier computed from what it publicly
 * is, rather than assigned by a registry it had to ask. The point for us is
 * that the identifier in our discovery document can be recomputed by a reader
 * from the same public facts and checked, which is the same standard the
 * settlement receipts are held to.
 *
 * The specification is a draft (https://hol.org/docs/standards/hcs-14/) and
 * the identifier is published as a claim about how it was computed — the
 * inputs are in the document beside it — and not as something a reader must
 * accept. The point of the claim is that it can be checked, so on 10 Sep 2026
 * it was checked, against `hashgraph-online/standards-sdk`.
 *
 * Two places where the prose and the reference implementation disagree, and
 * this file follows the implementation, because that is what a reader who
 * wants to disagree with us will actually run:
 *
 *   - the prose says the canonical JSON has its keys in alphabetical order;
 *     the SDK writes `skills` first, then name, nativeId, protocol, registry,
 *     version. Different bytes, different digest, different identifier.
 *   - `uid` is `"0"` when there is no registry-assigned id, not the agent's
 *     own name.
 *
 * Deterministic all the way down: no clock, no chain write, no registration.
 */

import { createHash } from "node:crypto";

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/** Bitcoin-alphabet base58, as the specification's pseudocode uses. */
export const base58 = (bytes: Uint8Array): string => {
  const digits: number[] = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let index = 0; index < digits.length; index += 1) {
      carry += (digits[index] ?? 0) * 256;
      digits[index] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  // A number's own leading zeros are not digits: base58 writes zero as
  // nothing at all, and the leading `1`s below come from the zero *bytes*.
  while (digits.length > 0 && digits.at(-1) === 0) {
    digits.pop();
  }
  let leading = "";
  for (const byte of bytes) {
    if (byte !== 0) {
      break;
    }
    leading += BASE58[0];
  }
  return (
    leading +
    digits
      .toReversed()
      .map((digit) => BASE58[digit] ?? "")
      .join("")
  );
};

/** The six fields the identifier is computed from, and nothing else. */
export interface AgentFacts {
  readonly name: string;
  readonly nativeId: string;
  readonly protocol: string;
  readonly registry: string;
  readonly skills: readonly number[];
  readonly version: string;
}

/**
 * Canonical JSON: the six fields in the order the reference implementation
 * writes them — `skills` first — registry and protocol lowercased, every
 * string trimmed, the skills sorted numerically. `JSON.stringify` preserves
 * insertion order, so this order is the bytes. Two parties who agree on the
 * facts must produce the same ones.
 */
export const canonicalise = (facts: AgentFacts): string =>
  JSON.stringify({
    skills: facts.skills.toSorted((left, right) => left - right),
    name: facts.name.trim(),
    nativeId: facts.nativeId.trim(),
    protocol: facts.protocol.trim().toLowerCase(),
    registry: facts.registry.trim().toLowerCase(),
    version: facts.version.trim(),
  });

/** The deterministic form: `uaid:aid:<id>;uid=0;registry=…;proto=…;nativeId=…` */
export const universalAgentId = (facts: AgentFacts): string => {
  const digest = createHash("sha384")
    .update(canonicalise(facts), "utf-8")
    .digest();
  const id = base58(new Uint8Array(digest));
  const parameters = [
    // Nobody assigned us one, and the standard's answer for that is "0", not
    // a name of our own choosing.
    "uid=0",
    `registry=${facts.registry.trim().toLowerCase()}`,
    `proto=${facts.protocol.trim().toLowerCase()}`,
    `nativeId=${facts.nativeId.trim()}`,
  ].join(";");
  return `uaid:aid:${id};${parameters}`;
};

/**
 * CAIP-10 for a Hedera account: `hedera:mainnet:0.0.x`.
 *
 * The network is already CAIP-2, so this is the account appended rather than
 * anything reassembled.
 */
export const caip10 = (network: string, accountId: string): string =>
  `${network}:${accountId}`;
