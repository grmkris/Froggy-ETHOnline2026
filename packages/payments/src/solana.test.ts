import { describe, expect, test } from "bun:test";

import {
  address,
  generateKeyPairSigner,
  getAddressEncoder,
  getCompiledTransactionMessageDecoder,
  getProgramDerivedAddress,
  getTransactionDecoder,
} from "@solana/kit";
import { Schema } from "effect";

import {
  reconcileSolanaPayment,
  solanaBalance,
  solanaPayer,
  SOLANA_DEVNET,
  SOLANA_MAINNET,
} from "./solana";
import type { PaymentChallenge } from "./types";

const BUYER = "11111111111111111111111111111111";
const FEE_PAYER = "So11111111111111111111111111111111111111112";
const MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const offer = {
  amount: "10000",
  asset: MINT,
  extra: { feePayer: FEE_PAYER },
  maxTimeoutSeconds: 60,
  network: SOLANA_DEVNET,
  payTo: BUYER,
  scheme: "exact",
};
const challenge: PaymentChallenge = { accepts: [offer], x402Version: 2 };
const RpcRequest = Schema.Struct({ id: Schema.Unknown, method: Schema.String });
const payloadSchema = Schema.Struct({
  x402Version: Schema.Literal(2),
  accepted: Schema.Struct({
    amount: Schema.String,
    network: Schema.String,
    payTo: Schema.String,
  }),
  payload: Schema.Struct({ transaction: Schema.String }),
});

type RpcJson =
  | string
  | number
  | boolean
  | null
  | readonly RpcJson[]
  | { readonly [key: string]: RpcJson };
const rpcServer = (result: (method: string) => RpcJson) =>
  Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: async (request) => {
      const body = Schema.decodeUnknownSync(RpcRequest)(await request.json());
      return Response.json({
        id: body.id,
        jsonrpc: "2.0",
        result: result(body.method),
      });
    },
  });

describe("Solana exact payments", () => {
  test("refuses invalid offers before any signing or RPC", async () => {
    let signed = 0;
    const payer = solanaPayer({
      network: SOLANA_DEVNET,
      rpcUrl: "https://unused.invalid",
      signer: {
        address: address(BUYER),
        signTransactions: async () => {
          signed += 1;
          return await Promise.resolve([]);
        },
      },
    });
    const invalid = [
      { ...challenge, x402Version: 1 },
      { ...challenge, accepts: [{ ...offer, network: SOLANA_MAINNET }] },
      { ...challenge, accepts: [{ ...offer, scheme: "upto" }] },
      { ...challenge, accepts: [{ ...offer, extra: {} }] },
      { ...challenge, accepts: [{ ...offer, extra: { feePayer: BUYER } }] },
      { ...challenge, accepts: [{ ...offer, extra: { feePayer: "bad" } }] },
      { ...challenge, accepts: [{ ...offer, amount: "18446744073709551616" }] },
      { ...challenge, accepts: [{ ...offer, amount: "0" }] },
      { ...challenge, accepts: [{ ...offer, amount: "-1" }] },
      { ...challenge, accepts: [{ ...offer, maxTimeoutSeconds: -1 }] },
      { ...challenge, accepts: [{ ...offer, payTo: "bad" }] },
      {
        ...challenge,
        accepts: [
          { ...offer, extra: { ...offer.extra, memo: "x".repeat(257) } },
        ],
      },
    ];
    const attempts = await Promise.all(
      invalid.map(async (item) => await payer.pay(item))
    );
    for (const attempt of attempts) {
      expect(attempt.header).toBeNull();
    }
    expect(signed).toBe(0);
  });

  test("builds only the exact transfer with a buyer signature and an unsigned facilitator slot", async () => {
    const mintData = Buffer.alloc(82);
    mintData[44] = 6;
    mintData[45] = 1;
    const methods: string[] = [];
    const server = rpcServer((method) => {
      methods.push(method);
      if (method === "getAccountInfo") {
        return {
          context: { slot: 1 },
          value: {
            data: [mintData.toString("base64"), "base64"],
            executable: false,
            lamports: 1,
            owner: TOKEN_PROGRAM,
            rentEpoch: 0,
            space: 82,
          },
        };
      }
      if (method === "getLatestBlockhash") {
        return {
          context: { slot: 1 },
          value: { blockhash: BUYER, lastValidBlockHeight: 9999 },
        };
      }
      throw new Error(`Unexpected RPC method ${method}`);
    });
    try {
      const signer = await generateKeyPairSigner();
      const payer = solanaPayer({
        network: SOLANA_DEVNET,
        rpcUrl: server.url.href,
        signer,
      });
      const attempt = await payer.pay({
        ...challenge,
        accepts: [
          { ...offer, extra: { ...offer.extra, memo: "x".repeat(256) } },
        ],
      });
      expect(attempt.stubbed).toBe(false);
      const payload = Schema.decodeUnknownSync(payloadSchema)(
        JSON.parse(
          Buffer.from(attempt.header ?? "", "base64").toString("utf-8")
        )
      );
      expect(payload.accepted).toEqual({
        amount: "10000",
        network: SOLANA_DEVNET,
        payTo: BUYER,
      });
      const transaction = getTransactionDecoder().decode(
        Buffer.from(payload.payload.transaction, "base64")
      );
      expect(transaction.signatures[signer.address]).toHaveLength(64);
      expect(transaction.signatures[address(FEE_PAYER)]).toBeNull();
      const compiled = getCompiledTransactionMessageDecoder().decode(
        transaction.messageBytes
      );
      expect(compiled.staticAccounts[0]).toBe(address(FEE_PAYER));
      const transfer = compiled.instructions.find(
        (instruction) => instruction.data?.[0] === 12
      );
      expect(transfer).toBeDefined();
      expect(transfer?.data).toEqual(
        new Uint8Array([12, 16, 39, 0, 0, 0, 0, 0, 0, 6])
      );
      expect(methods).toEqual(["getAccountInfo", "getLatestBlockhash"]);
    } finally {
      await server.stop(true);
    }
  });
});

