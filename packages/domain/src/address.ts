/**
 * Payee identifiers, and where they came from.
 *
 * The second half is the point. A 20-byte hex string is easy to validate and
 * tells you nothing about whether it should be paid: prompt injection's whole
 * trick is putting a well-formed address somewhere the model will read it.
 * `Provenance` travels with every payee so the policy engine can refuse an
 * address that only ever appeared inside a web page or a query result.
 */

import { Schema } from "effect";

export const EvmAddress = Schema.String.pipe(
  Schema.check(
    Schema.isPattern(/^0x[0-9a-fA-F]{40}$/u, {
      message: "Expected a 20-byte hexadecimal Ethereum address",
    })
  ),
  Schema.brand("EvmAddress")
);
export type EvmAddress = typeof EvmAddress.Type;

/** A Hedera entity id, `shard.realm.num` — accounts and HTS tokens share the shape. */
export const HederaEntityId = Schema.String.pipe(
  Schema.check(
    Schema.isPattern(/^\d+\.\d+\.\d+$/u, {
      message: "Expected a Hedera entity id such as 0.0.1234",
    })
  ),
  Schema.brand("HederaEntityId")
);
export type HederaEntityId = typeof HederaEntityId.Type;

/**
 * How a payee entered the system.
 *
 * - `mandate` — the human wrote it into the allowlist. Trusted.
 * - `server` — we minted it this session (our own oracle's `payTo`). Trusted.
 * - `model` — the model produced it. A model that has read a hostile page is
 *   not distinguishable from a model that has been instructed by one.
 * - `page` — it appeared in page content or a query result. Never payable.
 *
 * Only `mandate` and `server` can be paid. This is enforced in the policy
 * engine, not in the prompt, because a prompt rule is advice and this is a rule.
 */
export const Provenance = Schema.Literals([
  "mandate",
  "server",
  "model",
  "page",
]);
export type Provenance = typeof Provenance.Type;

export const TRUSTED_PROVENANCE: readonly Provenance[] = ["mandate", "server"];

export const isPayable = (provenance: Provenance): boolean =>
  TRUSTED_PROVENANCE.includes(provenance);

/** A destination for money, with the story of how we learned about it. */
export const Payee = Schema.Struct({
  /** Chain-native identifier: an EVM address or a Hedera entity id. */
  id: Schema.String,
  label: Schema.String,
  provenance: Provenance,
});
export type Payee = typeof Payee.Type;

/**
 * Normalise an identifier for comparison against an allowlist.
 *
 * EVM addresses are case-insensitive (EIP-55 checksums are a display concern),
 * and an allowlist that misses because the model echoed a checksummed address
 * back in lowercase would be a rule that fails open in appearance and closed in
 * practice — confusing in exactly the wrong direction.
 */
export const normalizePayeeId = (id: string): string => id.trim().toLowerCase();
