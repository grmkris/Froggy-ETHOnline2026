/**
 * An ERC-20 transfer signed by Privy under the policy, then broadcast by us.
 *
 * `eth_signTransaction`, never `eth_sendTransaction`: Privy's rolling
 * aggregations — the 24-hour cap the top-up rule leans on — are only kept for
 * signing methods, so the host has to broadcast the signed bytes itself. That
 * split is also what keeps the demo honest: a refusal is Privy's, in Privy's
 * words, before any bytes exist; a broadcast failure is the chain's, after.
 *
 * The gas limit is fixed rather than estimated. An estimate needs the wallet
 * to hold the tokens and the gas, so estimating first would make Privy's
 * decision depend on the wallet's balance — and the beat this exists for is
 * Privy saying no to a transfer regardless of whether it could have gone
 * through. An ERC-20 transfer costs about sixty thousand gas; ninety leaves
 * room for a token with a fee hook.
 */

import { keccak_256 } from "@noble/hashes/sha3";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";

import { encodeTransfer } from "./erc20";
import type { EvmRpc } from "./evm-rpc";
import type { AgentEvmSigner } from "./evm-signer";

export interface Erc20TransferInput {
  /** Persist the hash before any signed bytes leave the process. */
  readonly beforeBroadcast?: ((hash: string) => Promise<void>) | undefined;
  /** In the token's smallest unit. */
  readonly amount: bigint;
  readonly chainId: number;
  readonly rpc: EvmRpc;
  readonly signer: AgentEvmSigner;
  readonly to: string;
  /** The token contract. */
  readonly token: string;
}

export interface Erc20TransferOutcome {
  readonly hash: string;
  readonly status: "reverted" | "success";
}

const TRANSFER_GAS_LIMIT = 90_000n;
/** A floor for the tip, in wei; some public nodes answer zero. */
const MIN_PRIORITY_FEE = 1_000_000n;

export const sendErc20Transfer = async (
  input: Erc20TransferInput
): Promise<Erc20TransferOutcome> => {
  const { rpc, signer } = input;
  const data = encodeTransfer(input.to, input.amount);
  const [nonce, gasPrice, tip] = await Promise.all([
    rpc.transactionCount(signer.address),
    rpc.gasPrice(),
    // Not every node implements it; the floor stands in when one does not.
    rpc.maxPriorityFeePerGas().catch(() => MIN_PRIORITY_FEE),
  ]);
  const maxPriorityFeePerGas = tip > MIN_PRIORITY_FEE ? tip : MIN_PRIORITY_FEE;
  const signed = await signer.signTransaction({
    chainId: input.chainId,
    data,
    gasLimit: TRANSFER_GAS_LIMIT,
    // Twice the current base price plus the tip: survives a doubling between
    // the read and the inclusion, and the unused part is refunded anyway.
    maxFeePerGas: gasPrice * 2n + maxPriorityFeePerGas,
    maxPriorityFeePerGas,
    nonce,
    to: input.token,
    value: 0n,
  });
  const expectedHash = `0x${bytesToHex(keccak_256(hexToBytes(signed.slice(2))))}`;
  await input.beforeBroadcast?.(expectedHash);
  const hash = await rpc.sendRawTransaction(signed);
  const receipt = await rpc.waitForReceipt(hash);
  return { hash, status: receipt.status };
};
