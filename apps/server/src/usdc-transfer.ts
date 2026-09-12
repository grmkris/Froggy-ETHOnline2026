/**
 * A USDC transfer from the person's wallet, as a settlement.
 *
 * Shared by the send tool and the just-in-time conversion: both move USDC
 * from the wallet the agent is a signer on, both are signed by Privy under
 * the committed policy and broadcast here, and both report Privy's refusal
 * in its own words rather than as a thrown error, because a refusal is a
 * fact for the receipt and not a transport failure to retry.
 *
 * Which signing shape moves it is the caller's: the send tool signs a plain
 * `transfer` from the wallet (`evmTransfersFor`), the conversion an
 * authorization the treasury settles (`evmRelayFor`, with the plain transfer
 * as the fallback where no treasury wallet exists).
 */

import { EvmRpcError, PrivySignerRefusedError } from "@froggy/wallet";

import type { Services } from "./services";
import type { Settled } from "./session";

export const sendUsdc = async (
  services: Services,
  wallet: { readonly address: string; readonly id: string } | null,
  to: string,
  units: string,
  beforeBroadcast?: (hash: string) => Promise<void>,
  transfers: ReturnType<Services["evmTransfersFor"]> = services.evmTransfersFor(
    wallet
  )
): Promise<Settled> => {
  const network = services.environment.evmNetwork;
  if (transfers === null) {
    return {
      error: "the agent has no signer on this wallet yet",
      network,
      ok: false,
      stubbed: false,
      transactionId: null,
    };
  }
  let submittedHash: string | null = null;
  try {
    const outcome = await transfers.send({
      to,
      units: BigInt(units),
      beforeBroadcast: async (hash) => {
        await beforeBroadcast?.(hash);
        submittedHash = hash;
      },
    });
    const settled: Settled = {
      sent: true,
      confirmation: outcome.status === "success" ? "success" : "failed",
      network,
      ok: outcome.status === "success",
      stubbed: false,
      transactionId: outcome.hash,
    };
    return outcome.status === "success"
      ? settled
      : { ...settled, error: "the transfer reverted on chain" };
  } catch (error) {
    if (error instanceof EvmRpcError && error.refused) {
      // The node answered the broadcast with an error: it rejected the bytes
      // and nothing entered the mempool. That is a failed send, not an
      // unknown one, and the hash written before the broadcast names a
      // transaction that will never exist — so it is not reported as sent.
      return {
        confirmation: "failed",
        error: error.message,
        network,
        ok: false,
        sent: false,
        stubbed: false,
        transactionId: null,
      };
    }
    if (
      error instanceof PrivySignerRefusedError ||
      error instanceof EvmRpcError
    ) {
      return {
        error: error.message,
        sent: submittedHash !== null,
        network,
        ok: false,
        stubbed: false,
        transactionId: submittedHash,
      };
    }
    throw error;
  }
};
