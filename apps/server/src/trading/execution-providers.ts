import type { TradeInput } from "@froggy/domain";
import type { TradeCapabilities } from "@froggy/protocol";
import type { PrivyServer } from "@froggy/wallet";

import type { TradingEnvironment } from "../environment";
import type { TradeBackend } from "./coordinator";
import { ensoExecution } from "./enso-execution";
import { tradeEvmClient } from "./evm-chain";
import { jupiterExecution } from "./jupiter-execution";
import { PONS_DEPLOYMENTS } from "./pons";
import { ponsExecution } from "./pons-execution";
import { pumpExecution } from "./pump-execution";
import { PUMP_PROGRAMS } from "./pump-state";
import { SolanaTradeRpc } from "./solana-chain";
import { stubTradeBackend } from "./stub-execution";
import { liveUniswap } from "./uniswap";
import { uniswapExecution } from "./uniswap-execution";
import {
  uniswapDeployment,
  uniswapExecutionNetwork,
} from "./uniswap-transactions";

const SOLANA = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
type Mode = "live" | "stub" | "unavailable";
const routeMode = (
  environment: TradingEnvironment,
  venue: TradeInput["venue"],
  network: string,
  privyLive: boolean
): Mode => {
  const modes = {
    jupiter: environment.jupiterMode,
    enso: environment.ensoMode,
    uniswap: environment.uniswapMode,
    pons: environment.ponsMode,
    pump: environment.pumpMode,
  } as const;
  const mode = modes[venue];
  if (mode !== "live") {
    return mode;
  }
  if (
    !privyLive ||
    environment.rpcEndpoints[network] === undefined ||
    (venue === "uniswap" && !uniswapExecutionNetwork(network))
  ) {
    return "unavailable";
  }
  return "live";
};

export const executionCapabilities = (
  environment: TradingEnvironment,
  wallets: Awaited<ReturnType<PrivyServer["paymentWallets"]>>,
  privyLive: boolean
): typeof TradeCapabilities.Type => {
  const uniswap: (typeof TradeCapabilities.Type)["routes"] =
    environment.uniswapChains
      .filter((chain) => uniswapDeployment(chain.network) !== null)
      .map((chain) => {
        const mode = routeMode(
          environment,
          "uniswap",
          chain.network,
          privyLive
        );
        return {
          venue: "uniswap",
          action: "swap",
          network: chain.network,
          mode,
          wallet:
            mode === "stub"
              ? "0x1111111111111111111111111111111111111111"
              : (wallets.ethereum?.address ?? null),
          limitations: [
            "Exact-input legacy ERC-20 swaps through one V3 path. Each allowance and swap needs its own approval.",
            ...(!uniswapExecutionNetwork(chain.network) && mode !== "stub"
              ? [
                  "Live execution is unavailable until rollup data fees have a separate approved budget model.",
                ]
              : []),
          ],
        };
      });
  const mode = routeMode(environment, "jupiter", SOLANA, privyLive);
  const ponsMode = routeMode(environment, "pons", "eip155:4663", privyLive);
  const pumpMode = routeMode(environment, "pump", SOLANA, privyLive);
  return {
    v: 1,
    routes: [
      ...uniswap,
      {
        venue: "pons",
        action: "swap",
        network: "eip155:4663",
        mode: ponsMode,
        launchFactory: PONS_DEPLOYMENTS.factory.address,
        quoteAsset: PONS_DEPLOYMENTS.quote.address,
        wallet:
          ponsMode === "stub"
            ? "0x1111111111111111111111111111111111111111"
            : (wallets.ethereum?.address ?? null),
        limitations: [
          "Native Pons V2 USDG pairs on Robinhood. Live execution requires explicit operator activation, RPC, Tenderly and Privy signing.",
          "Curve buys may partially fill and refund unused input at the approved price bound. A phase change before signing requires a new proposal.",
        ],
      },
      {
        venue: "pump",
        action: "swap",
        network: SOLANA,
        mode: pumpMode,
        launchFactory: PUMP_PROGRAMS.curve,
        quoteAsset: "native",
        wallet:
          pumpMode === "stub"
            ? "11111111111111111111111111111111"
            : (wallets.solana?.address ?? null),
        limitations: [
          "Live execution is disabled by default; it requires explicit operator activation, Solana RPC and Privy signing.",
          "Native SOL buys and sells on the bonding curve or canonical graduated pool. Mayhem, cashback and non-SOL quote variants are unavailable.",
          "Input is a maximum allocation; receipts record actual input used. A phase change before signing requires a new proposal and approval.",
        ],
      },
      ...(["deposit", "withdraw"] as const).map((action) => {
        const ensoMode = routeMode(environment, "enso", "eip155:1", privyLive);
        return {
          venue: "enso" as const,
          action,
          network: "eip155:1" as const,
          mode: ensoMode,
          wallet:
            ensoMode === "stub"
              ? "0x1111111111111111111111111111111111111111"
              : (wallets.ethereum?.address ?? null),
          limitations: [
            "ERC-4626 vault shares only. Withdraw input is the share amount; queued withdrawals and reward claims are unavailable.",
            "Only reviewed direct Enso shortcuts with no provider fees are accepted. Each transaction requires approval.",
          ],
        };
      }),
      {
        venue: "jupiter",
        action: "swap",
        network: SOLANA,
        mode,
        wallet:
          mode === "stub"
            ? "11111111111111111111111111111111"
            : (wallets.solana?.address ?? null),
        limitations: [
          "Owner-paid Metis routes through reviewed Raydium, Meteora or Lifinity variants. Legacy SPL tokens only; enter native for SOL.",
          "Quotes expire quickly. Unknown route variants, co-signers, delegates and unsupported wrapping are refused.",
        ],
      },
    ],
  };
};

