import type { TradeInput } from "@froggy/domain";
import { address } from "@solana/kit";

import { WRAPPED_SOL } from "./jupiter";
import { pumpPda, PUMP_PROGRAMS } from "./pump-state";
import type { PumpState } from "./pump-state";
import {
  SOLANA_PROGRAMS,
  solanaAssociatedAccount,
} from "./solana-transactions";
import type {
  ResolvedSolanaTrade,
  SolanaTradeInstruction,
} from "./solana-transactions";

const BUY = Buffer.from([102, 6, 61, 18, 1, 218, 235, 234]);
const SELL = Buffer.from([51, 230, 133, 164, 1, 127, 131, 173]);
const CURVE_EXACT = Buffer.from([56, 252, 116, 8, 158, 223, 205, 95]);
const AMM_EXACT = Buffer.from([198, 46, 21, 82, 180, 217, 232, 112]);

const amounts = (
  input: TradeInput,
  minimum: string,
  instruction: SolanaTradeInstruction
) => {
  const buy = input.tokenIn === "native";
  const { data } = instruction;
  const discriminator = data.subarray(0, 8);
  const exact = discriminator.equals(
    instruction.program === PUMP_PROGRAMS.curve ? CURVE_EXACT : AMM_EXACT
  );
  if (
    data.length !== (buy ? 25 : 24) ||
    (buy
      ? !exact && !discriminator.equals(BUY)
      : !discriminator.equals(SELL)) ||
    (buy && data[24] !== 0 && data[24] !== 1)
  ) {
    throw new Error(
      "trade.pump_instruction: unsupported native instruction layout."
    );
  }
  const first = data.readBigUInt64LE(8);
  const second = data.readBigUInt64LE(16);
  const maximumInput = buy && !exact ? second : first;
  const minimumOutput = buy && !exact ? first : second;
  if (
    maximumInput <= 0n ||
    maximumInput > BigInt(input.amount) ||
    (!buy && maximumInput !== BigInt(input.amount)) ||
    minimumOutput < BigInt(minimum)
  ) {
    throw new Error(
      "trade.pump_amounts: the encoded input or output protection differs from approval."
    );
  }
  return { maximumInput, minimumOutput };
};

