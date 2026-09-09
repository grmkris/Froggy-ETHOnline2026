import type { TradeInput } from "@froggy/domain";
import { getBase58Encoder } from "@solana/kit";

import type { SolanaInnerInstructions } from "./solana-chain";
import { SOLANA_PROGRAMS } from "./solana-transactions";

interface FlowState {
  readonly phase: "curve" | "graduated";
  readonly tokenProgram: string;
  readonly pool: { readonly quoteAccount: string } | null;
}
interface FlowBounds {
  readonly index: number;
  readonly tokenAccount: string;
  readonly wrapped: string;
  readonly principalRecipients: readonly string[];
  readonly rentAccounts: ReadonlyMap<string, number>;
}

interface TokenMove {
  readonly source: string;
  readonly destination: string;
  readonly amount: bigint;
}
const tokenMove = (data: Buffer, keys: readonly string[]): TokenMove | null => {
  const checked = data[0] === 12;
  if (!checked && data[0] !== 3) {
    return null;
  }
  if (data.length !== (checked ? 10 : 9) || keys.length < (checked ? 4 : 3)) {
    throw new Error("trade.transfer_evidence: malformed token transfer.");
  }
  const [source] = keys;
  const destination = keys[checked ? 2 : 1];
  if (source === undefined || destination === undefined) {
    throw new Error(
      "trade.transfer_evidence: missing token transfer accounts."
    );
  }
  return { source, destination, amount: data.readBigUInt64LE(1) };
};

interface Flows {
  baseIn: bigint;
  baseOut: bigint;
  quoteIn: bigint;
  quoteOut: bigint;
}
const recordToken = (
  move: TokenMove,
  program: string,
  state: FlowState,
  bounds: FlowBounds,
  flows: Flows
): void => {
  if (program === state.tokenProgram) {
    if (move.source === bounds.tokenAccount) {
      flows.baseIn += move.amount;
    }
    if (move.destination === bounds.tokenAccount) {
      flows.baseOut += move.amount;
    }
  }
  if (state.phase !== "graduated" || program !== SOLANA_PROGRAMS.token) {
    return;
  }
  if (move.source === bounds.wrapped) {
    if (!bounds.principalRecipients.includes(move.destination)) {
      throw new Error(
        "trade.transfer_evidence: wrapped SOL went to an unrelated recipient."
      );
    }
    flows.quoteIn += move.amount;
  }
  if (move.destination === bounds.wrapped) {
    if (move.source !== state.pool?.quoteAccount) {
      throw new Error(
        "trade.transfer_evidence: native proceeds came from an unrelated account."
      );
    }
    flows.quoteOut += move.amount;
  }
};

const recordNative = (
  input: TradeInput,
  state: FlowState,
  bounds: FlowBounds,
  bytes: Buffer,
  keys: readonly string[],
  flows: Flows
): void => {
  if (keys[0] !== input.wallet || bytes.length < 4) {
    return;
  }
  const kind = bytes.readUInt32LE(0);
  if (
    state.phase === "curve" &&
    input.tokenOut === "native" &&
    [0, 2].includes(kind)
  ) {
    throw new Error(
      "trade.transfer_evidence: native funding during a curve exit is unsupported."
    );
  }
  if (kind !== 2) {
    return;
  }
  const target = keys.at(1);
  if (bytes.length !== 12 || target === undefined) {
    throw new Error("trade.transfer_evidence: native transfer is incomplete.");
  }
  if (state.phase === "curve" && bounds.principalRecipients.includes(target)) {
    flows.quoteIn += bytes.readBigUInt64LE(4);
  } else if (!bounds.rentAccounts.has(target)) {
    throw new Error(
      "trade.transfer_evidence: native input reached an unrelated account."
    );
  }
};

/** CPI transfers carry consumed input, including protocol fees; account rent remains a native cost. */
export const pumpFlows = (
  input: TradeInput,
  state: FlowState,
  bounds: FlowBounds,
  accounts: readonly string[],
  evidence: SolanaInnerInstructions | null | undefined
) => {
  const groups =
    evidence?.filter((group) => group.index === bounds.index) ?? [];
  const [group] = groups;
  if (groups.length !== 1 || group === undefined) {
    throw new Error(
      "trade.transfer_evidence: native swap transfer evidence is unavailable."
    );
  }
  const flows: Flows = { baseIn: 0n, baseOut: 0n, quoteIn: 0n, quoteOut: 0n };
  for (const instruction of group.instructions) {
    const program = accounts[instruction.programIdIndex];
    const keys = instruction.accounts.map((index) => {
      const key = accounts[index];
      if (key === undefined) {
        throw new Error(
          "trade.transfer_evidence: an account index is invalid."
        );
      }
      return key;
    });
    if (program === undefined) {
      throw new Error("trade.transfer_evidence: a program index is invalid.");
    }
    const bytes = Buffer.from(getBase58Encoder().encode(instruction.data));
    if (program === SOLANA_PROGRAMS.system) {
      recordNative(input, state, bounds, bytes, keys, flows);
    }
    if (program === SOLANA_PROGRAMS.token || program === state.tokenProgram) {
      const move = tokenMove(bytes, keys);
      if (move !== null) {
        recordToken(move, program, state, bounds, flows);
      }
    }
  }
  const buy = input.tokenIn === "native";
  if (
    (buy ? flows.baseIn !== 0n : flows.baseOut !== 0n) ||
    (!buy && flows.quoteIn !== 0n)
  ) {
    throw new Error(
      "trade.transfer_evidence: unexpected input or output transfers."
    );
  }
  let output: bigint | null = null;
  if (buy) {
    output = flows.baseOut;
  } else if (state.phase === "graduated") {
    output = flows.quoteOut;
  }
  return { consumed: buy ? flows.quoteIn : flows.baseIn, output };
};
