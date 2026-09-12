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

export type {
  LaunchVenue,
  LaunchVenueCapabilities,
  LaunchVenueRegistration,
  LaunchVenueTrade,
} from "./types";
export { detectLauncher } from "./types";
export { ponsLaunchVenue, stubPonsLaunchVenue } from "./pons";
export { clankerLaunchVenue, stubClankerLaunchVenue } from "./clanker";
export { zoraLaunchVenue, stubZoraLaunchVenue } from "./zora";
export { flaunchLaunchVenue, stubFlaunchLaunchVenue } from "./flaunch";
export { virtualsLaunchVenue, stubVirtualsLaunchVenue } from "./virtuals";
export {
  poolsTradeLaunchVenue,
  stubPoolsTradeLaunchVenue,
  POOLS_TRADE_DEPLOYMENTS,
  POOLS_TRADE_LAUNCHPADS,
} from "./pools-trade";

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
