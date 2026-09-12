/**
 * The asset a seller quoted, as the ledger prices it.
 *
 * Known USDC contracts get their name and decimals; HBAR is the Hedera
 * testnet's native unit; anything else is carried as it was quoted, which
 * the policy will refuse to price rather than guess at. Null for a network
 * this wallet does not know at all.
 */

import { knownAsset, Network } from "@froggy/domain";
import type { PaymentChallenge } from "@froggy/payments";
import { Schema } from "effect";

import type { SpendRequest } from "./session";

const isNetwork = Schema.is(Network);

export const assetFor = (
  requirement: PaymentChallenge["accepts"][number]
): SpendRequest["amount"] | null => {
  if (!isNetwork(requirement.network)) {
    return null;
  }
  const { network } = requirement;
  const known = knownAsset(requirement.asset, network);
  if (known !== undefined) {
    return { asset: known, units: requirement.amount };
  }
  const hedera = network.startsWith("hedera:");
  return {
    asset: {
      decimals: hedera ? 8 : 6,
      id: requirement.asset,
      network,
      symbol: hedera ? "HTS" : "TOKEN",
    },
    units: requirement.amount,
  };
};
