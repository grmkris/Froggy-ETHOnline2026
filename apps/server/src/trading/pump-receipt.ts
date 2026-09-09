import type { Trade, TradeStep } from "@froggy/domain";

import { WRAPPED_SOL } from "./jupiter";
import { pumpFlows } from "./pump-flows";
import { PUMP_PROGRAMS } from "./pump-state";
import type { SolanaTradeReceipt, SolanaTradeRpc } from "./solana-chain";
import {
  decodeSolanaTrade,
  solanaAssociatedAccount,
  verifySignedSolanaTrade,
} from "./solana-transactions";

const receiptAccounts = (
  decoded: ReturnType<typeof decodeSolanaTrade>,
  receipt: SolanaTradeReceipt
): readonly string[] => {
  const writable = receipt.meta.loadedAddresses?.writable ?? [];
  const readonly = receipt.meta.loadedAddresses?.readonly ?? [];
  const lookups = decoded.compiled.addressTableLookups ?? [];
  if (
    writable.length !==
      lookups.reduce((total, row) => total + row.writableIndexes.length, 0) ||
    readonly.length !==
      lookups.reduce((total, row) => total + row.readonlyIndexes.length, 0)
  ) {
    throw new Error("trade.receipt: address lookup evidence is incomplete.");
  }
  const accounts = [
    ...decoded.compiled.staticAccounts,
    ...writable,
    ...readonly,
  ];
  if (
    new Set(accounts).size !== accounts.length ||
    accounts.length !== receipt.meta.preBalances.length ||
    accounts.length !== receipt.meta.postBalances.length
  ) {
    throw new Error("trade.receipt: native account balances are incomplete.");
  }
  return accounts;
};
const tokenChange = (
  receipt: SolanaTradeReceipt,
  accounts: readonly string[],
  key: string,
  owner: string,
  mint: string
): bigint => {
  const index = accounts.indexOf(key);
  const sum = (
    balances: SolanaTradeReceipt["meta"]["preTokenBalances"]
  ): bigint => {
    const rows = balances.filter((row) => row.accountIndex === index);
    if (
      index === -1 ||
      rows.some((row) => row.owner !== owner || row.mint !== mint)
    ) {
      throw new Error(
        "trade.receipt: token ownership or mint evidence is incomplete."
      );
    }
    return rows.reduce(
      (total, row) => total + BigInt(row.uiTokenAmount.amount),
      0n
    );
  };
  return (
    sum(receipt.meta.postTokenBalances) - sum(receipt.meta.preTokenBalances)
  );
};

const recipientBindings = (
  phase: "curve" | "graduated",
  buy: boolean,
  key: (index: number) => string,
  wrapped: string,
  tokenAccount: string
) => {
  let principalRecipients: readonly string[];
  const rentAccounts = new Map<string, number>();
  if (phase === "curve") {
    const creatorVault = key(buy ? 9 : 8);
    principalRecipients = [key(3), key(1), creatorVault];
    rentAccounts.set(creatorVault, 0);
    if (buy) {
      rentAccounts.set(key(13), 512);
    }
  } else {
    principalRecipients = [key(8), key(10), key(17)];
    for (const account of [wrapped, key(10), key(17)]) {
      rentAccounts.set(account, 165);
    }
    if (buy) {
      rentAccounts.set(key(20), 512);
    }
  }
  rentAccounts.set(tokenAccount, 256);
  return { principalRecipients, rentAccounts };
};

const bindings = async (
  trade: Trade,
  decoded: ReturnType<typeof decodeSolanaTrade>,
  accounts: readonly string[]
) => {
  const { input, phase } = trade;
  if (phase !== "curve" && phase !== "graduated") {
    throw new Error("trade.phase: the saved native launch phase is missing.");
  }
  const buy = input.tokenIn === "native";
  const program = phase === "curve" ? PUMP_PROGRAMS.curve : PUMP_PROGRAMS.amm;
  const matching = decoded.compiled.instructions.flatMap(
    (instruction, index) =>
      accounts[instruction.programAddressIndex] === program
        ? [{ instruction, index }]
        : []
  );
  const [native] = matching;
  if (matching.length !== 1 || native === undefined) {
    throw new Error(
      "trade.receipt: native swap instruction evidence is incomplete."
    );
  }
  const keys = (native.instruction.accountIndices ?? []).map(
    (index) => accounts[index]
  );
  const key = (index: number): string => {
    const value = keys[index];
    if (value === undefined) {
      throw new Error("trade.receipt: native account identity is missing.");
    }
    return value;
  };
  let tokenIndex = 11;
  if (phase === "curve") {
    tokenIndex = buy ? 8 : 9;
  }
  const tokenProgram = key(tokenIndex);
  const mint = buy ? input.tokenOut : input.tokenIn;
  const [tokenAccount, wrapped] = await Promise.all([
    solanaAssociatedAccount(input.wallet, mint, tokenProgram),
    solanaAssociatedAccount(input.wallet, WRAPPED_SOL),
  ]);
  if (
    key(5) !== tokenAccount ||
    key(phase === "curve" ? 6 : 1) !== input.wallet ||
    key(phase === "curve" ? 2 : 3) !== mint
  ) {
    throw new Error(
      "trade.receipt: native token, owner or destination differs from the saved proposal."
    );
  }
  const { principalRecipients, rentAccounts } = recipientBindings(
    phase,
    buy,
    key,
    wrapped,
    tokenAccount
  );
  return {
    state: {
      phase,
      tokenProgram,
      pool: phase === "graduated" ? { quoteAccount: key(8) } : null,
    },
    bounds: {
      index: native.index,
      tokenAccount,
      wrapped,
      principalRecipients,
      rentAccounts,
    },
  };
};

