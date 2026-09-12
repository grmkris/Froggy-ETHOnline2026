import type { TradeInput } from "@froggy/domain";
import {
  AccountRole,
  address,
  appendTransactionMessageInstructions,
  blockhash,
  compileTransaction,
  createTransactionMessage,
  generateKeyPairSigner,
  getAddressDecoder,
  getAddressEncoder,
  getBase58Decoder,
  getCompiledTransactionMessageDecoder,
  getTransactionDecoder,
  getTransactionEncoder,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
} from "@solana/kit";
import type { Instruction } from "@solana/kit";
import { Redacted, Schema } from "effect";

import { WRAPPED_SOL } from "./jupiter";
import { SOLANA_MAINNET } from "./networks";
import { pumpPda, pumpPoolAddress, PUMP_PROGRAMS } from "./pump-state";
import { SolanaTradeRpc } from "./solana-chain";
import type { SolanaTradeAccount } from "./solana-chain";
import {
  SOLANA_PROGRAMS,
  solanaAssociatedAccount,
} from "./solana-transactions";

const NETWORK = SOLANA_MAINNET;
const keyFor = (byte: number): string =>
  getAddressDecoder().decode(Buffer.alloc(32, byte));
const putKey = (bytes: Buffer, key: string, offset: number): void => {
  Buffer.from(getAddressEncoder().encode(address(key))).copy(bytes, offset);
};
const account = (
  data: Buffer,
  owner: string,
  lamports = 2_000_000
): SolanaTradeAccount => ({
  data: [data.toString("base64"), "base64"],
  owner,
  lamports,
  executable: false,
});
const token = (
  owner: string,
  mint: string,
  amount: bigint
): SolanaTradeAccount => {
  const bytes = Buffer.alloc(165);
  putKey(bytes, mint, 0);
  putKey(bytes, owner, 32);
  bytes.writeBigUInt64LE(amount, 64);
  bytes[108] = 1;
  return account(bytes, SOLANA_PROGRAMS.token);
};
const mintAccount = (): SolanaTradeAccount => {
  const bytes = Buffer.alloc(82);
  bytes[44] = 6;
  bytes[45] = 1;
  return account(bytes, SOLANA_PROGRAMS.token);
};
const Call = Schema.Struct({
  id: Schema.Int,
  method: Schema.String,
  params: Schema.Array(Schema.Json),
});
const systemTransfer = (amount: bigint): Buffer => {
  const bytes = Buffer.alloc(12);
  bytes.writeUInt32LE(2);
  bytes.writeBigUInt64LE(amount, 4);
  return bytes;
};
const tokenTransfer = (amount: bigint): Buffer => {
  const bytes = Buffer.alloc(9);
  bytes[0] = 3;
  bytes.writeBigUInt64LE(amount, 1);
  return bytes;
};