interface NativeBounds {
  readonly maximumInput: bigint;
  readonly minimumOutput: bigint;
  readonly rentAccounts: ReadonlyMap<string, number>;
  readonly principalRecipients: readonly string[];
}
const requirePairs = (
  instruction: SolanaTradeInstruction,
  count: number,
  pairs: readonly (readonly [number, string])[]
) => {
  if (
    instruction.accounts.length !== count ||
    pairs.some(([index, value]) => instruction.accounts[index] !== value)
  ) {
    throw new Error(
      "trade.pump_accounts: native authority, mints, pool or recipients differ from the verified route."
    );
  }
};
const curveBounds = async (
  input: TradeInput,
  minimum: string,
  instruction: SolanaTradeInstruction,
  state: PumpState,
  tokenAccount: string
): Promise<NativeBounds> => {
  const buy = input.tokenIn === "native";
  const [
    global,
    curveAccount,
    creatorVault,
    event,
    feeConfig,
    globalVolume,
    userVolume,
  ] = await Promise.all([
    pumpPda(PUMP_PROGRAMS.curve, "global"),
    solanaAssociatedAccount(state.curve, state.mint, state.tokenProgram),
    pumpPda(PUMP_PROGRAMS.curve, "creator-vault", [state.creator]),
    pumpPda(PUMP_PROGRAMS.curve, "__event_authority"),
    pumpPda(PUMP_PROGRAMS.fee, "fee_config", [PUMP_PROGRAMS.curve]),
    pumpPda(PUMP_PROGRAMS.curve, "global_volume_accumulator"),
    pumpPda(PUMP_PROGRAMS.curve, "user_volume_accumulator", [input.wallet]),
  ]);
  const pairs: (readonly [number, string])[] = [
    [0, global],
    [2, state.mint],
    [3, state.curve],
    [4, curveAccount],
    [5, tokenAccount],
    [6, input.wallet],
    [7, SOLANA_PROGRAMS.system],
    [buy ? 8 : 9, state.tokenProgram],
    [buy ? 9 : 8, creatorVault],
    [10, event],
    [11, PUMP_PROGRAMS.curve],
    [buy ? 14 : 12, feeConfig],
    [buy ? 15 : 13, PUMP_PROGRAMS.fee],
  ];
  if (buy) {
    pairs.push([12, globalVolume], [13, userVolume]);
  }
  requirePairs(instruction, buy ? 16 : 14, pairs);
  const feeRecipient = instruction.accounts.at(1);
  if (feeRecipient === undefined) {
    throw new Error("trade.pump_accounts: missing fee recipient.");
  }
  return {
    ...amounts(input, minimum, instruction),
    rentAccounts: new Map(
      buy
        ? [
            [tokenAccount, 256],
            [creatorVault, 0],
            [userVolume, 512],
          ]
        : [[creatorVault, 0]]
    ),
    principalRecipients: [state.curve, feeRecipient, creatorVault],
  };
};
const ammBounds = async (
  input: TradeInput,
  minimum: string,
  instruction: SolanaTradeInstruction,
  state: PumpState,
  tokenAccount: string,
  wrapped: string
): Promise<NativeBounds> => {
  const { pool } = state;
  const feeRecipient = instruction.accounts.at(9);
  if (pool === null || feeRecipient === undefined) {
    throw new Error(
      "trade.pump_accounts: missing pool or protocol fee recipient."
    );
  }
  const buy = input.tokenIn === "native";
  const [
    global,
    event,
    feeAccount,
    creatorVault,
    feeConfig,
    globalVolume,
    userVolume,
    poolBase,
    poolQuote,
  ] = await Promise.all([
    pumpPda(PUMP_PROGRAMS.amm, "global_config"),
    pumpPda(PUMP_PROGRAMS.amm, "__event_authority"),
    solanaAssociatedAccount(feeRecipient, WRAPPED_SOL),
    pumpPda(PUMP_PROGRAMS.amm, "creator_vault", [pool.creator]),
    pumpPda(PUMP_PROGRAMS.fee, "fee_config", [PUMP_PROGRAMS.amm]),
    pumpPda(PUMP_PROGRAMS.amm, "global_volume_accumulator"),
    pumpPda(PUMP_PROGRAMS.amm, "user_volume_accumulator", [input.wallet]),
    solanaAssociatedAccount(pool.address, state.mint, state.tokenProgram),
    solanaAssociatedAccount(pool.address, WRAPPED_SOL),
  ]);
  const creatorAccount = await solanaAssociatedAccount(
    creatorVault,
    WRAPPED_SOL
  );
  if (pool.baseAccount !== poolBase || pool.quoteAccount !== poolQuote) {
    throw new Error("trade.pump_pool: pool token accounts are not canonical.");
  }
  const pairs: (readonly [number, string])[] = [
    [0, pool.address],
    [1, input.wallet],
    [2, global],
    [3, state.mint],
    [4, WRAPPED_SOL],
    [5, tokenAccount],
    [6, wrapped],
    [7, poolBase],
    [8, poolQuote],
    [10, feeAccount],
    [11, state.tokenProgram],
    [12, SOLANA_PROGRAMS.token],
    [13, SOLANA_PROGRAMS.system],
    [14, SOLANA_PROGRAMS.associated],
    [15, event],
    [16, PUMP_PROGRAMS.amm],
    [17, creatorAccount],
    [18, creatorVault],
    [buy ? 21 : 19, feeConfig],
    [buy ? 22 : 20, PUMP_PROGRAMS.fee],
  ];
  if (buy) {
    pairs.push([19, globalVolume], [20, userVolume]);
  }
  requirePairs(instruction, buy ? 23 : 21, pairs);
  const rentAccounts = new Map([
    [wrapped, 165],
    [tokenAccount, 256],
    [feeAccount, 165],
    [creatorAccount, 165],
  ]);
  if (buy) {
    rentAccounts.set(userVolume, 512);
  }
  return {
    ...amounts(input, minimum, instruction),
    rentAccounts,
    principalRecipients: [poolQuote, feeAccount, creatorAccount],
  };
};

interface Walk {
  swaps: number;
  transfers: number;
  syncs: number;
  closes: number;
  computeUnits: number;
  computePrice: bigint;
  readonly budgets: Set<number>;
  readonly created: Set<string>;
}
const compute = (instruction: SolanaTradeInstruction, walk: Walk): void => {
  const kind = instruction.data[0] ?? -1;
  if (
    walk.swaps !== 0 ||
    instruction.accounts.length !== 0 ||
    ![1, 2, 3, 4].includes(kind) ||
    walk.budgets.has(kind) ||
    instruction.data.length !== (kind === 3 ? 9 : 5)
  ) {
    throw new Error("trade.compute: invalid or duplicate compute instruction.");
  }
  walk.budgets.add(kind);
  if (kind === 2) {
    walk.computeUnits = instruction.data.readUInt32LE(1);
  }
  if (kind === 3) {
    walk.computePrice = instruction.data.readBigUInt64LE(1);
  }
};
const associated = (
  instruction: SolanaTradeInstruction,
  input: TradeInput,
  state: PumpState,
  tokenAccount: string,
  wrapped: string,
  walk: Walk
): void => {
  const [payer, target, owner, mint, system, program] = instruction.accounts;
  const base =
    target === tokenAccount &&
    mint === state.mint &&
    program === state.tokenProgram;
  const quote =
    state.phase === "graduated" &&
    target === wrapped &&
    mint === WRAPPED_SOL &&
    program === SOLANA_PROGRAMS.token;
  if (
    walk.swaps !== 0 ||
    instruction.accounts.length !== 6 ||
    target === undefined ||
    walk.created.has(target) ||
    payer !== input.wallet ||
    owner !== input.wallet ||
    system !== SOLANA_PROGRAMS.system ||
    (!base && !quote) ||
    !(
      instruction.data.length === 0 ||
      (instruction.data.length === 1 &&
        [0, 1].includes(instruction.data[0] ?? -1))
    )
  ) {
    throw new Error(
      "trade.account_creation: only the owner's required associated accounts may be created."
    );
  }
  walk.created.add(target);
};
const fundWrapped = (
  instruction: SolanaTradeInstruction,
  input: TradeInput,
  wrapped: string,
  bounds: NativeBounds,
  walk: Walk
): void => {
  const { data, accounts } = instruction;
  if (
    walk.swaps !== 0 ||
    input.tokenIn !== "native" ||
    accounts.length !== 2 ||
    accounts[0] !== input.wallet ||
    accounts[1] !== wrapped ||
    data.length !== 12 ||
    data.readUInt32LE(0) !== 2 ||
    data.readBigUInt64LE(4) !== bounds.maximumInput
  ) {
    throw new Error(
      "trade.native_transfer: only the encoded input cap may fund this owner's wrapped SOL account."
    );
  }
  walk.transfers += 1;
};

