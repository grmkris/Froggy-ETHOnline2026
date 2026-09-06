/**
 * People's Hedera keys, held by Privy.
 *
 * A cosmos-type Privy wallet is a secp256k1 key, the curve of a Hedera ECDSA
 * account, and `raw_sign` will sign bytes for it under the agent's
 * authorization key and a policy; Ethereum-type wallets refuse that
 * endpoint (spike 1.8). So each person gets one, owned by them in Privy's
 * books, and Froggy signs Hedera transactions through it without ever
 * holding the key. The policy cannot see inside raw bytes, so it is `ALLOW
 * *`; the caps on this leg stay Froggy's, as they always were.
 */

import { keccak_256 } from "@noble/hashes/sha3";
import type { PrivyClient } from "@privy-io/node";

import type { AgentKey } from "./agent-signer";

export interface HederaKey {
  /** Compressed secp256k1 public key, hex, as Privy states it. */
  readonly publicKey: string;
  readonly walletId: string;
}

export interface HederaKeys {
  /** A new key for this person, created in their name under the policy. */
  readonly create: (ownerDid: string) => Promise<HederaKey>;
  /**
   * Signs `bytes` with the key: hashed here with keccak256, the way a Hedera
   * ECDSA account is verified, and signed by Privy as a 32-byte hash (its
   * `bytes` form refuses cosmos wallets). The answer is the 64-byte compact
   * signature.
   */
  readonly signBytes: (
    walletId: string,
    bytes: Uint8Array
  ) => Promise<Uint8Array>;
}

const hex = (bytes: Uint8Array): string => Buffer.from(bytes).toString("hex");

export const privyHederaKeys = (
  client: PrivyClient,
  options: { readonly agent: AgentKey; readonly policyId: string }
): HederaKeys => {
  const authorization_context = {
    authorization_private_keys: [options.agent.privateKey],
  };
  return {
    create: async (ownerDid) => {
      const wallet = await client.wallets().create({
        additional_signers: [{ signer_id: options.agent.quorumId }],
        chain_type: "cosmos",
        owner: { user_id: ownerDid },
        policy_ids: [options.policyId],
      });
      if (wallet.public_key === undefined || wallet.public_key === null) {
        throw new Error(
          "Privy created the wallet without stating its public key."
        );
      }
      return { publicKey: wallet.public_key, walletId: wallet.id };
    },
    signBytes: async (walletId, bytes) => {
      const response = await client.wallets().rawSign(walletId, {
        authorization_context,
        params: { hash: `0x${hex(keccak_256(bytes))}` },
      });
      const signature = Uint8Array.from(
        Buffer.from(response.signature.replace(/^0x/u, ""), "hex")
      );
      // 64 bytes of r and s; a recovery byte, when Privy adds one, is not a Hedera signature.
      return signature.slice(0, 64);
    },
  };
};
