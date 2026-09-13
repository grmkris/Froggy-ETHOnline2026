import { EvmAddress, WalletActivityFlow } from "@froggy/domain";
import type {
  OnchainNetwork,
  WalletActivity,
  WalletMonitor,
} from "@froggy/domain";
import type { WalletStreamTransaction } from "@froggy/graph";
import { Schema } from "effect";
import { decodeFunctionResult, encodeFunctionData, parseAbi } from "viem";

import { PONS_ABI, PONS_DEPLOYMENTS } from "./trading/pons";
import type { TradingRpc } from "./trading/rpc";

// Primary deployment sources are recorded in the onchain alert decision.
const BASE_WALLET_VENUES = {
  network: "eip155:8453",
  uniswapV2: "0x8909dc15e40173ff4699343b6eb8132c65e18ec6",
  uniswapV3: "0x33128a8fc17869897dce68ed026d694621f6fdfd",
  uniswapV4: "0x498581ff718922c3f8e6a244956af099b2652b2b",
  aerodrome: "0x420dd381b31aef6683db6b902084cb0ffece40da",
  wrappedNative: "0x4200000000000000000000000000000000000006",
} as const;
const ROBINHOOD_WALLET_VENUES = {
  network: "eip155:4663",
  uniswapV2: "0x8bceaa40b9acdfaedf85adf4ff01f5ad6517937f",
  uniswapV3: "0x1f7d7550b1b028f7571e69a784071f0205fd2efa",
  uniswapV4: "0x8366a39cc670b4001a1121b8f6a443a643e40951",
  aerodrome: null,
  wrappedNative: "0x0bd7d308f8e1639fab988df18a8011f41eacad73",
} as const;
const walletVenues = (network: OnchainNetwork) =>
  network === "eip155:4663" ? ROBINHOOD_WALLET_VENUES : BASE_WALLET_VENUES;
const hexAddress = (value: string): `0x${string}` =>
  `0x${Schema.decodeUnknownSync(EvmAddress)(value).slice(2)}`;
