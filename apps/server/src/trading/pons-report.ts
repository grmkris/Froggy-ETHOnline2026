/**
 * Read-only Pons research reads, separate from the execution reader on purpose.
 *
 * `readPonsSnapshot` refuses everything a trade must not be built on: a closed
 * curve, a pool with no active liquidity, a phase it does not support. Those
 * refusals are correct before signing and wrong for research, where "this curve
 * is closed" is the answer rather than an error. Rather than loosen the checks
 * that stand in front of the signer, this file asks the same contracts the same
 * questions and reports what it finds.
 *
 * Nothing here builds calldata, and nothing here is an input to a trade.
 */

import { getAddress, keccak256 } from "viem";
import type { Address } from "viem";

import { assertTradeNetwork } from "./evm-chain";
import type { TradeEvmClient } from "./evm-chain";
import { PONS_NETWORK } from "./networks";
import { PONS_ABI, PONS_DEPLOYMENTS, ponsPoolId } from "./pons";
import type { PonsPool } from "./pons";

const LIMITATIONS = [
  "Chain state at one pinned block. It says nothing about who holds the token, how it was distributed, or whether an exit executes at size.",
  "Reserves and liquidity are contract state, not a quote. Graduated liquidity is the active-range equivalent in USDG units, not total pool value.",
  "Fee and tax figures are basis points read from the curve. A launch can still carry costs that are not expressed there.",
];

interface PonsLaunch {
  readonly curve: string;
  readonly deployer: string;
  readonly creatorFeeRecipient: string;
  readonly pairToken: string;
  readonly graduationThreshold: string;
  readonly poolFee: number;
  readonly tickSpacing: number;
  readonly creatorTaxBps: number;
  readonly buybackEnabled: boolean;
  readonly phase: "curve" | "graduated" | "other";
  readonly rawPhase: number;
  readonly sweptQuote: string;
  readonly sweptTokens: string;
  readonly sweptAt: string;
}
interface PonsCurve {
  readonly quoteReserve: string;
  readonly tokenReserve: string;
  readonly realQuoteReserve: string;
  readonly sellableTokens: string;
  readonly feeBps: string;
  readonly creatorTaxBps: string;
  readonly readyToGraduate: boolean;
  readonly graduated: boolean;
}
interface PonsPoolState {
  readonly id: string;
  readonly currency0: string;
  readonly currency1: string;
  readonly fee: number;
  readonly tickSpacing: number;
  readonly hooks: string;
  readonly sqrtPriceX96: string;
  readonly tick: number;
  readonly liquidity: string;
}
interface PonsReport {
  readonly v: 1;
  readonly operation: "pons_token";
  readonly network: string;
  readonly stubbed: boolean;
  readonly observedAt: number;
  readonly token: string;
  readonly block: {
    readonly number: string;
    readonly hash: string;
    readonly timestamp: number;
  } | null;
  /** Every reviewed Pons dependency still matches its recorded runtime hash. */
  readonly deployments: "verified" | "changed";
  readonly changedDependencies: readonly string[];
  readonly launch: PonsLaunch | null;
  readonly curve: PonsCurve | null;
  readonly pool: PonsPoolState | null;
  readonly notes: readonly string[];
  readonly limitations: readonly string[];
}

export interface PonsReports {
  readonly stubbed: boolean;
  readonly read: (token: string) => Promise<PonsReport>;
}

const phaseOf = (raw: number): PonsLaunch["phase"] => {
  if (raw === 0) {
    return "curve";
  }
  return raw === 2 ? "graduated" : "other";
};

/**
 * Independent of the execution path's `verifyDeployments`, which throws. Here a
 * changed dependency is reported, because a reader that silently answered from
 * a swapped contract would be worse than one that says the ground moved.
 */
const changedDependencies = async (
  client: TradeEvmClient,
  blockNumber: bigint
): Promise<readonly string[]> => {
  const checks = await Promise.all(
    Object.entries(PONS_DEPLOYMENTS).map(async ([name, deployment]) => {
      const code = await client.getCode({
        address: deployment.address,
        blockNumber,
      });
      return code === undefined || keccak256(code) !== deployment.hash
        ? name
        : null;
    })
  );
  return checks.filter((name): name is string => name !== null);
};

const curveOf = async (
  client: TradeEvmClient,
  curve: Address,
  blockNumber: bigint
): Promise<PonsCurve> => {
  const common = { address: curve, abi: PONS_ABI, blockNumber } as const;
  const [
    reserves,
    realQuoteReserve,
    sellableTokens,
    feeBps,
    creatorTaxBps,
    readyToGraduate,
    graduated,
  ] = await Promise.all([
    client.readContract({ ...common, functionName: "getReserves" }),
    client.readContract({ ...common, functionName: "realQuoteReserve" }),
    client.readContract({ ...common, functionName: "sellableTokens" }),
    client.readContract({ ...common, functionName: "feeBps" }),
    client.readContract({ ...common, functionName: "creatorTaxBps" }),
    client.readContract({ ...common, functionName: "readyToGraduate" }),
    client.readContract({ ...common, functionName: "graduated" }),
  ]);
  return {
    quoteReserve: reserves[0].toString(),
    tokenReserve: reserves[1].toString(),
    realQuoteReserve: realQuoteReserve.toString(),
    sellableTokens: sellableTokens.toString(),
    feeBps: feeBps.toString(),
    creatorTaxBps: creatorTaxBps.toString(),
    readyToGraduate,
    graduated,
  };
};

