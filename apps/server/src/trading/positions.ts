import { sameTradingAddress } from "@froggy/domain";
import type { Trade, UserId } from "@froggy/domain";
import { TradePositions } from "@froggy/protocol";
import type { TradePosition } from "@froggy/protocol";
import { Schema } from "effect";
import { getAddress, parseAbi } from "viem";

import type { Services } from "../services";
import { ensoBalances } from "./enso";
import type { EnsoOptions } from "./enso";
import {
  assertTradeNetwork,
  tradeEvmClient,
  tradeTokenBalance,
} from "./evm-chain";
import type { TradeEvmClient } from "./evm-chain";

const VAULT = parseAbi([
  "function asset() view returns (address)",
  "function maxRedeem(address owner) view returns (uint256)",
  "function previewRedeem(uint256 shares) view returns (uint256)",
]);
const NATIVE_SENTINEL = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

const bookkeeping = (
  trades: readonly Trade[],
  wallet: string,
  asset: string
) => {
  let reserved = 0n;
  let deposits = 0n;
  let withdrawals = 0n;
  for (const trade of trades) {
    if (
      trade.input.network !== "eip155:1" ||
      !sameTradingAddress(trade.input.network, trade.input.wallet, wallet)
    ) {
      continue;
    }
    if (trade.reservationState === "held") {
      for (const hold of trade.reservations) {
        if (sameTradingAddress(trade.input.network, hold.asset, asset)) {
          reserved += BigInt(hold.units);
        }
      }
    }
    if (
      trade.input.position?.toLowerCase() !== asset.toLowerCase() ||
      trade.status !== "completed"
    ) {
      continue;
    }
    if (trade.input.action === "deposit") {
      deposits += BigInt(trade.input.amount);
    }
    if (trade.input.action === "withdraw") {
      withdrawals += BigInt(trade.actualOutput ?? "0");
    }
  }
  return { reserved, deposits, withdrawals };
};

const position = (
  asset: string,
  symbol: string | null,
  decimals: number,
  units: bigint | null,
  trades: readonly Trade[],
  wallet: string
): TradePosition => {
  const { reserved, deposits, withdrawals } = bookkeeping(
    trades,
    wallet,
    asset
  );
  const available = units === null ? null : units - reserved;
  return {
    asset,
    symbol,
    decimals,
    units: units?.toString() ?? null,
    reservedUnits: reserved.toString(),
    availableUnits:
      available === null ? null : (available > 0n ? available : 0n).toString(),
    kind: asset === "native" ? "native" : "token",
    underlying: null,
    withdrawableShares: null,
    withdrawableAssets: null,
    recordedDeposits: deposits.toString(),
    recordedWithdrawals: withdrawals.toString(),
    realizedYield: null,
    limitation:
      "Recorded deposits and withdrawals cover Froggy activity only. External transfers and historical cost basis are unknown.",
  };
};

const inspectToken = async (
  client: TradeEvmClient,
  token: Awaited<ReturnType<typeof ensoBalances>>[number],
  wallet: string,
  blockNumber: bigint,
  trades: readonly Trade[]
): Promise<TradePosition> => {
  const units = await tradeTokenBalance(
    client,
    token.token,
    wallet,
    blockNumber
  ).catch(() => null);
  const entry = position(
    token.token,
    token.symbol,
    token.decimals,
    units,
    trades,
    wallet
  );
  if (units === null) {
    return {
      ...entry,
      kind: "unavailable",
      limitation: "The independent token balance read failed.",
    };
  }
  try {
    const address = getAddress(token.token);
    const underlying = await client.readContract({
      address,
      abi: VAULT,
      functionName: "asset",
      blockNumber,
    });
    const maxRedeem = await client.readContract({
      address,
      abi: VAULT,
      functionName: "maxRedeem",
      args: [getAddress(wallet)],
      blockNumber,
    });
    const available = BigInt(entry.availableUnits ?? "0");
    const shares = maxRedeem < available ? maxRedeem : available;
    const assets = await client.readContract({
      address,
      abi: VAULT,
      functionName: "previewRedeem",
      args: [shares],
      blockNumber,
    });
    return {
      ...entry,
      kind: "vault",
      underlying,
      withdrawableShares: shares.toString(),
      withdrawableAssets: assets.toString(),
      limitation:
        "ERC-4626 redemption preview at this block; liquidity and fees can change. A fresh Enso route and simulation are required before withdrawing. Yield-only spending is unavailable without a complete cost basis.",
    };
  } catch {
    return {
      ...entry,
      limitation:
        "No supported synchronous ERC-4626 redemption was established. Reward claims and queued withdrawals are not inferred.",
    };
  }
};

