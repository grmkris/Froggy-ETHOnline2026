/**
 * A plain USDC transfer from the person's wallet, as a settlement.
 *
 * Shared by the send tool and the just-in-time conversion: both move USDC
 * from the wallet the agent is a signer on, both are signed by Privy under
 * the committed policy and broadcast here, and both report Privy's refusal
 * in its own words rather than as a thrown error, because a refusal is a
 * fact for the receipt and not a transport failure to retry.
 */

import { EvmRpcError, PrivySignerRefusedError } from "@froggy/wallet";

import type { Services } from "./services";
import type { Settled } from "./session";

export const sendUsdc = async (
  services: Services,
  wallet: { readonly address: string; readonly id: string } | null,
  to: string,
  units: string
): Promise<Settled> => {
  const network = services.environment.evmNetwork;
  const transfers = services.evmTransfersFor(wallet);
  if (transfers === null) {
    return {
      error: "the agent has no signer on this wallet yet",
      network,
      ok: false,
      stubbed: false,
      transactionId: null,
    };
  }
  try {
    const outcome = await transfers.send({ to, units: BigInt(units) });
    const settled = {
      network,
      ok: outcome.status === "success",
      stubbed: false,
      transactionId: outcome.hash,
    };
    return outcome.status === "success"
      ? settled
      : { ...settled, error: "the transfer reverted on chain" };
  } catch (error) {
    if (
      error instanceof PrivySignerRefusedError ||
      error instanceof EvmRpcError
    ) {
      return {
        error: error.message,
        network,
        ok: false,
        stubbed: false,
        transactionId: null,
      };
    }
    throw error;
  }
};
