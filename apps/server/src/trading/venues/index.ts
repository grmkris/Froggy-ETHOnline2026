import type { TradingNetwork } from "@froggy/domain";

import type { TradeEvmClient } from "../evm-chain";
import { PONS_NETWORK } from "../networks";
import { clankerLaunchVenue } from "./clanker";
import { BASE_NETWORK } from "./common";
import { flaunchLaunchVenue } from "./flaunch";
import { ponsLaunchVenue } from "./pons";
import { poolsTradeLaunchVenue } from "./pools-trade";
import type { LaunchVenue } from "./types";
import { virtualsLaunchVenue } from "./virtuals";
import { zoraLaunchVenue } from "./zora";

export type { LaunchVenue } from "./types";
export { detectLauncher } from "./types";
export { ponsLaunchVenue } from "./pons";

/**
 * The reviewed launchers on one network, in detection order. Shared by the
 * paid research read and by execution backends that gate rules on research,
 * so both see the same launcher claims and holder exclusions.
 */
export const launchVenuesFor = (
  network: TradingNetwork,
  client: TradeEvmClient
): readonly LaunchVenue[] => {
  if (network === PONS_NETWORK) {
    return [ponsLaunchVenue(client), poolsTradeLaunchVenue(client)];
  }
  if (network === BASE_NETWORK) {
    return [
      clankerLaunchVenue(client),
      zoraLaunchVenue(client),
      flaunchLaunchVenue(client),
      virtualsLaunchVenue(client),
    ];
  }
  return [];
};