const wrappedRefund = (
  receipt: SolanaTradeReceipt,
  accounts: readonly string[],
  wrapped: string,
  phase: "curve" | "graduated"
): bigint => {
  if (phase !== "graduated") {
    return 0n;
  }
  const index = accounts.indexOf(wrapped);
  const before = BigInt(receipt.meta.preBalances[index] ?? -1);
  if (before < 0n || receipt.meta.postBalances[index] !== 0) {
    throw new Error("trade.receipt: wrapped native balances are incomplete.");
  }
  return before;
};

/** Reconciliation reads the finalized transaction, never today's launch phase or mutable quote API. */
export const pumpSettlement = async (
  rpc: SolanaTradeRpc,
  trade: Trade,
  step: TradeStep,
  now: () => number
) => {
  if (
    step.transactionId === null ||
    step.signedPayload === null ||
    step.payload.kind !== "solana"
  ) {
    throw new Error(
      "trade.identity: saved native transaction identity is missing."
    );
  }
  await rpc.assertNetwork(trade.input.network);
  const receipt = await rpc.receipt(step.transactionId);
  if (receipt === null) {
    return { state: "pending" as const };
  }
  const checked = await verifySignedSolanaTrade(
    trade.input.wallet,
    step.payload.transaction,
    receipt.transaction[0]
  );
  if (
    checked.transactionId !== step.transactionId ||
    receipt.transaction[0] !== step.signedPayload
  ) {
    throw new Error(
      "trade.receipt: finalized native bytes differ from the saved signature."
    );
  }
  const networkFee = BigInt(receipt.meta.fee);
  if (receipt.meta.err !== null) {
    return {
      state: "reverted" as const,
      nativeFee: networkFee.toString(),
      actualInput: "0",
      output: null,
      at: now(),
    };
  }
  const decoded = decodeSolanaTrade(
    step.payload.transaction,
    trade.input.wallet
  );
  const accounts = receiptAccounts(decoded, receipt);
  const { state, bounds } = await bindings(trade, decoded, accounts);
  const flows = pumpFlows(
    trade.input,
    state,
    bounds,
    accounts,
    receipt.meta.innerInstructions
  );
  const [before] = receipt.meta.preBalances;
  const [after] = receipt.meta.postBalances;
  if (before === undefined || after === undefined) {
    throw new Error("trade.receipt: owner native balances are unavailable.");
  }
  const nativeDelta = BigInt(after) - BigInt(before);
  const buy = trade.input.tokenIn === "native";
  const mint = buy ? trade.input.tokenOut : trade.input.tokenIn;
  const baseDelta = tokenChange(
    receipt,
    accounts,
    bounds.tokenAccount,
    trade.input.wallet,
    mint
  );
  const output = flows.output ?? nativeDelta + networkFee;
  const wrappedBefore = wrappedRefund(
    receipt,
    accounts,
    bounds.wrapped,
    state.phase
  );
  if (buy ? baseDelta !== output : baseDelta !== -flows.consumed) {
    throw new Error(
      "trade.receipt: native swap balances disagree with its transfers."
    );
  }
  const nativeFee = buy
    ? -nativeDelta - flows.consumed + wrappedBefore
    : output - nativeDelta + wrappedBefore;
  if (nativeFee < networkFee || output < 0n) {
    throw new Error(
      "trade.receipt: native fee or output accounting is incomplete."
    );
  }
  return {
    state: "confirmed" as const,
    nativeFee: nativeFee.toString(),
    actualInput: flows.consumed.toString(),
    output: output.toString(),
    at: now(),
  };
};
