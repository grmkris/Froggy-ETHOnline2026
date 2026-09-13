import type { TradeInput } from "@froggy/domain";
import type { PrivyExecution } from "@froggy/wallet";
import { Redacted } from "effect";

import { coinbaseCardRates, stubCardRates } from "./card-rates";
import { CardVault } from "./card-vault";
import type { Environment } from "./environment";
import { CARD_BRIDGE, uniswapCardBridge } from "./trading/card-bridge";
import { cardBridgeExecution } from "./trading/card-bridge-execution";
import { liveCardLinea } from "./trading/card-bridge-observation";
import type { CardLineaReader } from "./trading/card-bridge-observation";
import type { TradeBackend } from "./trading/coordinator";
import { tradeEvmClient } from "./trading/evm-chain";
import { stubTradeBackend } from "./trading/stub-execution";

export const cardProviders = (
  environment: Environment,
  privy: PrivyExecution | undefined
) => {
  const config = environment.cards;
  const unavailable: CardLineaReader = {
    stubbed: false,
    balance: async () =>
      await Promise.reject(
        new Error("card.configuration: read-only Linea funding is unavailable.")
      ),
    observe: async () =>
      await Promise.reject(
        new Error("card.configuration: bridge observation unavailable.")
      ),
  };
  if (config?.mode === "stub") {
    const backend = stubTradeBackend(Date.now);
    const reader: CardLineaReader = {
      stubbed: true,
      balance: async () => {
        await Promise.resolve();
        return { units: "0", block: "1", observedAt: Date.now() };
      },
      observe: async (_input, _minimum, previous) => {
        await Promise.resolve();
        return {
          ...previous,
          sourceTransaction: `0x${"1".repeat(64)}`,
          sourceBlockHash: `0x${"2".repeat(64)}`,
          depositId: "1",
          sourceConfirmed: true,
          fillTransaction: `0x${"3".repeat(64)}`,
          fillBlock: "2",
          fillBlockHash: `0x${"4".repeat(64)}`,
          destinationConfirmed: true,
        };
      },
    };
    return {
      reader,
      backend: (input: TradeInput) =>
        input.action === "bridge" ? backend : null,
    };
  }
  const source = environment.trading.rpcEndpoints[CARD_BRIDGE.sourceNetwork];
  if (
    privy === undefined ||
    config?.mode !== "live" ||
    source === undefined ||
    environment.trading.tenderly === null ||
    environment.trading.privySponsoredNetworks?.includes(
      CARD_BRIDGE.sourceNetwork
    ) !== true
  ) {
    return {
      reader: unavailable,
      backend: (_input: TradeInput): TradeBackend | null => null,
    };
  }
  const client = tradeEvmClient({ endpoint: source });
  const reader = liveCardLinea(
    client,
    tradeEvmClient({ endpoint: config.lineaRpc }),
    environment.trading.confirmations,
    config.confirmations
  );
  const backend = cardBridgeExecution({
    client,
    tenderly: environment.trading.tenderly,
    sponsored: true,
    privy,
    quotes: uniswapCardBridge(environment.trading.uniswapApiKey),
    confirmations: environment.trading.confirmations,
    now: Date.now,
  });
  return {
    reader,
    backend: (input: TradeInput) =>
      input.action === "bridge" ? backend : null,
  };
};

export const cardCheckoutConfiguration = (environment: Environment) => ({
  enabled: environment.cards?.enabled === true,
  liveCardEntry: environment.cards?.liveCardEntry === true,
  vault: new CardVault(
    environment.cards?.vaultKey ?? Redacted.make("unconfigured")
  ),
  rates:
    environment.cards?.mode === "stub" ? stubCardRates() : coinbaseCardRates(),
});
