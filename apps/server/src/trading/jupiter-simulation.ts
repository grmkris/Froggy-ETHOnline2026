import type { TradeInput, TradeSimulation } from "@froggy/domain";
import { getAddressDecoder } from "@solana/kit";

import { jupiterMint } from "./jupiter";
import { validateJupiterTransaction } from "./jupiter-transactions";
import type { JupiterTransactionBounds } from "./jupiter-transactions";
import type { SolanaTradeAccount, SolanaTradeRpc } from "./solana-chain";
import {
  resolveSolanaTrade,
  SOLANA_PROGRAMS,
  solanaTokenAccount,
} from "./solana-transactions";

type AccountSet = ReadonlyMap<string, SolanaTradeAccount | null>;
const requireAccount = (
  accounts: AccountSet,
  key: string
): SolanaTradeAccount | null => {
  const account = accounts.get(key);
  if (account === undefined) {
    throw new Error(
      "trade.accounts: a required account is absent from the snapshot."
    );
  }
  return account;
};
const walletLamports = (accounts: AccountSet, wallet: string): bigint => {
  const account = requireAccount(accounts, wallet);
  if (
    account === null ||
    account.owner !== SOLANA_PROGRAMS.system ||
    account.executable ||
    account.data[0] !== ""
  ) {
    throw new Error("trade.wallet: expected a system-owned Solana wallet.");
  }
  return BigInt(account.lamports);
};
const verifyMint = (accounts: AccountSet, mint: string): void => {
  const account = requireAccount(accounts, mint);
  const data = Buffer.from(account?.data[0] ?? "", "base64");
  if (
    account === null ||
    account.executable ||
    account.owner !== SOLANA_PROGRAMS.token ||
    data.length !== 82 ||
    data[45] !== 1
  ) {
    throw new Error(
      "trade.mint: only initialized legacy SPL mints are supported."
    );
  }
};
const protectOtherAssets = (
  input: TradeInput,
  before: AccountSet,
  after: AccountSet,
  bounds: JupiterTransactionBounds
): void => {
  for (const [key, account] of before) {
    if (
      account === null ||
      account.owner !== SOLANA_PROGRAMS.token ||
      key === bounds.source ||
      key === bounds.destination
    ) {
      continue;
    }
    const data = Buffer.from(account.data[0], "base64");
    if (
      data.length !== 165 ||
      getAddressDecoder().decode(data.subarray(32, 64)) !== input.wallet
    ) {
      continue;
    }
    const changed = after.get(key);
    if (
      changed === undefined ||
      changed === null ||
      JSON.stringify(account) !== JSON.stringify(changed)
    ) {
      throw new Error(
        "trade.simulation: an unrelated owner token account changed."
      );
    }
  }
};

const deltas = (
  input: TradeInput,
  before: AccountSet,
  after: AccountSet,
  bounds: JupiterTransactionBounds,
  networkFee: bigint,
  nativeFeeLimit: bigint,
  minimum: string
) => {
  const nativeBefore = walletLamports(before, input.wallet);
  const nativeAfter = walletLamports(after, input.wallet);
  const wrappedBefore =
    input.tokenIn === "native" || input.tokenOut === "native"
      ? BigInt(requireAccount(before, bounds.wrapped)?.lamports ?? 0)
      : 0n;
  const inputBefore =
    input.tokenIn === "native"
      ? nativeBefore
      : solanaTokenAccount(
          requireAccount(before, bounds.source),
          input.wallet,
          input.tokenIn
        );
  const inputAfter =
    input.tokenIn === "native"
      ? nativeAfter
      : solanaTokenAccount(
          requireAccount(after, bounds.source),
          input.wallet,
          input.tokenIn
        );
  const outputBefore =
    input.tokenOut === "native"
      ? nativeBefore
      : solanaTokenAccount(
          requireAccount(before, bounds.destination),
          input.wallet,
          input.tokenOut
        );
  const outputAfter =
    input.tokenOut === "native"
      ? nativeAfter
      : solanaTokenAccount(
          requireAccount(after, bounds.destination),
          input.wallet,
          input.tokenOut
        );
  const received =
    input.tokenOut === "native"
      ? nativeAfter - nativeBefore + networkFee - wrappedBefore
      : outputAfter - outputBefore;
  const nativeSpent =
    nativeBefore -
    nativeAfter -
    (input.tokenIn === "native" ? BigInt(input.amount) : 0n) +
    wrappedBefore;
  if (
    (input.tokenIn !== "native" &&
      inputBefore - inputAfter !== BigInt(input.amount)) ||
    received < BigInt(minimum) ||
    (input.tokenOut !== "native" &&
      (nativeSpent < networkFee || nativeSpent > nativeFeeLimit))
  ) {
    throw new Error(
      "trade.simulation: Solana principal, received tokens or native fees differ from the approved bounds."
    );
  }
  protectOtherAssets(input, before, after, bounds);
  return [
    {
      asset: input.tokenIn,
      before: inputBefore.toString(),
      after: inputAfter.toString(),
    },
    {
      asset: input.tokenOut,
      before: outputBefore.toString(),
      after: outputAfter.toString(),
    },
  ];
};