const supportsExecution = (
  environment: TradingEnvironment,
  input: TradeInput
): boolean => {
  const supported =
    input.action === "swap" &&
    (["jupiter", "pump"].includes(input.venue)
      ? input.network === SOLANA
      : input.venue === "uniswap" &&
        uniswapDeployment(input.network) !== null &&
        environment.uniswapChains.some(
          (chain) => chain.network === input.network
        ));
  const ensoSupported =
    input.venue === "enso" &&
    input.network === "eip155:1" &&
    ["deposit", "withdraw"].includes(input.action);
  const ponsSupported =
    input.venue === "pons" &&
    input.network === "eip155:4663" &&
    input.action === "swap";
  return supported || ensoSupported || ponsSupported;
};

export const executionProviders = (
  environment: TradingEnvironment,
  privyLive: boolean
): ((input: TradeInput) => TradeBackend | null) => {
  const backends = new Map<string, TradeBackend>();
  const stub = stubTradeBackend(Date.now);
  return function resolveExecution(input) {
    if (!supportsExecution(environment, input)) {
      return null;
    }
    const mode = routeMode(environment, input.venue, input.network, privyLive);
    if (mode === "stub") {
      return stub;
    }
    const endpoint = environment.rpcEndpoints[input.network];
    if (mode !== "live" || endpoint === undefined) {
      return null;
    }
    const key = `${input.venue}:${input.network}`;
    const cached = backends.get(key);
    if (cached !== undefined) {
      return cached;
    }
    if (["jupiter", "pump"].includes(input.venue)) {
      const options = { rpc: new SolanaTradeRpc({ endpoint }), now: Date.now };
      const backend =
        input.venue === "pump"
          ? pumpExecution(options)
          : jupiterExecution({
              ...options,
              jupiter: { apiKey: environment.jupiterApiKey },
            });
      backends.set(key, backend);
      return backend;
    }
    const { tenderly } = environment;
    if (tenderly === null) {
      return null;
    }
    if (input.venue === "pons") {
      const backend = ponsExecution({
        client: tradeEvmClient({ endpoint }),
        tenderly,
        confirmations: environment.confirmations,
        now: Date.now,
      });
      backends.set(key, backend);
      return backend;
    }
    if (input.venue === "enso") {
      const backend = ensoExecution({
        client: tradeEvmClient({ endpoint }),
        enso: { apiKey: environment.ensoApiKey },
        tenderly,
        confirmations: environment.confirmations,
        now: Date.now,
      });
      backends.set(key, backend);
      return backend;
    }
    const backend: TradeBackend = {
      stubbed: false,
      ...uniswapExecution({
        client: tradeEvmClient({ endpoint }),
        quotes: liveUniswap({
          apiKey: environment.uniswapApiKey,
          chains: environment.uniswapChains,
          protocols: ["V3"],
        }),
        tenderly,
        confirmations: environment.confirmations,
        now: Date.now,
      }),
    };
    backends.set(key, backend);
    return backend;
  };
};