const abi = parseAbi([
  "function factory() view returns (address)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function fee() view returns (uint24)",
  "function getPair(address,address) view returns (address)",
  "function getPool(address,address,uint24) view returns (address)",
  "function isPool(address) view returns (bool)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
]);
type Venue = WalletActivity["venues"][number];
type Transfer = WalletStreamTransaction["transfers"][number];
type Location = WalletStreamTransaction["swapsV2"][number]["location"];
export interface WalletVenueVerifier {
  readonly verify: (
    venue: Venue,
    location: Location,
    block: number
  ) => Promise<boolean>;
  readonly network?: OnchainNetwork;
  readonly beginBlock?: (block: number) => void;
  readonly metadata: (
    asset: string,
    block: number
  ) => Promise<{
    readonly symbol: string | null;
    readonly decimals: number | null;
  }>;
}
export const walletVenueVerifier = (
  rpc: TradingRpc,
  network: OnchainNetwork
): WalletVenueVerifier => {
  const deployments = walletVenues(network);
  let budgetBlock = -1;
  let calls = 0;
  const cache = new Map<
    string,
    { readonly at: number; readonly value: boolean }
  >();
  const metadata = new Map<
    string,
    { readonly symbol: string | null; readonly decimals: number | null }
  >();
  const call = async (
    to: string,
    data: `0x${string}`,
    block: number
  ): Promise<`0x${string}`> => {
    if (budgetBlock !== block) {
      budgetBlock = block;
      calls = 0;
    }
    calls += 1;
    if (calls > 100) {
      throw new Error("Wallet metadata RPC budget exhausted for this block.");
    }
    const response = await rpc.read({
      network,
      call: {
        method: "eth_call",
        params: [
          { to: Schema.decodeUnknownSync(EvmAddress)(to), data },
          `0x${block.toString(16)}`,
        ],
      },
    });
    const decoded = Schema.decodeUnknownSync(
      Schema.String.check(
        Schema.isPattern(/^0x[0-9a-f]*$/iu),
        Schema.isMaxLength(48_000)
      )
    )(response.result);
    if (
      response.stubbed ||
      response.network !== network ||
      response.method !== "eth_call" ||
      !decoded.startsWith("0x")
    ) {
      throw new Error("Pool verification requires live RPC evidence.");
    }
    return `0x${decoded.slice(2)}`;
  };
  const readAddress = async (
    to: string,
    name: "token0" | "token1" | "factory",
    block: number
  ) =>
    decodeFunctionResult({
      abi,
      functionName: name,
      data: await call(
        to,
        encodeFunctionData({ abi, functionName: name }),
        block
      ),
    }).toLowerCase();
  return {
    network,
    beginBlock: (block) => {
      if (budgetBlock !== block) {
        budgetBlock = block;
        calls = 0;
      }
    },
    verify: async (venue, location, block) => {
      if (venue === "uniswap_v4") {
        return location.contract === deployments.uniswapV4;
      }
      if (venue === "pons") {
        if (network !== "eip155:4663") {
          return false;
        }
        try {
          const curveAbi = parseAbi([
            "function token() view returns (address)",
          ]);
          const token = decodeFunctionResult({
            abi: curveAbi,
            functionName: "token",
            data: await call(
              location.contract,
              encodeFunctionData({ abi: curveAbi, functionName: "token" }),
              block
            ),
          });
          const record = decodeFunctionResult({
            abi: PONS_ABI,
            functionName: "getLaunchedToken",
            data: await call(
              PONS_DEPLOYMENTS.factory.address,
              encodeFunctionData({
                abi: PONS_ABI,
                functionName: "getLaunchedToken",
                args: [token],
              }),
              block
            ),
          });
          return (
            record.exists && record.curve.toLowerCase() === location.contract
          );
        } catch {
          return false;
        }
      }
      const key = `${venue}:${location.contract}`;
      const cached = cache.get(key);
      if (cached && cached.at <= block && block - cached.at < 1800) {
        return cached.value;
      }
      try {
        const factory = {
          uniswap_v2: deployments.uniswapV2,
          uniswap_v3: deployments.uniswapV3,
          aerodrome: deployments.aerodrome,
        }[venue];
        if (
          factory === null ||
          (await readAddress(location.contract, "factory", block)) !== factory
        ) {
          return false;
        }
        let valid = false;
        if (venue === "aerodrome") {
          valid = decodeFunctionResult({
            abi,
            functionName: "isPool",
            data: await call(
              factory,
              encodeFunctionData({
                abi,
                functionName: "isPool",
                args: [hexAddress(location.contract)],
              }),
              block
            ),
          });
        } else {
          const [token0, token1] = await Promise.all([
            readAddress(location.contract, "token0", block),
            readAddress(location.contract, "token1", block),
          ]);
          const pair = [hexAddress(token0), hexAddress(token1)] as const;
          if (venue === "uniswap_v2") {
            valid =
              decodeFunctionResult({
                abi,
                functionName: "getPair",
                data: await call(
                  factory,
                  encodeFunctionData({
                    abi,
                    functionName: "getPair",
                    args: pair,
                  }),
                  block
                ),
              }).toLowerCase() === location.contract;
          } else {
            const fee = decodeFunctionResult({
              abi,
              functionName: "fee",
              data: await call(
                location.contract,
                encodeFunctionData({ abi, functionName: "fee" }),
                block
              ),
            });
            valid =
              decodeFunctionResult({
                abi,
                functionName: "getPool",
                data: await call(
                  factory,
                  encodeFunctionData({
                    abi,
                    functionName: "getPool",
                    args: [...pair, fee],
                  }),
                  block
                ),
              }).toLowerCase() === location.contract;
          }
        }
        if (cache.size >= 2000) {
          cache.clear();
        }
        cache.set(key, { at: block, value: valid });
        return valid;
      } catch {
        return false;
      }
    },
    metadata: async (asset, block) => {
      if (asset === "native") {
        return { symbol: "ETH", decimals: 18 };
      }
      const cached = metadata.get(asset);
      if (cached) {
        return cached;
      }
      try {
        const [symbol, decimals] = await Promise.all([
          call(
            asset,
            encodeFunctionData({ abi, functionName: "symbol" }),
            block
          ).then((data) =>
            decodeFunctionResult({ abi, functionName: "symbol", data })
          ),
          call(
            asset,
            encodeFunctionData({ abi, functionName: "decimals" }),
            block
          ).then((data) =>
            decodeFunctionResult({ abi, functionName: "decimals", data })
          ),
        ]);
        const value = {
          symbol: /^[a-zA-Z0-9 ._-]{1,24}$/u.test(symbol) ? symbol : null,
          decimals,
        };
        if (metadata.size >= 2000) {
          metadata.clear();
        }
        metadata.set(asset, value);
        return value;
      } catch {
        return { symbol: null, decimals: null };
      }
    },
  };
};
const canonical = (asset: string, network: OnchainNetwork): string =>
  asset.toLowerCase() === walletVenues(network).wrappedNative.toLowerCase()
    ? "native"
    : asset.toLowerCase();
