import type { TradeInput } from "@froggy/domain";
import {
  address,
  getAddressDecoder,
  getAddressEncoder,
  getProgramDerivedAddress,
} from "@solana/kit";

import { WRAPPED_SOL } from "./jupiter";
import type { SolanaTradeAccount, SolanaTradeRpc } from "./solana-chain";
import {
  resolveSolanaTrade,
  solanaAssociatedAccount,
  solanaMintProgram,
  SOLANA_PROGRAMS,
} from "./solana-transactions";

// pump-fun/pump-public-docs IDLs, checked 2026-09-09. These are program identities, not provider input.
export const PUMP_PROGRAMS = {
  curve: "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P",
  amm: "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA",
  fee: "pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ",
} as const;
const CURVE = Buffer.from([23, 183, 248, 55, 96, 216, 172, 96]);
const POOL = Buffer.from([241, 154, 109, 4, 17, 177, 109, 188]);

export const pumpPda = async (
  program: string,
  seed: string,
  keys: readonly string[] = []
): Promise<string> => {
  const encoder = getAddressEncoder();
  const [result] = await getProgramDerivedAddress({
    programAddress: address(program),
    seeds: [
      Buffer.from(seed),
      ...keys.map((key) => encoder.encode(address(key))),
    ],
  });
  return result;
};
export const pumpPoolAddress = async (mint: string): Promise<string> => {
  const owner = await pumpPda(PUMP_PROGRAMS.curve, "pool-authority", [mint]);
  const encoder = getAddressEncoder();
  const [pool] = await getProgramDerivedAddress({
    programAddress: address(PUMP_PROGRAMS.amm),
    seeds: [
      Buffer.from("pool"),
      Buffer.from([0, 0]),
      ...[owner, mint, WRAPPED_SOL].map((key) => encoder.encode(address(key))),
    ],
  });
  return pool;
};

export const pumpAccount = (
  accounts: ReadonlyMap<string, SolanaTradeAccount | null>,
  key: string
): SolanaTradeAccount | null => {
  const account = accounts.get(key);
  if (account === undefined) {
    throw new Error(
      "trade.accounts: a required Pump account is absent from the snapshot."
    );
  }
  return account;
};
const programBytes = (
  account: SolanaTradeAccount | null,
  program: string,
  discriminator: Buffer,
  length: number
): Buffer => {
  const bytes = Buffer.from(account?.data[0] ?? "", "base64");
  if (
    account === null ||
    account.owner !== program ||
    account.executable ||
    bytes.length < length ||
    !bytes.subarray(0, 8).equals(discriminator)
  ) {
    throw new Error(
      "trade.pump_state: native protocol account ownership or layout is invalid."
    );
  }
  return bytes;
};
const keyAt = (bytes: Buffer, offset: number): string =>
  getAddressDecoder().decode(bytes.subarray(offset, offset + 32));

export interface PumpPool {
  readonly address: string;
  readonly baseAccount: string;
  readonly quoteAccount: string;
  readonly creator: string;
}
export interface PumpState {
  readonly phase: "curve" | "graduated";
  readonly mint: string;
  readonly tokenProgram: string;
  readonly curve: string;
  readonly creator: string;
  readonly pool: PumpPool | null;
}

const curveState = (account: SolanaTradeAccount | null) => {
  const bytes = programBytes(account, PUMP_PROGRAMS.curve, CURVE, 83);
  if (bytes[48] !== 0 && bytes[48] !== 1) {
    throw new Error("trade.pump_state: the bonding-curve phase is invalid.");
  }
  if (
    bytes[81] !== 0 ||
    bytes[82] !== 0 ||
    (bytes.length >= 115 &&
      ![SOLANA_PROGRAMS.system, WRAPPED_SOL].includes(keyAt(bytes, 83)))
  ) {
    throw new Error(
      "trade.pump_variant: mayhem, cashback and non-SOL quote curves are not supported."
    );
  }
  return { complete: bytes[48] === 1, creator: keyAt(bytes, 49) };
};