const wrapping = (
  instruction: SolanaTradeInstruction,
  input: TradeInput,
  wrapped: string,
  bounds: NativeBounds,
  walk: Walk
): void => {
  const { data, accounts } = instruction;
  if (instruction.program === SOLANA_PROGRAMS.system) {
    fundWrapped(instruction, input, wrapped, bounds, walk);
    return;
  }
  if (data.length !== 1 || accounts[0] !== wrapped) {
    throw new Error(
      "trade.token_instruction: unsupported root token instruction."
    );
  }
  if (
    data[0] === 17 &&
    input.tokenIn === "native" &&
    walk.swaps === 0 &&
    accounts.length === 1
  ) {
    walk.syncs += 1;
    return;
  }
  if (
    data[0] === 9 &&
    walk.swaps === 1 &&
    accounts.length === 3 &&
    accounts[1] === input.wallet &&
    accounts[2] === input.wallet
  ) {
    walk.closes += 1;
    return;
  }
  throw new Error(
    "trade.token_instruction: unrelated transfers, delegates and authority changes are forbidden."
  );
};

export const validatePumpTransaction = async (
  input: TradeInput,
  minimum: string,
  decoded: ResolvedSolanaTrade,
  state: PumpState
) => {
  if (
    decoded.transaction.signatures[address(input.wallet)] !== null ||
    (input.tokenIn === "native") === (input.tokenOut === "native")
  ) {
    throw new Error(
      "trade.signer: Pump orders must be unsigned native SOL buys or sells."
    );
  }
  const [tokenAccount, wrapped] = await Promise.all([
    solanaAssociatedAccount(input.wallet, state.mint, state.tokenProgram),
    solanaAssociatedAccount(input.wallet, WRAPPED_SOL),
  ]);
  const program =
    state.phase === "curve" ? PUMP_PROGRAMS.curve : PUMP_PROGRAMS.amm;
  const index = decoded.instructions.findIndex(
    (instruction) => instruction.program === program
  );
  const native = decoded.instructions[index];
  if (native === undefined) {
    throw new Error(
      "trade.pump_route: the observed launch phase has no matching instruction."
    );
  }
  const bounds =
    state.phase === "curve"
      ? await curveBounds(input, minimum, native, state, tokenAccount)
      : await ammBounds(input, minimum, native, state, tokenAccount, wrapped);
  const walk: Walk = {
    swaps: 0,
    transfers: 0,
    syncs: 0,
    closes: 0,
    computeUnits: 0,
    computePrice: 0n,
    budgets: new Set(),
    created: new Set(),
  };
  for (const instruction of decoded.instructions) {
    if (instruction.program === program) {
      walk.swaps += 1;
    } else if (instruction.program === SOLANA_PROGRAMS.compute) {
      compute(instruction, walk);
    } else if (instruction.program === SOLANA_PROGRAMS.associated) {
      associated(instruction, input, state, tokenAccount, wrapped, walk);
    } else if (
      state.phase === "graduated" &&
      [SOLANA_PROGRAMS.system, SOLANA_PROGRAMS.token].some(
        (value) => value === instruction.program
      )
    ) {
      wrapping(instruction, input, wrapped, bounds, walk);
    } else {
      throw new Error(
        "trade.program: an unreviewed root program or unrelated instruction cannot be signed."
      );
    }
  }
  const wrapInput = Number(
    state.phase === "graduated" && input.tokenIn === "native"
  );
  if (
    walk.swaps !== 1 ||
    walk.transfers !== wrapInput ||
    walk.syncs !== wrapInput ||
    walk.closes !== Number(state.phase === "graduated") ||
    walk.computeUnits < 1 ||
    walk.computeUnits > 1_400_000
  ) {
    throw new Error(
      "trade.instructions: missing, repeated or excessive swap, wrapping or compute instructions."
    );
  }
  return {
    ...bounds,
    tokenAccount,
    wrapped,
    index,
    computeUnits: walk.computeUnits,
    priorityFee:
      (BigInt(walk.computeUnits) * walk.computePrice + 999_999n) / 1_000_000n,
  };
};
