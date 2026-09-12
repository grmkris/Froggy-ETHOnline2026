/**
 * Rollup data-fee budget for OP Stack networks (Base, Base Sepolia).
 *
 * The signed EIP-1559 cap only bounds L2 execution gas. L1 data fees and
 * Isthmus operator fees sit outside that cap, so the approved `maxNativeFee`
 * is split: executionCap = Σ gasLimit×maxFeePerGas, and the remainder must
 * cover DATA_FEE_MARGIN × the GasPriceOracle estimate. Checked at prepare and
 * again immediately before sign. Settlement records the actual fees.
 *
 * Primary sources, retrieved 2026-09-12:
 * - OP Stack predeploys: https://specs.optimism.io/protocol/predeploys.html
 * - GasPriceOracle: https://specs.optimism.io/protocol/fjord/predeploys.html
 * - Isthmus operator fee: https://specs.optimism.io/protocol/isthmus/exec-engine.html
 * - viem `base` / `baseSepolia` `contracts.gasPriceOracle`
 */

import type { TradePayload } from "@froggy/domain";
import { getAddress, isHex, parseAbi } from "viem";
import { estimateL1Fee } from "viem/op-stack";

import type { TradeEvmClient } from "./evm-chain";

type EvmPayload = Extract<TradePayload, { kind: "evm" }>;

/** Multiplier on the oracle estimate so short-lived L1 fee moves stay inside the budget. */
export const DATA_FEE_MARGIN = 2n;

// OP Stack predeploy; identical on Base and Base Sepolia.
export const GAS_PRICE_ORACLE =
  "0x420000000000000000000000000000000000000F" as const;

const OPERATOR_FEE = parseAbi([
  "function getOperatorFee(uint256 _gasUsed) view returns (uint256)",
]);

const ROLLUP_NETWORKS: ReadonlySet<string> = new Set([
  "eip155:8453",
  "eip155:84532",
]);

export const isRollupNetwork = (network: string): boolean =>
  ROLLUP_NETWORKS.has(network);

export const executionFeeCap = (payloads: readonly EvmPayload[]): bigint =>
  payloads.reduce(
    (sum, payload) =>
      sum + BigInt(payload.gasLimit) * BigInt(payload.maxFeePerGas),
    0n
  );

const operatorFeeFor = async (
  client: TradeEvmClient,
  gasLimit: bigint
): Promise<bigint> => {
  try {
    return await client.readContract({
      address: GAS_PRICE_ORACLE,
      abi: OPERATOR_FEE,
      functionName: "getOperatorFee",
      args: [gasLimit],
    });
  } catch {
    // Pre-Isthmus oracles have no getOperatorFee; Base today returns 0.
    return 0n;
  }
};

/** L1 data fee plus Isthmus operator fee for one unsigned transaction; 0 on L1. */
export const estimateDataFee = async (
  client: TradeEvmClient,
  network: string,
  wallet: string,
  payload: EvmPayload
): Promise<bigint> => {
  if (!isRollupNetwork(network)) {
    return 0n;
  }
  if (!isHex(payload.data)) {
    throw new Error("trade.payload: expected hex calldata for a fee estimate.");
  }
  try {
    const [l1Fee, operatorFee] = await Promise.all([
      estimateL1Fee(client, {
        chain: null,
        account: getAddress(wallet),
        to: getAddress(payload.to),
        data: payload.data,
        value: BigInt(payload.value),
        gas: BigInt(payload.gasLimit),
        maxFeePerGas: BigInt(payload.maxFeePerGas),
        maxPriorityFeePerGas: BigInt(payload.maxPriorityFeePerGas),
        nonce: payload.nonce,
        gasPriceOracleAddress: GAS_PRICE_ORACLE,
      }),
      operatorFeeFor(client, BigInt(payload.gasLimit)),
    ]);
    return l1Fee + operatorFee;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("trade.payload:")) {
      throw error;
    }
    throw new Error(
      "trade.fee_bound: rollup data fee estimate is unavailable.",
      { cause: error }
    );
  }
};

/** Fail closed when execution + margined data fees exceed the remaining budget. */
export const assertNativeFeeBudget = async (options: {
  readonly client: TradeEvmClient;
  readonly network: string;
  readonly wallet: string;
  readonly payloads: readonly EvmPayload[];
  readonly maxNativeFee: string;
  readonly spent?: bigint;
}): Promise<void> => {
  const execution = executionFeeCap(options.payloads);
  const dataFees = await Promise.all(
    options.payloads.map(
      async (payload) =>
        await estimateDataFee(
          options.client,
          options.network,
          options.wallet,
          payload
        )
    )
  );
  const data = dataFees.reduce((sum, fee) => sum + fee, 0n);
  const spent = options.spent ?? 0n;
  if (
    spent + execution + DATA_FEE_MARGIN * data >
    BigInt(options.maxNativeFee)
  ) {
    throw new Error(
      "trade.fee_bound: execution and rollup data fee estimates exceed the approved native fee budget."
    );
  }
};
