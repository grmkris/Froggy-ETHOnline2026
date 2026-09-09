import type { TradeInput } from "@froggy/domain";
import { address } from "@solana/kit";

import { jupiterMint, WRAPPED_SOL } from "./jupiter";
import {
  SOLANA_PROGRAMS,
  solanaAssociatedAccount,
} from "./solana-transactions";
import type {
  ResolvedSolanaTrade,
  SolanaTradeInstruction,
} from "./solana-transactions";

// Layout and enum indices from jup-ag/jupiter-amm-implementation,
// idls/jupiter_aggregator_v6.json. Unknown variants require a separate review.
const ROUTE = Buffer.from([229, 23, 203, 151, 122, 227, 173, 42]);
const SHARED = Buffer.from([193, 32, 155, 51, 65, 214, 156, 129]);
const SWAPS = new Set([7, 19, 25, 26, 38, 40, 46, 77]);
const EVENT_AUTHORITY = "D8cy77BBepLMngZx6ZukaTff5hCt1HrWyKk3Hnd9oitf";

const decodeRoute = (data: Buffer) => {
  const discriminator = data.subarray(0, 8);
  const shared = discriminator.equals(SHARED);
  const offset = shared ? 9 : 8;
  if (
    (!shared && !discriminator.equals(ROUTE)) ||
    data.length < offset + 4 + 19
  ) {
    throw new Error(
      "trade.route: Jupiter instruction variant has not been reviewed."
    );
  }
  const count = data.readUInt32LE(offset);
  if (count < 1 || count > 4 || data.length !== offset + 4 + count * 4 + 19) {
    throw new Error(
      "trade.route: only a bounded, completely decoded Jupiter path is supported."
    );
  }
  for (let index = 0; index < count; index += 1) {
    const start = offset + 4 + index * 4;
    if (
      !SWAPS.has(data[start] ?? -1) ||
      data[start + 1] !== 100 ||
      data[start + 2] !== index ||
      data[start + 3] !== index + 1
    ) {
      throw new Error(
        "trade.route: Jupiter path uses an unsupported pool variant or split."
      );
    }
  }
  const end = offset + 4 + count * 4;
  return {
    shared,
    amount: data.readBigUInt64LE(end),
    output: data.readBigUInt64LE(end + 8),
    slippageBps: data.readUInt16LE(end + 16),
    feeBps: data[end + 18] ?? 255,
  };
};

interface RouteAccounts {
  readonly source: string;
  readonly destination: string;
  readonly wrapped: string;
}
const validateRoute = (
  input: TradeInput,
  minimumOutput: string,
  instruction: SolanaTradeInstruction,
  expected: RouteAccounts
): number => {
  const route = decodeRoute(instruction.data);
  const minimum = (route.output * BigInt(10_000 - route.slippageBps)) / 10_000n;
  // Reserve output protection even when the platform fee is charged in output.
  const netMinimum = (minimum * BigInt(10_000 - route.feeBps)) / 10_000n;
  if (
    route.amount !== BigInt(input.amount) ||
    route.slippageBps > input.slippageBps ||
    netMinimum < BigInt(minimumOutput)
  ) {
    throw new Error(
      "trade.route: encoded Jupiter amounts, fees or minimum output differ from approval."
    );
  }
  const { accounts } = instruction;
  const pairs: readonly (readonly [number, string])[] = route.shared
    ? [
        [0, SOLANA_PROGRAMS.token],
        [2, input.wallet],
        [3, expected.source],
        [6, expected.destination],
        [7, jupiterMint(input.tokenIn)],
        [8, jupiterMint(input.tokenOut)],
        [11, EVENT_AUTHORITY],
        [12, SOLANA_PROGRAMS.jupiter],
      ]
    : [
        [0, SOLANA_PROGRAMS.token],
        [1, input.wallet],
        [2, expected.source],
        [3, expected.destination],
        [5, jupiterMint(input.tokenOut)],
        [7, EVENT_AUTHORITY],
        [8, SOLANA_PROGRAMS.jupiter],
      ];
  if (
    pairs.some(([index, value]) => accounts[index] !== value) ||
    (!route.shared &&
      accounts[4] !== SOLANA_PROGRAMS.jupiter &&
      accounts[4] !== expected.destination)
  ) {
    throw new Error(
      "trade.route: Jupiter authority, mints or token recipients differ from approval."
    );
  }
  return route.feeBps;
};

const validateAssociated = (
  input: TradeInput,
  instruction: SolanaTradeInstruction,
  expected: RouteAccounts
): string => {
  const [payer, target, owner, mint, system, token] = instruction.accounts;
  const targetMatches =
    (target === expected.source && mint === jupiterMint(input.tokenIn)) ||
    (target === expected.destination && mint === jupiterMint(input.tokenOut));
  if (
    instruction.accounts.length !== 6 ||
    payer !== input.wallet ||
    owner !== input.wallet ||
    !targetMatches ||
    system !== SOLANA_PROGRAMS.system ||
    token !== SOLANA_PROGRAMS.token ||
    !(
      instruction.data.length === 0 ||
      (instruction.data.length === 1 &&
        (instruction.data[0] === 0 || instruction.data[0] === 1))
    ) ||
    target === undefined
  ) {
    throw new Error(
      "trade.account_creation: only this owner's input or output associated account may be created."
    );
  }
  return target;
};

const validateTransfer = (
  input: TradeInput,
  instruction: SolanaTradeInstruction,
  expected: RouteAccounts
): void => {
  if (
    input.tokenIn !== "native" ||
    instruction.data.length !== 12 ||
    instruction.data.readUInt32LE(0) !== 2 ||
    instruction.data.readBigUInt64LE(4) !== BigInt(input.amount) ||
    instruction.accounts.length !== 2 ||
    instruction.accounts[0] !== input.wallet ||
    instruction.accounts[1] !== expected.wrapped
  ) {
    throw new Error(
      "trade.native_transfer: only the exact native input may fund the owner's wrapped SOL account."
    );
  }
};

