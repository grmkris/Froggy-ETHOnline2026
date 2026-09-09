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
import { SolanaTradeRpc } from "./solana-chain";
import type { SolanaTradeAccount } from "./solana-chain";
import {
  SOLANA_PROGRAMS,
  solanaAssociatedAccount,
} from "./solana-transactions";

const NETWORK = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
const Call = Schema.Struct({
  id: Schema.Int,
  method: Schema.String,
  params: Schema.Array(Schema.Json),
});
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
  Buffer.from(getAddressEncoder().encode(address(mint))).copy(bytes, 0);
  Buffer.from(getAddressEncoder().encode(address(owner))).copy(bytes, 32);
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

const expectParameters = (url: URL, input: TradeInput): void => {
  if (
    url.searchParams.get("excludeRouters") !== "jupiterz,dflow,okx" ||
    url.searchParams.get("taker") !== input.wallet ||
    url.searchParams.get("jitoTipLamports") !== "0"
  ) {
    throw new Error("Unsafe Jupiter request parameters");
  }
};

/** Synthetic local bank and provider; signatures are real but no network request leaves the test. */
export const jupiterFixture = async (
  native: "input" | "output" | null = null
) => {
  const signer = await generateKeyPairSigner();
  const tokenIn =
    native === "input"
      ? WRAPPED_SOL
      : getAddressDecoder().decode(Buffer.alloc(32, 10));
  const tokenOut =
    native === "output"
      ? WRAPPED_SOL
      : getAddressDecoder().decode(Buffer.alloc(32, 11));
  const input: TradeInput = {
    network: NETWORK,
    venue: "jupiter",
    action: "swap",
    wallet: signer.address,
    tokenIn: native === "input" ? "native" : tokenIn,
    tokenOut: native === "output" ? "native" : tokenOut,
    amount: "100",
    maxNativeFee: native === null ? "5000" : "2005000",
    slippageBps: 100,
    position: null,
  };
  const [source, destination] = await Promise.all([
    solanaAssociatedAccount(input.wallet, tokenIn),
    solanaAssociatedAccount(input.wallet, tokenOut),
  ]);
  const routeData = Buffer.alloc(35);
  Buffer.from([229, 23, 203, 151, 122, 227, 173, 42]).copy(routeData);
  routeData.writeUInt32LE(1, 8);
  Buffer.from([7, 100, 0, 1]).copy(routeData, 12);
  routeData.writeBigUInt64LE(100n, 16);
  routeData.writeBigUInt64LE(200n, 24);
  routeData.writeUInt16LE(100, 32);
  const computeData = Buffer.alloc(5);
  computeData[0] = 2;
  computeData.writeUInt32LE(100_000, 1);
  const routeAccounts = [
    SOLANA_PROGRAMS.token,
    input.wallet,
    source,
    destination,
    SOLANA_PROGRAMS.jupiter,
    tokenOut,
    SOLANA_PROGRAMS.jupiter,
    "D8cy77BBepLMngZx6ZukaTff5hCt1HrWyKk3Hnd9oitf",
    SOLANA_PROGRAMS.jupiter,
  ];
  const roleFor = (key: string): AccountRole => {
    if (key === input.wallet) {
      return AccountRole.READONLY_SIGNER;
    }
    return key === source || key === destination
      ? AccountRole.WRITABLE
      : AccountRole.READONLY;
  };
  const wrapped = native === "input" ? source : destination;
  const nativeSetup: Instruction[] = [];
  const nativeCleanup: Instruction[] = [];
  if (native !== null) {
    nativeSetup.push({
      programAddress: address(SOLANA_PROGRAMS.associated),
      data: Buffer.from([1]),
      accounts: [
        input.wallet,
        wrapped,
        input.wallet,
        WRAPPED_SOL,
        SOLANA_PROGRAMS.system,
        SOLANA_PROGRAMS.token,
      ].map((key) => ({ address: address(key), role: roleFor(key) })),
    });
    nativeCleanup.push({
      programAddress: address(SOLANA_PROGRAMS.token),
      data: Buffer.from([9]),
      accounts: [wrapped, input.wallet, input.wallet].map((key) => ({
        address: address(key),
        role: roleFor(key),
      })),
    });
    if (native === "input") {
      const transfer = Buffer.alloc(12);
      transfer.writeUInt32LE(2, 0);
      transfer.writeBigUInt64LE(100n, 4);
      nativeSetup.push(
        {
          programAddress: address(SOLANA_PROGRAMS.system),
          data: transfer,
          accounts: [input.wallet, wrapped].map((key) => ({
            address: address(key),
            role: roleFor(key),
          })),
        },
        {
          programAddress: address(SOLANA_PROGRAMS.token),
          data: Buffer.from([17]),
          accounts: [{ address: address(wrapped), role: AccountRole.WRITABLE }],
        }
      );
    }
  }
  const build = (
    data = routeData,
    accounts = routeAccounts,
    extra: readonly Instruction[] = []
  ): string => {
    const transaction = compileTransaction(
      pipe(
        createTransactionMessage({ version: 0 }),
        (message) => setTransactionMessageFeePayer(signer.address, message),
        (message) =>
          setTransactionMessageLifetimeUsingBlockhash(
            {
              blockhash: blockhash(
                getAddressDecoder().decode(Buffer.alloc(32, 12))
              ),
              lastValidBlockHeight: 1000n,
            },
            message
          ),
        (message) =>
          appendTransactionMessageInstructions(
            [
              {
                programAddress: address(SOLANA_PROGRAMS.compute),
                data: computeData,
              },
              ...nativeSetup,
              {
                programAddress: address(SOLANA_PROGRAMS.jupiter),
                data,
                accounts: accounts.map((key) => ({
                  address: address(key),
                  role: roleFor(key),
                })),
              },
              ...nativeCleanup,
              ...extra,
            ],
            message
          )
      )
    );
    return Buffer.from(getTransactionEncoder().encode(transaction)).toString(
      "base64"
    );
  };
  let transaction = build();
  let landed: string | null = null;
  let confirmed = true;
  let simulationOutput = 200n;
  let simulateSlot = 100;
  const calls: string[] = [];
  const before = new Map<string, SolanaTradeAccount | null>([
    [
      input.wallet,
      account(Buffer.alloc(0), SOLANA_PROGRAMS.system, 10_000_000),
    ],
    [source, native === "input" ? null : token(input.wallet, tokenIn, 1000n)],
    [
      destination,
      native === "output" ? null : token(input.wallet, tokenOut, 0n),
    ],
    [tokenIn, mintAccount()],
    [tokenOut, mintAccount()],
  ]);
  const bankAccount = (
    key: string,
    simulated: boolean
  ): SolanaTradeAccount | null => {
    if (native !== null && key === wrapped) {
      return null;
    }
    if (simulated && key === source) {
      return token(input.wallet, tokenIn, 900n);
    }
    if (simulated && key === destination) {
      return token(input.wallet, tokenOut, simulationOutput);
    }
    if (simulated && key === input.wallet) {
      return account(
        Buffer.alloc(0),
        SOLANA_PROGRAMS.system,
        9_995_000 -
          (native === "input" ? 100 : 0) +
          (native === "output" ? Number(simulationOutput) : 0)
      );
    }
    return (
      before.get(key) ?? account(Buffer.alloc(0), SOLANA_PROGRAMS.system, 0)
    );
  };
  const receipt = (): Schema.Json => {
    if (landed === null || !confirmed) {
      return null;
    }
    const decoded = getCompiledTransactionMessageDecoder().decode(
      getTransactionDecoder().decode(Buffer.from(landed, "base64")).messageBytes
    );
    const keys = decoded.staticAccounts;
    const units = (key: string, simulated: boolean): string => {
      if (key === source) {
        return simulated ? "900" : "1000";
      }
      return simulated ? "200" : "0";
    };
    const balances = (simulated: boolean) =>
      [source, destination]
        .filter((key) => native === null || key !== wrapped)
        .map((key) => ({
          accountIndex: keys.indexOf(address(key)),
          mint: key === source ? tokenIn : tokenOut,
          owner: input.wallet,
          uiTokenAmount: {
            amount: units(key, simulated),
            decimals: 6,
          },
        }));
    return {
      slot: 100,
      transaction: [landed, "base64"],
      meta: {
        err: null,
        fee: 5000,
        preBalances: keys.map((key) => bankAccount(key, false)?.lamports ?? 0),
        postBalances: keys.map((key) => bankAccount(key, true)?.lamports ?? 0),
        preTokenBalances: balances(false),
        postTokenBalances: balances(true),
        loadedAddresses: { writable: [], readonly: [] },
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
        const keys = Schema.decodeUnknownSync(Schema.Array(Schema.String))(
          call.params[0]
        );
        return {
          context: { slot: 100 },
          value: keys.map((key) => bankAccount(key, false)),
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
          })
        )(call.params[1]);
        return {
          context: { slot: simulateSlot },
          value: {
            err: null,
            unitsConsumed: 50_000,
            accounts: config.accounts.addresses.map((key) =>
              bankAccount(key, true)
            ),
          },
        };
      }
      case "getTransaction": {
        return receipt();
      }
      default: {
        throw new Error(`Unexpected fixture method ${call.method}`);
      }
    }
  };
  const fetchImpl: typeof fetch = Object.assign(
    async (request: URL | RequestInfo, init?: RequestInit) => {
      await Promise.resolve();
      const url =
        request instanceof Request ? new URL(request.url) : new URL(request);
      if (url.pathname === "/swap/v2/order") {
        calls.push("order");
        expectParameters(url, input);
        return Response.json({
          inputMint: tokenIn,
          outputMint: tokenOut,
          taker: input.wallet,
          inAmount: input.amount,
          outAmount: "200",
          otherAmountThreshold: "198",
          swapMode: "ExactIn",
          slippageBps: 100,
          router: "metis",
          gasless: false,
          feeBps: 0,
          feeMint: tokenOut,
          transaction,
          requestId: "fixture-order",
          lastValidBlockHeight: "1000",
        });
      }
      const body: unknown = JSON.parse(
        Schema.decodeUnknownSync(Schema.String)(init?.body)
      );
      if (url.pathname === "/swap/v2/execute") {
        calls.push("execute");
        const requestBody = Schema.decodeUnknownSync(
          Schema.Struct({
            signedTransaction: Schema.String,
            requestId: Schema.Literal("fixture-order"),
          })
        )(body);
        landed = requestBody.signedTransaction;
        const signature = getTransactionDecoder().decode(
          Buffer.from(landed, "base64")
        ).signatures[signer.address];
        if (signature === undefined || signature === null) {
          throw new Error("Missing fixture signature");
        }
        return Response.json({
          status: "Success",
          code: 0,
          signature: getBase58Decoder().decode(signature),
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
    source,
    destination,
    build,
    routeData,
    routeAccounts,
    calls,
    before,
    outbound,
    rpc: new SolanaTradeRpc({
      endpoint: Redacted.make("https://rpc.example.test/secret"),
      outbound,
    }),
    jupiter: { apiKey: Redacted.make("fixture-secret"), outbound },
    transaction: () => transaction,
    setTransaction: (value: string): void => {
      transaction = value;
    },
    setConfirmed: (value: boolean): void => {
      confirmed = value;
    },
    setOutput: (value: bigint): void => {
      simulationOutput = value;
    },
    setSimulationSlot: (value: number): void => {
      simulateSlot = value;
    },
  };
};