test("Solana funding considers the associated USDC account and ignores another token account", async () => {
  const encoder = getAddressEncoder();
  const [associated] = await getProgramDerivedAddress({
    programAddress: address("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"),
    seeds: [
      encoder.encode(address(BUYER)),
      encoder.encode(address(TOKEN_PROGRAM)),
      encoder.encode(address(MINT)),
    ],
  });
  const account = (pubkey: string, amount: string) => ({
    pubkey,
    account: {
      data: {
        parsed: {
          info: {
            mint: MINT,
            owner: BUYER,
            state: "initialized",
            tokenAmount: { amount, decimals: 6 },
          },
          type: "account",
        },
        program: "spl-token",
        space: 165,
      },
      executable: false,
      lamports: 1,
      owner: TOKEN_PROGRAM,
      rentEpoch: 0,
    },
  });
  const server = rpcServer(() => ({
    context: { slot: 1 },
    value: [account(associated, "10000"), account(FEE_PAYER, "999999999")],
  }));
  try {
    expect(
      await solanaBalance({
        address: BUYER,
        network: SOLANA_DEVNET,
        rpcUrl: server.url.href,
      })
    ).toBe(10_000n);
  } finally {
    await server.stop(true);
  }
});

test("Solana reconciliation keeps missing and unconfirmed transactions unknown", async () => {
  let status: {
    confirmationStatus: "processed" | "confirmed" | "finalized";
    err: { InstructionError: (string | number)[] } | null;
  } | null = null;
  const server = rpcServer(() => ({ context: { slot: 1 }, value: [status] }));
  const options = {
    network: SOLANA_DEVNET,
    rpcUrl: server.url.href,
    transactionId: "1".repeat(64),
  } as const;
  try {
    expect(await reconcileSolanaPayment(options)).toBe("unknown");
    status = { confirmationStatus: "processed", err: null };
    expect(await reconcileSolanaPayment(options)).toBe("unknown");
    status = { confirmationStatus: "confirmed", err: null };
    expect(await reconcileSolanaPayment(options)).toBe("success");
    status = {
      confirmationStatus: "finalized",
      err: { InstructionError: [0, "Custom"] },
    };
    expect(await reconcileSolanaPayment(options)).toBe("failed");
  } finally {
    await server.stop(true);
  }
});
