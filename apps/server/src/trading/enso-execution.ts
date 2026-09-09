import { ApprovalId, TradeStep, TradeStepId } from "@froggy/domain";
import type { Trade, TradeInput, TradePayload } from "@froggy/domain";
import { Schema } from "effect";
import { encodeFunctionData, getAddress, parseAbi } from "viem";

import type { TradeBackend } from "./coordinator";
import { ensoRoute } from "./enso";
import type { EnsoOptions } from "./enso";
import { ENSO_ROUTER, validateEnsoRoute } from "./enso-transactions";
import { assertTradeNetwork, tradeAllowance } from "./evm-chain";
import {
  evmTradeBalances,
  evmTradeSubmission,
  simulateEvmTrade,
} from "./evm-execution";
import type { EvmExecutionOptions } from "./evm-execution";

const CONTRACTS = parseAbi([
  "function shortcuts() view returns (address)",
  "function executor() view returns (address)",
  "function asset() view returns (address)",
  "function approve(address spender,uint256 amount) returns (bool)",
]);
interface EnsoExecutionOptions extends EvmExecutionOptions {
  readonly enso: EnsoOptions;
}
const contracts = async (
  options: EnsoExecutionOptions,
  input: TradeInput,
  blockNumber: bigint
): Promise<string> => {
  if (input.position === null || input.network !== "eip155:1") {
    throw new Error("trade.position: Ethereum vault position required.");
  }
  const shortcuts = await options.client.readContract({
    address: ENSO_ROUTER,
    abi: CONTRACTS,
    functionName: "shortcuts",
    blockNumber,
  });
  const [executor, asset] = await Promise.all([
    options.client.readContract({
      address: shortcuts,
      abi: CONTRACTS,
      functionName: "executor",
      blockNumber,
    }),
    options.client.readContract({
      address: getAddress(input.position),
      abi: CONTRACTS,
      functionName: "asset",
      blockNumber,
    }),
  ]);
  const underlying =
    input.action === "deposit" ? input.tokenIn : input.tokenOut;
  if (
    executor.toLowerCase() !== ENSO_ROUTER ||
    asset.toLowerCase() !== underlying.toLowerCase()
  ) {
    throw new Error(
      "trade.position: Enso executor or ERC-4626 underlying asset does not match."
    );
  }
  await Promise.all(
    [ENSO_ROUTER, shortcuts, input.position, underlying].map(
      async (address) => {
        const code = await options.client.getCode({
          address: getAddress(address),
          blockNumber,
        });
        if (code === undefined || code === "0x") {
          throw new Error("trade.deployment: a required contract has no code.");
        }
      }
    )
  );
  return shortcuts;
};

const approvalPayload = (
  input: TradeInput,
  amount: bigint,
  base: Extract<TradePayload, { kind: "evm" }>,
  nonce: number
): TradePayload => ({
  ...base,
  to: input.tokenIn,
  gasLimit: "100000",
  nonce,
  data: encodeFunctionData({
    abi: CONTRACTS,
    functionName: "approve",
    args: [ENSO_ROUTER, amount],
  }),
});

const prepare = async (options: EnsoExecutionOptions, input: TradeInput) => {
  await assertTradeNetwork(options.client, input.network);
  const blockNumber = await options.client.getBlockNumber({ cacheTime: 0 });
  const [route, shortcuts, nonce, fees, allowance] = await Promise.all([
    ensoRoute(options.enso, input),
    contracts(options, input, blockNumber),
    options.client.getTransactionCount({
      address: getAddress(input.wallet),
      blockTag: "pending",
    }),
    options.client.estimateFeesPerGas(),
    tradeAllowance(
      options.client,
      input.tokenIn,
      input.wallet,
      ENSO_ROUTER,
      blockNumber
    ),
  ]);
  validateEnsoRoute(input, route, shortcuts);
  if (
    BigInt(route.createdAt) > blockNumber ||
    blockNumber - BigInt(route.createdAt) > 5n
  ) {
    throw new Error("trade.quote_stale: Enso route block is not current.");
  }
  const gas = (BigInt(route.gas) * 12n) / 10n + 50_000n;
  if (gas > 2_000_000n) {
    throw new Error("trade.gas: Enso route exceeds the reviewed gas limit.");
  }
  const payload: Extract<TradePayload, { kind: "evm" }> = {
    kind: "evm",
    to: route.tx.to,
    data: route.tx.data,
    value: "0",
    nonce,
    gasLimit: gas.toString(),
    maxFeePerGas: fees.maxFeePerGas.toString(),
    maxPriorityFeePerGas: fees.maxPriorityFeePerGas.toString(),
  };
  const transactions: {
    kind: TradeStep["kind"];
    description: string;
    payload: TradePayload;
  }[] = [];
  if (allowance < BigInt(input.amount)) {
    if (allowance !== 0n) {
      transactions.push({
        kind: "approve",
        description: "Reset the existing Enso allowance",
        payload: approvalPayload(input, 0n, payload, nonce),
      });
    }
    transactions.push({
      kind: "approve",
      description: "Approve only this trade's input for Enso",
      payload: approvalPayload(
        input,
        BigInt(input.amount),
        payload,
        nonce + transactions.length
      ),
    });
  }
  transactions.push({
    kind: input.action === "deposit" ? "deposit" : "withdraw",
    description:
      input.action === "deposit"
        ? "Deposit assets into the selected ERC-4626 vault"
        : "Redeem vault shares into the underlying asset",
    payload: { ...payload, nonce: nonce + transactions.length },
  });
  const feeBound = transactions.reduce(
    (sum, transaction) =>
      sum +
      (transaction.payload.kind === "evm"
        ? BigInt(transaction.payload.gasLimit) *
          BigInt(transaction.payload.maxFeePerGas)
        : 0n),
    0n
  );
  if (feeBound > BigInt(input.maxNativeFee)) {
    throw new Error(
      "trade.gas: Enso transactions exceed the native fee budget."
    );
  }
  const now = options.now();
  const steps = transactions.map((transaction) =>
    Schema.decodeUnknownSync(TradeStep)({
      ...transaction,
      id: TradeStepId.generate(),
      fingerprint: new Bun.CryptoHasher("sha256")
        .update(JSON.stringify({ input, payload: transaction.payload }))
        .digest("hex"),
      expiresAt: now + 60_000,
      status: "awaiting_approval",
      approvalId: ApprovalId.generate(),
      authorizedAt: null,
      ruleId: null,
      transactionId: null,
      signedPayload: null,
      submittedAt: null,
      confirmedAt: null,
      actualNativeFee: null,
      error: null,
      simulation: {
        status: "unavailable",
        provider: "tenderly",
        observedAt: now,
        block: blockNumber.toString(),
        gasUnits: "0",
        assetChanges: [],
        error: null,
        stubbed: false,
      },
    })
  );
  const results = await simulateEvmTrade(
    options,
    input,
    steps,
    route.minAmountOut
  );
  return {
    steps: steps.map((step, index) => ({
      ...step,
      simulation: results[index] ?? step.simulation,
    })),
    expectedOutput: route.amountOut,
    minimumOutput: route.minAmountOut,
  };
};

export const ensoExecution = (options: EnsoExecutionOptions): TradeBackend => ({
  stubbed: false,
  prepare: async (input) => await prepare(options, input),
  simulate: async (trade: Trade) =>
    await simulateEvmTrade(
      options,
      trade.input,
      trade.steps.filter((step) =>
        ["prepared", "awaiting_approval"].includes(step.status)
      ),
      trade.minimumOutput ?? "0"
    ),
  balances: evmTradeBalances(options),
  submission: evmTradeSubmission(options),
});
