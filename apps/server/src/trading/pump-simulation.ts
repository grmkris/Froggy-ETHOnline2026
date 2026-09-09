import type { TradeInput, TradeSimulation } from "@froggy/domain";
import {
  address,
  blockhash,
  getAddressDecoder,
  getCompiledTransactionMessageEncoder,
} from "@solana/kit";

import { WRAPPED_SOL } from "./jupiter";
import { pumpFlows } from "./pump-flows";
import { pumpAccount, pumpSnapshot } from "./pump-state";
import { validatePumpTransaction } from "./pump-transactions";
import type { SolanaTradeAccount, SolanaTradeRpc } from "./solana-chain";
import {
  decodeSolanaTrade,
  SOLANA_PROGRAMS,
  solanaTokenAccount,
} from "./solana-transactions";

type Snapshot = Awaited<ReturnType<typeof pumpSnapshot>>;
type Bounds = Awaited<ReturnType<typeof validatePumpTransaction>>;
type Accounts = ReadonlyMap<string, SolanaTradeAccount | null>;

export const refreshPumpLifetime = async (
  rpc: SolanaTradeRpc,
  input: TradeInput,
  transaction: string
) => {
  await rpc.assertNetwork(input.network);
  const decoded = decodeSolanaTrade(transaction, input.wallet);
  if (decoded.transaction.signatures[address(input.wallet)] !== null) {
    throw new Error(
      "trade.signature: the native builder must return an unsigned transaction."
    );
  }
  const fresh = await rpc.latestBlockhash();
  const bytes = getCompiledTransactionMessageEncoder().encode({
    ...decoded.compiled,
    lifetimeToken: blockhash(fresh.value.blockhash),
  });
  // The decoder above requires exactly one signer. Only its empty signature and the blockhash change.
  const serialized = Buffer.concat([
    Buffer.from([1]),
    Buffer.alloc(64),
    Buffer.from(bytes),
  ]).toString("base64");
  decodeSolanaTrade(serialized, input.wallet);
  return {
    transaction: serialized,
    lastValidBlockHeight: fresh.value.lastValidBlockHeight,
  };
};

export const pumpWalletBalance = (
  account: SolanaTradeAccount | null
): bigint => {
  if (
    account === null ||
    account.executable ||
    account.owner !== SOLANA_PROGRAMS.system ||
    account.data[0] !== ""
  ) {
    throw new Error("trade.wallet: expected a system-owned Solana wallet.");
  }
  return BigInt(account.lamports);
};
const protectOtherAssets = (
  input: TradeInput,
  snapshot: Snapshot,
  after: Accounts
): void => {
  for (const [key, account] of snapshot.accounts) {
    if (
      account === null ||
      key === snapshot.tokenAccount ||
      (snapshot.state.phase === "graduated" && key === snapshot.wrapped)
    ) {
      continue;
    }
    const bytes = Buffer.from(account.data[0], "base64");
    if (
      bytes.length < 165 ||
      ![SOLANA_PROGRAMS.token, snapshot.state.tokenProgram].includes(
        account.owner
      ) ||
      getAddressDecoder().decode(bytes.subarray(32, 64)) !== input.wallet
    ) {
      continue;
    }
    if (JSON.stringify(account) !== JSON.stringify(pumpAccount(after, key))) {
      throw new Error(
        "trade.simulation: an unrelated owner token account changed."
      );
    }
  }
};

const feesAndChanges = (
  input: TradeInput,
  snapshot: Snapshot,
  after: Accounts,
  flows: ReturnType<typeof pumpFlows>,
  networkFee: bigint,
  maximumFee: bigint,
  bounds: Bounds
) => {
  const beforeNative = pumpWalletBalance(
    pumpAccount(snapshot.accounts, input.wallet)
  );
  const afterNative = pumpWalletBalance(pumpAccount(after, input.wallet));
  const beforeToken = solanaTokenAccount(
    pumpAccount(snapshot.accounts, snapshot.tokenAccount),
    input.wallet,
    snapshot.state.mint,
    snapshot.state.tokenProgram
  );
  const afterToken = solanaTokenAccount(
    pumpAccount(after, snapshot.tokenAccount),
    input.wallet,
    snapshot.state.mint,
    snapshot.state.tokenProgram
  );
  const wrappedBefore =
    snapshot.state.phase === "graduated"
      ? BigInt(pumpAccount(snapshot.accounts, snapshot.wrapped)?.lamports ?? 0)
      : 0n;
  const buy = input.tokenIn === "native";
  const output = flows.output ?? afterNative - beforeNative + networkFee;
  const nativeCost = buy
    ? beforeNative - afterNative - flows.consumed + wrappedBefore
    : output - (afterNative - beforeNative) + wrappedBefore;
  if (
    flows.consumed > bounds.maximumInput ||
    (!buy && flows.consumed !== BigInt(input.amount)) ||
    output < bounds.minimumOutput ||
    nativeCost < networkFee ||
    nativeCost > maximumFee ||
    (buy
      ? afterToken - beforeToken !== output
      : beforeToken - afterToken !== flows.consumed)
  ) {
    throw new Error(
      "trade.simulation: native principal, output or fees differ from the approved bounds."
    );
  }
  protectOtherAssets(input, snapshot, after);
  return [
    {
      asset: input.tokenIn,
      before: (buy ? beforeNative : beforeToken).toString(),
      after: (buy ? afterNative : afterToken).toString(),
    },
    {
      asset: input.tokenOut,
      before: (buy ? beforeToken : beforeNative).toString(),
      after: (buy ? afterToken : afterNative).toString(),
    },
  ];
};

