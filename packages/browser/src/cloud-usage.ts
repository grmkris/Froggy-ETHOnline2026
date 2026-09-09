import type { CloudBrowserInfo } from "./cloud-api";

/** Known hosting costs only. Missing provider reports are counted, never priced at zero. */
export interface CloudUsage {
  readonly sessions: number;
  readonly unreportedSessions: number;
  readonly browserUsdMicros: number;
  readonly proxyUsdMicros: number;
  readonly lastBrowserId: string;
  readonly lastBrowserUsdMicros: number | null;
  readonly lastProxyUsdMicros: number | null;
  readonly updatedAt: number;
}

const micros = (dollars: string | undefined): number | null => {
  if (dollars === undefined || !/^\d+(?:\.\d+)?$/u.test(dollars)) {
    return null;
  }
  const value = Math.ceil(Number(dollars) * 1_000_000);
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
};

const replaceCost = (
  total: number | undefined,
  repeated: boolean,
  last: number | null | undefined,
  next: number | null
): number => (total ?? 0) - (repeated ? (last ?? 0) : 0) + (next ?? 0);

const missingCosts = (browser: number | null, proxy: number | null): boolean =>
  browser === null || proxy === null;

export const recordCloudUsage = (
  previous: CloudUsage | undefined,
  browserId: string,
  info: CloudBrowserInfo | null,
  now: number
): CloudUsage => {
  const repeated = previous?.lastBrowserId === browserId;
  const browserCost =
    micros(info?.browserCost) ??
    (repeated ? previous.lastBrowserUsdMicros : null);
  const proxyCost =
    micros(info?.proxyCost) ?? (repeated ? previous.lastProxyUsdMicros : null);
  const unreported = missingCosts(browserCost, proxyCost);
  const previouslyUnreported =
    repeated &&
    missingCosts(previous.lastBrowserUsdMicros, previous.lastProxyUsdMicros);
  return {
    sessions: (previous?.sessions ?? 0) + (repeated ? 0 : 1),
    unreportedSessions:
      (previous?.unreportedSessions ?? 0) -
      (previouslyUnreported ? 1 : 0) +
      (unreported ? 1 : 0),
    browserUsdMicros: replaceCost(
      previous?.browserUsdMicros,
      repeated,
      previous?.lastBrowserUsdMicros,
      browserCost
    ),
    proxyUsdMicros: replaceCost(
      previous?.proxyUsdMicros,
      repeated,
      previous?.lastProxyUsdMicros,
      proxyCost
    ),
    lastBrowserId: browserId,
    lastBrowserUsdMicros: browserCost,
    lastProxyUsdMicros: proxyCost,
    updatedAt: now,
  };
};
