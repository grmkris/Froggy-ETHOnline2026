/**
 * USDC into HBAR, on the spot.
 *
 * A Hedera payment is drawn from the person's HBAR. When there is not enough,
 * the session converts: USDC leaves the person's wallet for the treasury
 * under the wallet's own policy, and the same value in HBAR leaves the float
 * for the person's own Hedera account. Two legs, reported separately, because
 * they can fail separately and the receipt has to say which one did.
 *
 * Not a tool. Nothing about spending authority changes here: the mandate
 * judges the USDC transfer like any other spend, Privy's policy caps it, and
 * the model never chooses the amount.
 */

import { KNOWN_ASSETS } from "@froggy/domain";
import type { UserId } from "@froggy/domain";

import type { Services } from "./services";
import type { ConversionOutcome, SessionDeps } from "./session";
import { sendUsdc } from "./usdc-transfer";

const TINYBARS_PER_HBAR = 100_000_000;

export const createConversion = (
  services: Services
): SessionDeps["convert"] | undefined => {
  const treasury = services.environment.treasuryEvmAddress;
  if (treasury === null) {
    return undefined;
  }
  const { evmNetwork } = services.environment;
  return {
    asset: KNOWN_ASSETS[`${evmNetwork}:usdc`],
    payeeId: treasury,
    payeeLabel: "the treasury",
    perform: async (
      userId: UserId,
      wallet,
      usdMicros
    ): Promise<ConversionOutcome> => {
      const transfer = await sendUsdc(
        services,
        wallet,
        treasury,
        String(usdMicros)
      );
      if (!transfer.ok) {
        return { funded: null, transfer };
      }
      const { accounts } = services;
      if (accounts === null) {
        return { funded: null, transfer };
      }
      try {
        const moved = await accounts.fund(userId, usdMicros);
        return {
          funded: {
            note: `${(moved.tinybars / TINYBARS_PER_HBAR).toFixed(4)} HBAR moved into your Hedera account (transaction ${moved.transactionId})`,
          },
          transfer,
        };
      } catch (error) {
        return {
          funded: {
            error: error instanceof Error ? error.message : String(error),
          },
          transfer,
        };
      }
    },
  };
};