export const livePonsReports = (
  client: TradeEvmClient,
  now: () => number
): PonsReports => ({
  stubbed: false,
  read: async (input) => {
    const token = getAddress(input);
    await assertTradeNetwork(client, PONS_NETWORK);
    const block = await client.getBlock();
    if (block.hash === null) {
      throw new Error("pons.snapshot: the chain head has no hash.");
    }
    const base = {
      v: 1,
      operation: "pons_token",
      network: PONS_NETWORK,
      stubbed: false,
      observedAt: now(),
      token,
      block: {
        number: block.number.toString(),
        hash: block.hash,
        timestamp: Number(block.timestamp),
      },
      limitations: LIMITATIONS,
    } as const;
    const changed = await changedDependencies(client, block.number);
    if (changed.length > 0) {
      return {
        ...base,
        deployments: "changed",
        changedDependencies: changed,
        launch: null,
        curve: null,
        pool: null,
        notes: [
          "A reviewed Pons dependency no longer matches its recorded runtime hash. Nothing further was read, because a reading taken through a changed contract would not mean what it says.",
        ],
      };
    }
    const record = await client.readContract({
      address: PONS_DEPLOYMENTS.factory.address,
      abi: PONS_ABI,
      functionName: "getLaunchedToken",
      args: [token],
      blockNumber: block.number,
    });
    if (!record.exists) {
      return {
        ...base,
        deployments: "verified",
        changedDependencies: [],
        launch: null,
        curve: null,
        pool: null,
        notes: [
          "The Pons V2 factory has no launch registered for this address. It may be an ordinary token on Robinhood, a launch from another venue, or not a token at all; this read does not distinguish those.",
        ],
      };
    }
    const quote = PONS_DEPLOYMENTS.quote.address;
    const phase = phaseOf(record.phase);
    const launch: PonsLaunch = {
      curve: record.curve,
      deployer: record.deployer,
      creatorFeeRecipient: record.creatorFeeRecipient,
      pairToken: record.pairToken,
      graduationThreshold: record.graduationThreshold.toString(),
      poolFee: record.poolFee,
      tickSpacing: record.tickSpacing,
      creatorTaxBps: record.creatorTaxBps,
      buybackEnabled: record.buybackEnabled,
      phase,
      rawPhase: record.phase,
      sweptQuote: record.sweptQuote.toString(),
      sweptTokens: record.sweptTokens.toString(),
      sweptAt: record.sweptAt.toString(),
    };
    const notes: string[] = [];
    if (record.pairToken.toLowerCase() !== quote.toLowerCase()) {
      notes.push(
        "This launch is not paired against the canonical USDG quote token, so its curve and pool figures are denominated in something else."
      );
    }
    let curve: PonsCurve | null = null;
    let pool: PonsPoolState | null = null;
    if (phase === "curve") {
      curve = await curveOf(client, record.curve, block.number);
      if (curve.graduated || curve.readyToGraduate) {
        notes.push(
          "The factory still reports the curve phase while the curve reports itself graduated or ready to graduate. Treat the phase as in transition."
        );
      }
      if (curve.sellableTokens === "0") {
        notes.push(
          "The curve reports no sellable tokens at this block. No exit is assumed available."
        );
      }
    } else if (phase === "graduated") {
      // The same key and the same hashing the execution path uses. A second
      // encoding here would be free to drift from the one that gets signed.
      const key: PonsPool = {
        currency0: token.toLowerCase() < quote.toLowerCase() ? token : quote,
        currency1: token.toLowerCase() < quote.toLowerCase() ? quote : token,
        fee: record.poolFee,
        tickSpacing: record.tickSpacing,
        hooks: PONS_DEPLOYMENTS.hook.address,
      };
      const id = ponsPoolId(key);
      const [slot, liquidity] = await Promise.all([
        client.readContract({
          address: PONS_DEPLOYMENTS.state.address,
          abi: PONS_ABI,
          functionName: "getSlot0",
          args: [id],
          blockNumber: block.number,
        }),
        client.readContract({
          address: PONS_DEPLOYMENTS.state.address,
          abi: PONS_ABI,
          functionName: "getLiquidity",
          args: [id],
          blockNumber: block.number,
        }),
      ]);
      pool = {
        id,
        currency0: key.currency0,
        currency1: key.currency1,
        fee: record.poolFee,
        tickSpacing: record.tickSpacing,
        hooks: PONS_DEPLOYMENTS.hook.address,
        sqrtPriceX96: slot[0].toString(),
        tick: slot[1],
        liquidity: liquidity.toString(),
      };
      if (slot[0] === 0n || liquidity === 0n) {
        notes.push(
          "The graduated pool reports no active liquidity at this block. No exit is assumed available."
        );
      }
    } else {
      notes.push(
        `The factory reports phase ${record.phase}, which is neither the curve nor a graduated pool. No curve or pool state was read.`
      );
    }
    return {
      ...base,
      deployments: "verified",
      changedDependencies: [],
      launch,
      curve,
      pool,
      notes,
    };
  },
});

export const stubPonsReports = (now: () => number): PonsReports => ({
  stubbed: true,
  read: async (input) => {
    await Promise.resolve();
    return {
      v: 1,
      operation: "pons_token",
      network: PONS_NETWORK,
      stubbed: true,
      observedAt: now(),
      token: getAddress(input),
      block: null,
      deployments: "verified",
      changedDependencies: [],
      launch: null,
      curve: null,
      pool: null,
      notes: [
        "No Robinhood RPC endpoint is configured. Nothing was read from any chain and none of these fields describe this token.",
      ],
      limitations: LIMITATIONS,
    };
  },
});