export const readEnsoPositions = async (input: {
  readonly client: TradeEvmClient;
  readonly enso: EnsoOptions;
  readonly wallet: string;
  readonly trades: readonly Trade[];
  readonly now: () => number;
}): Promise<TradePositions> => {
  const { client, wallet, trades } = input;
  await assertTradeNetwork(client, "eip155:1");
  const discovered = await ensoBalances(input.enso, wallet);
  if (
    discovered.some((token) => token.chainId !== 1) ||
    new Set(discovered.map((token) => token.token.toLowerCase())).size !==
      discovered.length
  ) {
    throw new Error(
      "trade.positions: provider inventory has mismatched or duplicate assets."
    );
  }
  const tokens = discovered
    .filter((token) => token.token.toLowerCase() !== NATIVE_SENTINEL)
    .slice(0, 20);
  const blockNumber = await client.getBlockNumber({ cacheTime: 0 });
  const [native, entries] = await Promise.all([
    client.getBalance({ address: getAddress(wallet), blockNumber }),
    Promise.all(
      tokens.map(
        async (token) =>
          await inspectToken(client, token, wallet, blockNumber, trades)
      )
    ),
  ]);
  return Schema.decodeUnknownSync(TradePositions)({
    v: 1,
    network: "eip155:1",
    wallet,
    observedAt: input.now(),
    block: blockNumber.toString(),
    positions: [
      position("native", "ETH", 18, native, trades, wallet),
      ...entries,
    ],
    truncated: discovered.length > 20,
    stubbed: false,
    limitations: [
      "Enso supplies a bounded inventory; RPC supplies balances at one block. Assets missing from provider discovery are not proof of zero balance.",
      "Prices, claimable rewards and realized yield are not inferred from balances or APR.",
    ],
  });
};

export const getTradingPositions = async (
  services: Services,
  owner: UserId,
  network: string
): Promise<TradePositions> => {
  if (network !== "eip155:1") {
    throw new Error(
      "trade.positions: yield-position discovery currently supports Ethereum."
    );
  }
  const { trading } = services.environment;
  const trades = await services.store.trading.transact(owner, (book) => [
    ...book.trades.values(),
  ]);
  if (trading.ensoMode === "stub") {
    const wallet = "0x1111111111111111111111111111111111111111";
    const entry = position(
      "0x3333333333333333333333333333333333333333",
      "DEMO VAULT",
      6,
      1_000_000n,
      trades,
      wallet
    );
    return {
      v: 1,
      network,
      wallet,
      observedAt: Date.now(),
      block: "fixture",
      positions: [
        position(
          "native",
          "ETH",
          18,
          1_000_000_000_000_000_000n,
          trades,
          wallet
        ),
        {
          ...entry,
          kind: "vault",
          underlying: "0x2222222222222222222222222222222222222222",
          withdrawableShares: entry.availableUnits,
          withdrawableAssets: "1000000",
        },
      ],
      truncated: false,
      stubbed: true,
      limitations: [
        "Simulated portfolio. These balances are fixtures, not wallet funds.",
      ],
    };
  }
  const endpoint = trading.rpcEndpoints[network];
  if (
    trading.ensoMode !== "live" ||
    endpoint === undefined ||
    services.environment.modes.privy !== "live"
  ) {
    throw new Error(
      "trade.positions: Enso, Ethereum RPC and the owner's wallet must be configured."
    );
  }
  const wallets = await services.privy.paymentWallets(owner);
  const wallet = wallets.ethereum?.address;
  if (wallet === undefined) {
    throw new Error("trade.wallet: create the owner's Ethereum wallet first.");
  }
  return await readEnsoPositions({
    client: tradeEvmClient({ endpoint }),
    enso: { apiKey: trading.ensoApiKey },
    wallet,
    trades,
    now: Date.now,
  });
};