const validateToken = (
  input: TradeInput,
  instruction: SolanaTradeInstruction,
  expected: RouteAccounts,
  swaps: number
): "sync" | "close" => {
  if (
    instruction.data.length !== 1 ||
    instruction.accounts[0] !== expected.wrapped
  ) {
    throw new Error("trade.token_instruction: unsupported token instruction.");
  }
  if (
    instruction.data[0] === 17 &&
    input.tokenIn === "native" &&
    swaps === 0 &&
    instruction.accounts.length === 1
  ) {
    return "sync";
  }
  if (
    instruction.data[0] === 9 &&
    swaps === 1 &&
    (input.tokenIn === "native" || input.tokenOut === "native") &&
    instruction.accounts.length === 3 &&
    instruction.accounts[1] === input.wallet &&
    instruction.accounts[2] === input.wallet
  ) {
    return "close";
  }
  throw new Error(
    "trade.token_instruction: authority changes, approvals and unrelated token transfers are forbidden."
  );
};

interface InstructionState {
  swaps: number;
  feeBps: number;
  transfers: number;
  syncs: number;
  closes: number;
  computeUnits: number;
  computePrice: bigint;
  readonly computeKinds: Set<number>;
  readonly created: Set<string>;
}
const validateCompute = (
  instruction: SolanaTradeInstruction,
  state: InstructionState
): void => {
  const kind = instruction.data[0] ?? -1;
  if (
    instruction.accounts.length !== 0 ||
    ![1, 2, 3, 4].includes(kind) ||
    state.computeKinds.has(kind) ||
    instruction.data.length !== (kind === 3 ? 9 : 5)
  ) {
    throw new Error(
      "trade.compute: invalid or duplicate compute-budget instruction."
    );
  }
  state.computeKinds.add(kind);
  if (kind === 2) {
    state.computeUnits = instruction.data.readUInt32LE(1);
  }
  if (kind === 3) {
    state.computePrice = instruction.data.readBigUInt64LE(1);
  }
};

const validateInstruction = (
  input: TradeInput,
  minimumOutput: string,
  instruction: SolanaTradeInstruction,
  expected: RouteAccounts,
  state: InstructionState
): void => {
  switch (instruction.program) {
    case SOLANA_PROGRAMS.compute: {
      validateCompute(instruction, state);
      return;
    }
    case SOLANA_PROGRAMS.jupiter: {
      state.feeBps = validateRoute(input, minimumOutput, instruction, expected);
      state.swaps += 1;
      return;
    }
    case SOLANA_PROGRAMS.associated: {
      const target = validateAssociated(input, instruction, expected);
      if (state.swaps !== 0 || state.created.has(target)) {
        throw new Error("trade.sequence: repeated or late account creation.");
      }
      state.created.add(target);
      return;
    }
    case SOLANA_PROGRAMS.system: {
      if (state.swaps !== 0) {
        throw new Error(
          "trade.sequence: native funding must precede the swap."
        );
      }
      validateTransfer(input, instruction, expected);
      state.transfers += 1;
      return;
    }
    case SOLANA_PROGRAMS.token: {
      const kind = validateToken(input, instruction, expected, state.swaps);
      if (kind === "sync") {
        state.syncs += 1;
      } else {
        state.closes += 1;
      }
      return;
    }
    default: {
      throw new Error(
        "trade.program: an unreviewed top-level Solana program cannot be signed."
      );
    }
  }
};

export const validateJupiterTransaction = async (
  input: TradeInput,
  minimumOutput: string,
  decoded: ResolvedSolanaTrade
) => {
  if (
    input.tokenIn === input.tokenOut ||
    input.tokenIn === WRAPPED_SOL ||
    input.tokenOut === WRAPPED_SOL ||
    decoded.transaction.signatures[address(input.wallet)] !== null
  ) {
    throw new Error(
      "trade.assets: choose distinct assets and use native for SOL; orders must be unsigned."
    );
  }
  const [source, destination, wrapped] = await Promise.all([
    solanaAssociatedAccount(input.wallet, jupiterMint(input.tokenIn)),
    solanaAssociatedAccount(input.wallet, jupiterMint(input.tokenOut)),
    solanaAssociatedAccount(input.wallet, WRAPPED_SOL),
  ]);
  const expected = { source, destination, wrapped };
  const state: InstructionState = {
    swaps: 0,
    feeBps: 0,
    transfers: 0,
    syncs: 0,
    closes: 0,
    computeUnits: 0,
    computePrice: 0n,
    computeKinds: new Set(),
    created: new Set(),
  };
  for (const instruction of decoded.instructions) {
    validateInstruction(input, minimumOutput, instruction, expected, state);
  }
  if (
    state.swaps !== 1 ||
    state.computeUnits < 1 ||
    state.computeUnits > 1_400_000 ||
    state.transfers !== Number(input.tokenIn === "native") ||
    state.syncs !== Number(input.tokenIn === "native") ||
    state.closes !==
      Number(input.tokenIn === "native" || input.tokenOut === "native")
  ) {
    throw new Error(
      "trade.instructions: missing, repeated or excessive swap, wrapping or compute instructions."
    );
  }
  return {
    ...expected,
    computeUnits: state.computeUnits,
    feeBps: state.feeBps,
    priorityFee:
      (BigInt(state.computeUnits) * state.computePrice + 999_999n) / 1_000_000n,
    created: [...state.created],
  };
};
export type JupiterTransactionBounds = Awaited<
  ReturnType<typeof validateJupiterTransaction>
>;