interface AssessmentOptions {
  readonly rpc: SolanaTradeRpc;
  readonly input: TradeInput;
  readonly transaction: string;
  readonly minimumOutput: string;
  readonly lastValidBlockHeight: number;
  readonly phase: "curve" | "graduated";
  readonly maximumFee?: string;
  readonly now: () => number;
}
const assessOnce = async (options: AssessmentOptions) => {
  const { rpc, input } = options;
  const snapshot = await pumpSnapshot(rpc, input, options.transaction);
  if (snapshot.state.phase !== options.phase) {
    throw new Error(
      "trade.phase: the launch phase changed; prepare a new route."
    );
  }
  const bounds = await validatePumpTransaction(
    input,
    options.minimumOutput,
    snapshot.decoded,
    snapshot.state
  );
  if (
    snapshot.state.phase === "graduated" &&
    solanaTokenAccount(
      pumpAccount(snapshot.accounts, snapshot.wrapped),
      input.wallet,
      WRAPPED_SOL
    ) !== 0n
  ) {
    throw new Error(
      "trade.wrapped_balance: unwrap existing wrapped SOL before a native trade."
    );
  }
  const [networkFee, rents, simulated] = await Promise.all([
    rpc.fee(
      Buffer.from(snapshot.decoded.transaction.messageBytes).toString("base64"),
      snapshot.slot
    ),
    Promise.all(
      [...bounds.rentAccounts.values()].map(
        async (size) => await rpc.rent(size)
      )
    ),
    rpc.simulate(options.transaction, snapshot.addresses, snapshot.slot),
    rpc.validity(
      snapshot.decoded.compiled.lifetimeToken,
      options.lastValidBlockHeight,
      snapshot.slot
    ),
  ]);
  if (networkFee !== 5000n + bounds.priorityFee) {
    throw new Error(
      "trade.gas: the native fee differs from the decoded compute and signature budget."
    );
  }
  const nativeFeeLimit =
    networkFee + rents.reduce((total, rent) => total + rent, 0n);
  if (
    nativeFeeLimit > BigInt(options.maximumFee ?? input.maxNativeFee) ||
    nativeFeeLimit > BigInt(input.maxNativeFee)
  ) {
    throw new Error(
      "trade.gas: native signature, priority and account-rent costs exceed the budget."
    );
  }
  if (
    simulated.context.slot !== snapshot.slot ||
    simulated.value.unitsConsumed > bounds.computeUnits
  ) {
    throw new Error(
      "trade.simulation_snapshot: native reads and simulation must share a slot and fit the compute limit."
    );
  }
  const after = new Map(
    snapshot.addresses.map((key, index) => [
      key,
      simulated.value.accounts[index] ?? null,
    ])
  );
  const flows = pumpFlows(
    input,
    snapshot.state,
    bounds,
    snapshot.decoded.accounts,
    simulated.value.innerInstructions
  );
  const assetChanges = feesAndChanges(
    input,
    snapshot,
    after,
    flows,
    networkFee,
    nativeFeeLimit,
    bounds
  );
  const simulation: TradeSimulation = {
    status: "passed",
    provider: "quicknode",
    observedAt: options.now(),
    block: String(snapshot.slot),
    gasUnits: String(simulated.value.unitsConsumed),
    assetChanges,
    error: null,
    stubbed: false,
  };
  return {
    simulation,
    nativeFeeLimit: nativeFeeLimit.toString(),
    phase: snapshot.state.phase,
  };
};
const retryAssessment = async (
  options: AssessmentOptions,
  attempts: number
): Promise<Awaited<ReturnType<typeof assessOnce>>> => {
  try {
    return await assessOnce(options);
  } catch (error) {
    if (
      attempts <= 1 ||
      !(error instanceof Error) ||
      !error.message.startsWith("trade.simulation_snapshot:")
    ) {
      throw error;
    }
    return await retryAssessment(options, attempts - 1);
  }
};
export const assessPumpTransaction = async (options: AssessmentOptions) =>
  await retryAssessment(options, 3);