const connected = (
  flow: Transfer,
  tx: WalletStreamTransaction,
  pools: ReadonlySet<string>,
  network: OnchainNetwork
): boolean => {
  const outgoing = flow.from === tx.wallet;
  const visited = new Set<string>([outgoing ? flow.to : flow.from]);
  for (let pass = 0; pass <= tx.transfers.length; pass += 1) {
    if ([...pools].some((pool) => visited.has(pool))) {
      return true;
    }
    let changed = false;
    for (const edge of tx.transfers) {
      if (
        canonical(edge.asset, network) !== canonical(flow.asset, network) ||
        edge.from === tx.wallet ||
        edge.to === tx.wallet
      ) {
        continue;
      }
      const from = outgoing ? edge.from : edge.to;
      const to = outgoing ? edge.to : edge.from;
      if (visited.has(from) && !visited.has(to)) {
        visited.add(to);
        changed = true;
      }
    }
    if (!changed) {
      return false;
    }
  }
  return false;
};
const verifiedSwapSide = (
  flow: Transfer,
  related: readonly Transfer[],
  net: ReadonlyMap<string, bigint>,
  wallet: string,
  network: OnchainNetwork,
  swap: boolean
): "sent" | "received" | null => {
  if (!swap || !related.includes(flow)) {
    return null;
  }
  const amount = net.get(canonical(flow.asset, network)) ?? 0n;
  if (amount > 0n && flow.to === wallet) {
    return "received";
  }
  if (amount < 0n && flow.from === wallet) {
    return "sent";
  }
  return null;
};
export const describeWalletActivity = async (
  tx: WalletStreamTransaction,
  block: number,
  verifier: WalletVenueVerifier
): Promise<Pick<WalletActivity, "kind" | "flows" | "venues" | "complete">> => {
  const network = verifier.network ?? "eip155:8453";
  const flows = tx.transfers.filter(
    (flow) =>
      (flow.from === tx.wallet || flow.to === tx.wallet) &&
      flow.from !== flow.to &&
      BigInt(flow.amount) > 0n
  );
  const candidates: { readonly venue: Venue; readonly location: Location }[] = [
    ...tx.swapsV2.map((swap) => ({
      venue: "uniswap_v2" as const,
      location: swap.location,
    })),
    ...tx.swapsV3.map((swap) => ({
      venue: "uniswap_v3" as const,
      location: swap.location,
    })),
    ...tx.swapsV4.map((swap) => ({
      venue: "uniswap_v4" as const,
      location: swap.location,
    })),
    ...(tx.curvesPons ?? []).map((swap) => ({
      venue: "pons" as const,
      location: swap.location,
    })),
    ...tx.swapsAerodrome.map((swap) => ({
      venue: "aerodrome" as const,
      location: swap.location,
    })),
  ];
  const verified = [];
  // A hostile batch cannot make unbounded pool verification requests.
  for (const candidate of candidates.slice(0, 8)) {
    if (await verifier.verify(candidate.venue, candidate.location, block)) {
      verified.push(candidate);
    }
  }
  const pools = new Set(
    verified.map((candidate) => candidate.location.contract)
  );
  const related = flows.filter((flow) => connected(flow, tx, pools, network));
  const net = new Map<string, bigint>();
  for (const flow of related) {
    net.set(
      canonical(flow.asset, network),
      (net.get(canonical(flow.asset, network)) ?? 0n) +
        BigInt(flow.amount) * (flow.from === tx.wallet ? -1n : 1n)
    );
  }
  const legs = [...net.values()].filter((value) => value !== 0n);
  const swap =
    !tx.truncated &&
    candidates.length <= 8 &&
    legs.filter((value) => value < 0n).length === 1 &&
    legs.filter((value) => value > 0n).length === 1;
  const descriptions: WalletActivityFlow[] = [];
  for (const flow of flows) {
    const extra =
      descriptions.length < 8
        ? await verifier.metadata(flow.asset, block)
        : { symbol: null, decimals: null };
    descriptions.push(
      Schema.decodeUnknownSync(WalletActivityFlow)({
        asset: flow.asset,
        amount: flow.amount,
        direction: flow.from === tx.wallet ? "sent" : "received",
        counterparty: flow.from === tx.wallet ? flow.to : flow.from,
        swapSide:
          verifiedSwapSide(flow, related, net, tx.wallet, network, swap) ??
          undefined,
        ...extra,
      })
    );
  }
  const ordinaryKind = candidates.length > 0 ? "activity" : "transfer";
  return {
    kind: swap ? "swap" : ordinaryKind,
    flows: descriptions,
    venues: swap
      ? [...new Set(verified.map((candidate) => candidate.venue))]
      : [],
    complete: !tx.truncated,
  };
};
export const walletActivityText = (
  activity: WalletActivity,
  appUrl: string
): string => {
  if (activity.kind === "price" && activity.price) {
    const { price } = activity;
    return `${price.initiallyMatched ? "Price already" : "Price moved"} ${price.comparison} ${price.threshold} ${price.quoteCurrency}\nObserved ${price.observation.price} ${price.quoteCurrency} · ${price.sourceLabel} · ${activity.network === "eip155:4663" ? "Robinhood" : "Base"} · provisional\n${appUrl}/watchlist/${activity.itemId}`;
  }
  const titles = {
    swap: "Wallet swap",
    transfer: "Wallet transfer",
    activity: "Wallet activity",
    price: "Price alert",
  };
  const title = titles[activity.kind];
  const lines = activity.flows.slice(0, 6).map((flow) => {
    const raw = flow.amount.padStart((flow.decimals ?? 0) + 1, "0");
    const amount =
      flow.decimals !== null && flow.decimals > 0
        ? `${raw.slice(0, -flow.decimals)}.${raw.slice(-flow.decimals)}`.replace(
            /\.?0+$/u,
            ""
          )
        : raw;
    const label =
      flow.symbol ??
      (flow.asset === "native"
        ? "ETH"
        : `${flow.asset.slice(0, 8)}…${flow.asset.slice(-4)}`);
    return `${flow.direction === "sent" ? "Sent" : "Received"} ${amount} ${label}${flow.decimals === null ? " (raw units)" : ""}`;
  });
  return `${title} · ${activity.network === "eip155:4663" ? "Robinhood" : "Base"} · provisional\n${lines.join("\n")}${activity.flows.length > 6 ? `\n+${activity.flows.length - 6} more movements` : ""}\nhttps://${activity.network === "eip155:4663" ? "robinhoodchain.blockscout.com" : "basescan.org"}/tx/${activity.transactionHash}\n${appUrl}/watchlist/${activity.itemId}`;
};

export const walletActivityMatches = (
  monitor: WalletMonitor,
  activity: WalletActivity
): boolean => {
  if (activity.kind === "price") {
    return (
      monitor.rules?.some((rule) => rule.id === activity.price?.ruleId) ?? false
    );
  }
  if (!monitor.rules) {
    return activity.kind === "swap" ? monitor.swaps : monitor.transfers;
  }
  return monitor.rules.some((rule) => {
    const { condition } = rule;
    if (condition._tag === "price") {
      return false;
    }
    if (
      condition._tag === "swap" &&
      (activity.kind !== "swap" || !activity.complete)
    ) {
      return false;
    }
    return activity.flows.some((flow) => {
      if (condition._tag === "swap" && flow.swapSide === undefined) {
        return false;
      }
      if (
        condition.token !== null &&
        canonical(flow.asset, activity.network).toLowerCase() !==
          canonical(condition.token, activity.network).toLowerCase()
      ) {
        return false;
      }
      const swapDirection = { bought: "received", sold: "sent", both: "both" };
      const direction =
        condition._tag === "transfer"
          ? condition.direction
          : swapDirection[condition.side];
      return direction === "both" || direction === flow.direction;
    });
  });
};
