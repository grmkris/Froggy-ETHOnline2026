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
 * this implementation has not been checked against a reference one, so the
 * identifier is published as a claim about how it was computed — the inputs
 * are in the document beside it — and not as something a reader must accept.
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
 * Canonical JSON: the six fields in alphabetical order, registry and protocol
 * lowercased, every string trimmed, the skills sorted numerically. Two parties
 * who agree on the facts must produce the same bytes.
 */
export const canonicalise = (facts: AgentFacts): string =>
  JSON.stringify({
    name: facts.name.trim(),
    nativeId: facts.nativeId.trim(),
    protocol: facts.protocol.trim().toLowerCase(),
    registry: facts.registry.trim().toLowerCase(),
    skills: facts.skills.toSorted((left, right) => left - right),
    version: facts.version.trim(),
  });

/** The deterministic form: `uaid:aid:<id>;uid=…;registry=…;proto=…;nativeId=…` */
export const universalAgentId = (facts: AgentFacts): string => {
  const digest = createHash("sha384")
    .update(canonicalise(facts), "utf-8")
    .digest();
  const id = base58(new Uint8Array(digest));
  const parameters = [
    `uid=${facts.name.trim()}`,
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