/** Real codecs and signatures over a wholly synthetic local bank. No network request leaves this fixture. */
export const pumpFixture = async (phase: "curve" | "graduated", buy = true) => {
  const signer = await generateKeyPairSigner();
  const mint = keyFor(31);
  const creator = keyFor(32);
  const feeRecipient = keyFor(33);
  const input: TradeInput = {
    network: NETWORK,
    venue: "pump",
    action: "swap",
    wallet: signer.address,
    tokenIn: buy ? "native" : mint,
    tokenOut: buy ? mint : "native",
    amount: "1000",
    maxNativeFee: "20000000",
    slippageBps: 100,
    position: null,
  };
  const program = phase === "curve" ? PUMP_PROGRAMS.curve : PUMP_PROGRAMS.amm;
  const [
    curve,
    pool,
    tokenAccount,
    wrapped,
    global,
    event,
    feeConfig,
    globalVolume,
    userVolume,
  ] = await Promise.all([
    pumpPda(PUMP_PROGRAMS.curve, "bonding-curve", [mint]),
    pumpPoolAddress(mint),
    solanaAssociatedAccount(input.wallet, mint),
    solanaAssociatedAccount(input.wallet, WRAPPED_SOL),
    pumpPda(program, phase === "curve" ? "global" : "global_config"),
    pumpPda(program, "__event_authority"),
    pumpPda(PUMP_PROGRAMS.fee, "fee_config", [program]),
    pumpPda(program, "global_volume_accumulator"),
    pumpPda(program, "user_volume_accumulator", [input.wallet]),
  ]);
  const [curveToken, poolBase, poolQuote, creatorVault, feeAccount] =
    await Promise.all([
      solanaAssociatedAccount(curve, mint),
      solanaAssociatedAccount(pool, mint),
      solanaAssociatedAccount(pool, WRAPPED_SOL),
      pumpPda(program, phase === "curve" ? "creator-vault" : "creator_vault", [
        creator,
      ]),
      solanaAssociatedAccount(feeRecipient, WRAPPED_SOL),
    ]);
  const creatorAccount = await solanaAssociatedAccount(
    creatorVault,
    WRAPPED_SOL
  );
  const curveBytes = Buffer.alloc(115);
  Buffer.from([23, 183, 248, 55, 96, 216, 172, 96]).copy(curveBytes);
  curveBytes[48] = Number(phase === "graduated");
  putKey(curveBytes, creator, 49);
  const poolBytes = Buffer.alloc(261);
  Buffer.from([241, 154, 109, 4, 17, 177, 109, 188]).copy(poolBytes);
  putKey(
    poolBytes,
    await pumpPda(PUMP_PROGRAMS.curve, "pool-authority", [mint]),
    11
  );
  putKey(poolBytes, mint, 43);
  putKey(poolBytes, WRAPPED_SOL, 75);
  putKey(poolBytes, keyFor(34), 107);
  putKey(poolBytes, poolBase, 139);
  putKey(poolBytes, poolQuote, 171);
  putKey(poolBytes, creator, 211);
  const routeAccounts: string[] =
    phase === "curve"
      ? [
          global,
          feeRecipient,
          mint,
          curve,
          curveToken,
          tokenAccount,
          input.wallet,
          SOLANA_PROGRAMS.system,
          ...(buy
            ? [SOLANA_PROGRAMS.token, creatorVault]
            : [creatorVault, SOLANA_PROGRAMS.token]),
          event,
          program,
          ...(buy ? [globalVolume, userVolume] : []),
          feeConfig,
          PUMP_PROGRAMS.fee,
        ]
      : [
          pool,
          input.wallet,
          global,
          mint,
          WRAPPED_SOL,
          tokenAccount,
          wrapped,
          poolBase,
          poolQuote,
          feeRecipient,
          feeAccount,
          SOLANA_PROGRAMS.token,
          SOLANA_PROGRAMS.token,
          SOLANA_PROGRAMS.system,
          SOLANA_PROGRAMS.associated,
          event,
          program,
          creatorAccount,
          creatorVault,
          ...(buy ? [globalVolume, userVolume] : []),
          feeConfig,
          PUMP_PROGRAMS.fee,
        ];
  const routeData = Buffer.alloc(buy ? 25 : 24);
  Buffer.from(
    buy
      ? [102, 6, 61, 18, 1, 218, 235, 234]
      : [51, 230, 133, 164, 1, 127, 131, 173]
  ).copy(routeData);
  routeData.writeBigUInt64LE(buy ? 2000n : 1000n, 8);
  routeData.writeBigUInt64LE(buy ? 900n : 1980n, 16);
  const computeData = Buffer.alloc(5);
  computeData[0] = 2;
  computeData.writeUInt32LE(200_000, 1);
  const roleFor = (key: string): AccountRole => {
    if (key === input.wallet) {
      return AccountRole.WRITABLE_SIGNER;
    }
    return [
      tokenAccount,
      wrapped,
      curve,
      curveToken,
      pool,
      poolBase,
      poolQuote,
      creatorVault,
      creatorAccount,
      feeRecipient,
      feeAccount,
      userVolume,
    ].includes(key)
      ? AccountRole.WRITABLE
      : AccountRole.READONLY;
  };
  const keysFor = (keys: readonly string[]) =>
    keys.map((key) => ({ address: address(key), role: roleFor(key) }));
  const build = (
    data = routeData,
    keys = routeAccounts,
    extra: readonly Instruction[] = []
  ): string => {
    const setup: Instruction[] = [];
    const cleanup: Instruction[] = [];
    if (phase === "graduated") {
      setup.push({
        programAddress: address(SOLANA_PROGRAMS.associated),
        data: Buffer.from([1]),
        accounts: keysFor([
          input.wallet,
          wrapped,
          input.wallet,
          WRAPPED_SOL,
          SOLANA_PROGRAMS.system,
          SOLANA_PROGRAMS.token,
        ]),
      });
      if (buy) {
        setup.push(
          {
            programAddress: address(SOLANA_PROGRAMS.system),
            data: systemTransfer(900n),
            accounts: keysFor([input.wallet, wrapped]),
          },
          {
            programAddress: address(SOLANA_PROGRAMS.token),
            data: Buffer.from([17]),
            accounts: keysFor([wrapped]),
          }
        );
      }
      cleanup.push({
        programAddress: address(SOLANA_PROGRAMS.token),
        data: Buffer.from([9]),
        accounts: keysFor([wrapped, input.wallet, input.wallet]),
      });
    }
    const message = pipe(
      createTransactionMessage({ version: 0 }),
      (draft) => setTransactionMessageFeePayer(signer.address, draft),
      (draft) =>
        setTransactionMessageLifetimeUsingBlockhash(
          { blockhash: blockhash(keyFor(35)), lastValidBlockHeight: 1000n },
          draft
        ),
      (draft) =>
        appendTransactionMessageInstructions(
          [
            {
              programAddress: address(SOLANA_PROGRAMS.compute),
              data: computeData,
            },
            ...setup,
            { programAddress: address(program), data, accounts: keysFor(keys) },
            ...cleanup,
            ...extra,
          ],
          draft
        )
    );
    return Buffer.from(
      getTransactionEncoder().encode(compileTransaction(message))
    ).toString("base64");
  };
  let transaction = build();
  let landed: string | null = null;
  let confirmed = true;
  let output = 2000n;
  let consumed = buy ? 850n : 1000n;
  let fee = 5000;
  const calls: string[] = [];
  const before = new Map<string, SolanaTradeAccount | null>([
    [
      input.wallet,
      account(Buffer.alloc(0), SOLANA_PROGRAMS.system, 100_000_000),
    ],
    [mint, mintAccount()],
    [WRAPPED_SOL, mintAccount()],
    [curve, account(curveBytes, PUMP_PROGRAMS.curve)],
    [pool, account(poolBytes, PUMP_PROGRAMS.amm)],
    [tokenAccount, token(input.wallet, mint, buy ? 0n : 10_000n)],
    [wrapped, null],
  ]);
  for (const key of [
    ...Object.values(PUMP_PROGRAMS),
    ...Object.values(SOLANA_PROGRAMS),
  ]) {
    before.set(key, {
      ...account(Buffer.alloc(0), SOLANA_PROGRAMS.system),
      executable: true,
    });
  }
  const bank = (key: string, after = false): SolanaTradeAccount | null => {
    if (after && key === input.wallet) {
      return account(
        Buffer.alloc(0),
        SOLANA_PROGRAMS.system,
        100_000_000 - fee + (buy ? -Number(consumed) : Number(output))
      );
    }
    if (after && key === tokenAccount) {
      return token(input.wallet, mint, buy ? output : 10_000n - consumed);
    }
    return before.get(key) ?? null;
  };
  const transferEvidence = (serialized: string): Schema.Json => {
    const decoded = getCompiledTransactionMessageDecoder().decode(
      getTransactionDecoder().decode(Buffer.from(serialized, "base64"))
        .messageBytes
    );
    const keys = decoded.staticAccounts;
    const instruction = (
      programId: string,
      addresses: readonly string[],
      data: Buffer
    ) => ({
      programIdIndex: keys.indexOf(address(programId)),
      accounts: addresses.map((key) => keys.indexOf(address(key))),
      data: getBase58Decoder().decode(data),
    });
    const transfers = [];
    if (buy) {
      if (phase === "curve") {
        for (const [destination, amount] of [
          [curve, consumed - 50n],
          [feeRecipient, 40n],
          [creatorVault, 10n],
        ] as const) {
          transfers.push(
            instruction(
              SOLANA_PROGRAMS.system,
              [input.wallet, destination],
              systemTransfer(amount)
            )
          );
        }
      } else {
        for (const [destination, amount] of [
          [poolQuote, consumed - 50n],
          [feeAccount, 40n],
          [creatorAccount, 10n],
        ] as const) {
          transfers.push(
            instruction(
              SOLANA_PROGRAMS.token,
              [wrapped, destination, input.wallet],
              tokenTransfer(amount)
            )
          );
        }
      }
      transfers.push(
        instruction(
          SOLANA_PROGRAMS.token,
          [
            phase === "curve" ? curveToken : poolBase,
            tokenAccount,
            phase === "curve" ? curve : pool,
          ],
          tokenTransfer(output)
        )
      );
    } else {
      transfers.push(
        instruction(
          SOLANA_PROGRAMS.token,
          [
            tokenAccount,
            phase === "curve" ? curveToken : poolBase,
            input.wallet,
          ],
          tokenTransfer(consumed)
        )
      );
      if (phase === "graduated") {
        transfers.push(
          instruction(
            SOLANA_PROGRAMS.token,
            [poolQuote, wrapped, pool],
            tokenTransfer(output)
          )
        );
      }
    }
    return [
      {
        index: decoded.instructions.findIndex(
          (entry) => keys[entry.programAddressIndex] === program
        ),
        instructions: transfers,
      },
    ];
  };
  const receipt = (): Schema.Json => {
    if (landed === null || !confirmed) {
      return null;
    }
    const decoded = getCompiledTransactionMessageDecoder().decode(
      getTransactionDecoder().decode(Buffer.from(landed, "base64")).messageBytes
    );
    const keys = decoded.staticAccounts;
    const tokenBalance = (after: boolean): bigint => {
      if (!after) {
        return buy ? 0n : 10_000n;
      }
      return buy ? output : 10_000n - consumed;
    };
    const balances = (after: boolean) => [
      {
        accountIndex: keys.indexOf(address(tokenAccount)),
        mint,
        owner: input.wallet,
        uiTokenAmount: {
          amount: tokenBalance(after).toString(),
          decimals: 6,
        },
      },
    ];
    return {
      slot: 100,
      transaction: [landed, "base64"],
      meta: {
        err: null,
        fee,
        preBalances: keys.map((key) => bank(key)?.lamports ?? 0),
        postBalances: keys.map((key) => bank(key, true)?.lamports ?? 0),
        preTokenBalances: balances(false),
        postTokenBalances: balances(true),
        loadedAddresses: { writable: [], readonly: [] },
        innerInstructions: transferEvidence(landed),
      },
    };
  };
  const respond = (call: typeof Call.Type): Schema.Json => {
    calls.push(call.method);
    switch (call.method) {
      case "getGenesisHash": {
        return `${NETWORK.slice(7)}${"1".repeat(11)}`;
      }
      case "getMultipleAccounts": {
        return {
          context: { slot: 100 },
          value: Schema.decodeUnknownSync(Schema.Array(Schema.String))(
            call.params[0]
          ).map((key) => bank(key)),
        };
      }
      case "getLatestBlockhash": {
        return {
          context: { slot: 100 },
          value: { blockhash: keyFor(36), lastValidBlockHeight: 1000 },
        };
      }
      case "isBlockhashValid": {
        return { context: { slot: 100 }, value: true };
      }
      case "getBlockHeight": {
        return 900;
      }
      case "getFeeForMessage": {
        return { context: { slot: 100 }, value: 5000 };
      }
      case "getMinimumBalanceForRentExemption": {
        return 2_000_000;
      }
      case "simulateTransaction": {
        const config = Schema.decodeUnknownSync(
          Schema.Struct({
            accounts: Schema.Struct({ addresses: Schema.Array(Schema.String) }),
            innerInstructions: Schema.Literal(true),
          })
        )(call.params[1]);
        const serialized = Schema.decodeUnknownSync(Schema.String)(
          call.params[0]
        );
        return {
          context: { slot: 100 },
          value: {
            err: null,
            unitsConsumed: 100_000,
            accounts: config.accounts.addresses.map((key) => bank(key, true)),
            innerInstructions: transferEvidence(serialized),
          },
        };
      }
      case "sendTransaction": {
        landed = Schema.decodeUnknownSync(Schema.String)(call.params[0]);
        const signature = getTransactionDecoder().decode(
          Buffer.from(landed, "base64")
        ).signatures[signer.address];
        if (signature === null || signature === undefined) {
          throw new Error("Missing fixture signature");
        }
        return getBase58Decoder().decode(signature);
      }
      case "getTransaction": {
        return receipt();
      }
      default: {
        throw new Error(`Unexpected fixture RPC method ${call.method}`);
      }
    }
  };
  const fetchImpl: typeof fetch = Object.assign(
    async (request: URL | RequestInfo, init?: RequestInit) => {
      await Promise.resolve();
      const url =
        request instanceof Request ? new URL(request.url) : new URL(request);
      const body: unknown = JSON.parse(
        Schema.decodeUnknownSync(Schema.String)(init?.body)
      );
      if (url.pathname === "/agents/swap") {
        calls.push("order");
        Schema.decodeUnknownSync(
          Schema.Struct({
            user: Schema.Literal(input.wallet),
            feePayer: Schema.Literal(input.wallet),
            frontRunningProtection: Schema.Literal(false),
            tipAmount: Schema.Literal(0),
            encoding: Schema.Literal("base64"),
          })
        )(body);
        return Response.json({
          transaction,
          pumpMintInfo: {
            hasGraduated: phase === "graduated",
            expectedOutAmount: "2000",
          },
        });
      }
      const call = Schema.decodeUnknownSync(Call)(body);
      return Response.json({
        jsonrpc: "2.0",
        id: call.id,
        result: respond(call),
      });
    },
    { preconnect: (): void => undefined }
  );
  const outbound = {
    fetch: fetchImpl,
    lookup: async () => await Promise.resolve(["93.184.216.34"]),
  };
  return {
    signer,
    input,
    curve,
    tokenAccount,
    wrapped,
    routeAccounts,
    routeData,
    build,
    calls,
    before,
    outbound,
    rpc: new SolanaTradeRpc({
      endpoint: Redacted.make("https://rpc.example.test/secret"),
      outbound,
    }),
    setTransaction: (value: string): void => {
      transaction = value;
    },
    setConfirmed: (value: boolean): void => {
      confirmed = value;
    },
    setOutput: (value: bigint): void => {
      output = value;
    },
    setConsumed: (value: bigint): void => {
      consumed = value;
    },
    setFee: (value: number): void => {
      fee = value;
    },
    setPhase: (value: "curve" | "graduated"): void => {
      curveBytes[48] = Number(value === "graduated");
      before.set(curve, account(curveBytes, PUMP_PROGRAMS.curve));
    },
  };
};