const assessOnce = async (options: {
  readonly rpc: SolanaTradeRpc;
  readonly input: TradeInput;
  readonly transaction: string;
  readonly minimumOutput: string;
  readonly lastValidBlockHeight: number;
  readonly maximumFee?: string;
  readonly now: () => number;
}) => {
  const { rpc, input } = options;
  await rpc.assertNetwork(input.network);
  const decoded = await resolveSolanaTrade(
    rpc,
    options.transaction,
    input.wallet
  );
  const bounds = await validateJupiterTransaction(
    input,
    options.minimumOutput,
    decoded
  );
  const addresses = [
    ...new Set([
      ...decoded.accounts,
      input.wallet,
      bounds.source,
      bounds.destination,
      jupiterMint(input.tokenIn),
      jupiterMint(input.tokenOut),
    ]),
  ];
  const snapshot = await rpc.accounts(addresses, decoded.minimumSlot);
  const before: AccountSet = new Map(
    addresses.map((key, index) => [key, snapshot.value[index] ?? null])
  );
  verifyMint(before, jupiterMint(input.tokenIn));
  verifyMint(before, jupiterMint(input.tokenOut));
  if (input.tokenIn === "native" || input.tokenOut === "native") {
    const wrapped = requireAccount(before, bounds.wrapped);
    if (
      wrapped !== null &&
      solanaTokenAccount(wrapped, input.wallet, jupiterMint("native")) !== 0n
    ) {
      throw new Error(
        "trade.wrapped_balance: unwrap the existing wrapped SOL balance before preparing a native swap."
      );
    }
  }
  const [networkFee, rent, simulated] = await Promise.all([
    rpc.fee(
      Buffer.from(decoded.transaction.messageBytes).toString("base64"),
      snapshot.context.slot
    ),
    rpc.rent(165),
    rpc.simulate(options.transaction, addresses, snapshot.context.slot),
    rpc.validity(
      decoded.compiled.lifetimeToken,
      options.lastValidBlockHeight,
      snapshot.context.slot
    ),
  ]);
  // Solana's currently specified base signature fee is 5000 lamports. Refuse a changed schedule.
  if (networkFee !== 5000n + bounds.priorityFee) {
    throw new Error(
      "trade.gas: the network fee differs from the decoded signature and compute budget."
    );
  }
  const nativeFeeLimit = networkFee + rent * BigInt(bounds.created.length);
  if (
    nativeFeeLimit > BigInt(options.maximumFee ?? input.maxNativeFee) ||
    nativeFeeLimit > BigInt(input.maxNativeFee)
  ) {
    throw new Error(
      "trade.gas: signature, priority and account-rent bounds exceed the native fee budget."
    );
  }
  if (
    simulated.context.slot !== snapshot.context.slot ||
    simulated.value.unitsConsumed > bounds.computeUnits
  ) {
    throw new Error(
      "trade.simulation_snapshot: refresh the proposal; account reads and simulation must share a slot and fit the compute limit."
    );
  }
  const after: AccountSet = new Map(
    addresses.map((key, index) => [
      key,
      simulated.value.accounts[index] ?? null,
    ])
  );
  const assetChanges = deltas(
    input,
    before,
    after,
    bounds,
    networkFee,
    nativeFeeLimit,
    options.minimumOutput
  );
  const simulation: TradeSimulation = {
    status: "passed",
    provider: "quicknode",
    observedAt: options.now(),
    block: String(simulated.context.slot),
    gasUnits: String(simulated.value.unitsConsumed),
    assetChanges,
    error: null,
    stubbed: false,
  };
  return {
    simulation,
    nativeFeeLimit: nativeFeeLimit.toString(),
    feeBps: bounds.feeBps,
  };
};

type AssessmentOptions = Parameters<typeof assessOnce>[0];
const assessWithRetry = async (
  options: AssessmentOptions,
  remaining: number
): Promise<Awaited<ReturnType<typeof assessOnce>>> => {
  try {
    return await assessOnce(options);
  } catch (error) {
    if (
      remaining <= 1 ||
      !(error instanceof Error) ||
      !error.message.startsWith("trade.simulation_snapshot:")
    ) {
      throw error;
    }
    return await assessWithRetry(options, remaining - 1);
  }
};

// A slot can advance between the account read and simulation. Retry those read-only snapshots only.
export const assessJupiterTransaction = async (options: AssessmentOptions) =>
  await assessWithRetry(options, 3);