const poolState = (
  account: SolanaTradeAccount | null,
  pool: string,
  mint: string
): PumpPool => {
  const bytes = programBytes(account, PUMP_PROGRAMS.amm, POOL, 243);
  if (
    keyAt(bytes, 43) !== mint ||
    keyAt(bytes, 75) !== WRAPPED_SOL ||
    (bytes.length >= 245 && (bytes[243] !== 0 || bytes[244] !== 0)) ||
    (bytes.length >= 261 &&
      bytes.subarray(245, 261).some((value) => value !== 0))
  ) {
    throw new Error(
      "trade.pump_pool: the AMM pair or pool variant differs from the supported SOL route."
    );
  }
  return {
    address: pool,
    baseAccount: keyAt(bytes, 139),
    quoteAccount: keyAt(bytes, 171),
    creator: keyAt(bytes, 211),
  };
};

export const pumpSnapshot = async (
  rpc: SolanaTradeRpc,
  input: TradeInput,
  transaction: string
) => {
  await rpc.assertNetwork(input.network);
  const decoded = await resolveSolanaTrade(rpc, transaction, input.wallet);
  const native = decoded.instructions.filter(
    (instruction) =>
      instruction.program === PUMP_PROGRAMS.curve ||
      instruction.program === PUMP_PROGRAMS.amm
  );
  const [instruction] = native;
  if (native.length !== 1 || instruction === undefined) {
    throw new Error(
      "trade.pump_route: exactly one native Pump swap is required."
    );
  }
  const mint = input.tokenIn === "native" ? input.tokenOut : input.tokenIn;
  const curve = await pumpPda(PUMP_PROGRAMS.curve, "bonding-curve", [mint]);
  const identity = await rpc.accounts([mint, curve], decoded.minimumSlot);
  const tokenProgram = solanaMintProgram(identity.value[0] ?? null);
  const [tokenAccount, wrapped] = await Promise.all([
    solanaAssociatedAccount(input.wallet, mint, tokenProgram),
    solanaAssociatedAccount(input.wallet, WRAPPED_SOL),
  ]);
  const addresses = [
    ...new Set([
      ...decoded.accounts,
      curve,
      mint,
      WRAPPED_SOL,
      tokenAccount,
      wrapped,
      PUMP_PROGRAMS.curve,
      PUMP_PROGRAMS.amm,
      PUMP_PROGRAMS.fee,
    ]),
  ];
  const snapshot = await rpc.accounts(addresses, identity.context.slot);
  const accounts = new Map(
    addresses.map((key, index) => [key, snapshot.value[index] ?? null])
  );
  if (solanaMintProgram(pumpAccount(accounts, mint)) !== tokenProgram) {
    throw new Error("trade.mint: mint ownership changed during preparation.");
  }
  for (const program of [
    PUMP_PROGRAMS.curve,
    PUMP_PROGRAMS.amm,
    PUMP_PROGRAMS.fee,
    tokenProgram,
  ]) {
    if (pumpAccount(accounts, program)?.executable !== true) {
      throw new Error("trade.program: the native program is unavailable.");
    }
  }
  const observed = curveState(pumpAccount(accounts, curve));
  const phase = observed.complete ? ("graduated" as const) : ("curve" as const);
  if ((phase === "curve") !== (instruction.program === PUMP_PROGRAMS.curve)) {
    throw new Error(
      "trade.phase: the launch phase changed; prepare a new route."
    );
  }
  const poolAddress = instruction.accounts.at(0);
  if (phase === "graduated" && poolAddress === undefined) {
    throw new Error(
      "trade.pump_pool: a graduated route requires its AMM pool."
    );
  }
  const pool =
    phase === "graduated" && poolAddress !== undefined
      ? poolState(pumpAccount(accounts, poolAddress), poolAddress, mint)
      : null;
  if (
    pool !== null &&
    (pool.creator !== observed.creator ||
      pool.address !== (await pumpPoolAddress(mint)))
  ) {
    throw new Error(
      "trade.pump_pool: the pool is not the canonical graduation pool for this mint."
    );
  }
  const state: PumpState = {
    phase,
    mint,
    tokenProgram,
    curve,
    creator: observed.creator,
    pool,
  };
  return {
    decoded,
    instruction,
    state,
    accounts,
    addresses,
    slot: snapshot.context.slot,
    tokenAccount,
    wrapped,
  };
};
