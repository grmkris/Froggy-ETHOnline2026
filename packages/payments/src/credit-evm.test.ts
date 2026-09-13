import { describe, expect, it } from "bun:test";

import { authorizationTypes } from "@x402/evm";
import { Schema } from "effect";
import {
  encodeEventTopics,
  erc20Abi,
  getAddress,
  isHex,
  keccak256,
  toHex,
} from "viem";
import type { Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import type { CreditEvmOptions, CreditEvmSubmission } from "./credit-evm";
import { creditEvmAuthorization, evmCreditSettlement } from "./credit-evm";

const payer = `0x${"11".repeat(20)}`;
const recipient = `0x${"22".repeat(20)}`;
const token = `0x${"33".repeat(20)}`;
const envelope = () => ({
  x402Version: 2,
  accepted: {
    scheme: "exact",
    network: "eip155:84532",
    asset: token,
    payTo: recipient,
    amount: "1000000",
    maxTimeoutSeconds: 120,
    extra: { name: "USD Coin", version: "2", assetTransferMethod: "eip3009" },
  },
  payload: {
    signature: `0x${"44".repeat(65)}`,
    authorization: {
      from: payer,
      to: recipient,
      value: "1000000",
      validAfter: "0",
      validBefore: "9999999999",
      nonce: `0x${"55".repeat(32)}`,
    },
  },
});
const header = (value: Schema.Json) =>
  Buffer.from(JSON.stringify(value)).toString("base64");

describe("Base credit payment identity", () => {
  it("deduplicates the authorization regardless of signature encoding", () => {
    const first = envelope();
    const second = {
      ...first,
      payload: { ...first.payload, signature: `0x${"66".repeat(65)}` },
    };
    expect(creditEvmAuthorization(header(first))).toBe(
      creditEvmAuthorization(header(second))
    );
  });

  it("rejects unsupported schemes before a treasury signature or network request", () => {
    let signed = false;
    const settlement = evmCreditSettlement({
      network: "eip155:84532",
      rpcUrl: "http://127.0.0.1:1",
      token,
      payTo: recipient,
      relayer: {
        address: recipient,
        signTransaction: async () => {
          signed = true;
          return await Promise.reject(new Error("must not sign"));
        },
      },
    });
    const payment = envelope();
    expect(
      settlement.settle({
        header: header(payment),
        payer,
        challenge: {
          x402Version: 2,
          accepts: [{ ...payment.accepted, network: "eip155:8453" }],
        },
        submission: null,
        beforeBroadcast: async () => {
          await Promise.reject(new Error("must not broadcast"));
        },
      })
    ).rejects.toThrow("does not match");
    expect(signed).toBe(false);
    expect(() =>
      creditEvmAuthorization(header({ ...payment, x402Version: 1 }))
    ).toThrow();
    expect(() =>
      creditEvmAuthorization(
        header({ ...payment, payload: { permit2Authorization: {} } })
      )
    ).toThrow();
  });
});

const RpcRequest = Schema.Struct({
  id: Schema.Union([Schema.String, Schema.Number]),
  method: Schema.String,
  params: Schema.optional(Schema.Array(Schema.Unknown)),
});
const rawTransaction = "0xdeadbeef";
const savedSubmission: CreditEvmSubmission = {
  transactionId: keccak256(rawTransaction),
  signedTransaction: rawTransaction,
  transactionNonce: 7,
};

interface ReceiptFixture {
  readonly from?: string;
  readonly to?: string;
  readonly token?: string;
  readonly value?: bigint;
  readonly reverted?: boolean;
  readonly omitTransfer?: boolean;
}
const receiptFor = (hash: string, changes: ReceiptFixture = {}) => ({
  blockHash: toHex(1n, { size: 32 }),
  blockNumber: "0x2",
  contractAddress: null,
  cumulativeGasUsed: "0x186a0",
  effectiveGasPrice: "0x1",
  from: recipient,
  gasUsed: "0x186a0",
  logsBloom: `0x${"00".repeat(256)}`,
  status: changes.reverted === true ? "0x0" : "0x1",
  to: token,
  transactionHash: hash,
  transactionIndex: "0x0",
  type: "0x2",
  logs:
    changes.omitTransfer === true
      ? []
      : [
          {
            address: changes.token ?? token,
            blockHash: toHex(1n, { size: 32 }),
            blockNumber: "0x2",
            data: toHex(changes.value ?? 1_000_000n, { size: 32 }),
            logIndex: "0x0",
            removed: false,
            topics: encodeEventTopics({
              abi: erc20Abi,
              eventName: "Transfer",
              args: {
                from: getAddress(changes.from ?? payer),
                to: getAddress(changes.to ?? recipient),
              },
            }),
            transactionHash: hash,
            transactionIndex: "0x0",
          },
        ],
});

const hexBytes = (value: string): Hex => {
  if (!isHex(value)) {
    throw new Error("Invalid fixture hexadecimal data");
  }
  return value;
};

interface RpcFixtureState {
  receipt: ReturnType<typeof receiptFor> | null;
  calls: string[];
  sent: string[];
  order: string[];
  persisted: CreditEvmSubmission | null;
}

const rpcFixture = (receipt: ReturnType<typeof receiptFor> | null) => {
  const state: RpcFixtureState = {
    receipt,
    calls: [],
    sent: [],
    order: [],
    persisted: null,
  };
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: async (request) => {
      const rpc = Schema.decodeUnknownSync(RpcRequest)(await request.json());
      state.calls.push(rpc.method);
      let result: Schema.Json = null;
      switch (rpc.method) {
        case "eth_getTransactionReceipt": {
          result = state.receipt;
          break;
        }
        case "eth_getCode": {
          result = rpc.params?.[0] === token ? "0x6000" : "0x";
          break;
        }
        case "eth_call": {
          result = "0x";
          break;
        }
        case "eth_getTransactionCount": {
          result = "0x7";
          break;
        }
        case "eth_gasPrice": {
          result = "0xf4240";
          break;
        }
        case "eth_blockNumber": {
          result = "0x2";
          break;
        }
        case "eth_sendRawTransaction": {
          const transaction = Schema.decodeUnknownSync(Schema.String)(
            rpc.params?.[0]
          );
          state.sent.push(transaction);
          state.order.push("broadcast");
          result = keccak256(hexBytes(transaction));
          break;
        }
        default: {
          return Response.json({
            jsonrpc: "2.0",
            id: rpc.id,
            error: {
              code: -32_601,
              message: `Unexpected local RPC method: ${rpc.method}`,
            },
          });
        }
      }
      return Response.json({ jsonrpc: "2.0", id: rpc.id, result });
    },
  });
  return { state, server };
};
const paymentInput = (
  payment: ReturnType<typeof envelope>,
  submission: CreditEvmSubmission | null
) => ({
  header: header(payment),
  payer: payment.payload.authorization.from,
  challenge: { x402Version: 2, accepts: [payment.accepted] },
  submission,
  beforeBroadcast: async () =>
    await Promise.reject(
      new Error("Recovery must not sign or persist another transaction")
    ),
});

// Publicly known test keys sign only messages and transactions served by the loopback fixture.
const account = privateKeyToAccount(
  "0x1111111111111111111111111111111111111111111111111111111111111111"
);
const signedEnvelope = async () => {
  const payment = envelope();
  const authorization = {
    ...payment.payload.authorization,
    from: account.address,
  };
  const signature = await account.signTypedData({
    domain: {
      name: "USD Coin",
      version: "2",
      chainId: 84_532,
      verifyingContract: getAddress(token),
    },
    types: authorizationTypes,
    primaryType: "TransferWithAuthorization",
    message: {
      from: account.address,
      to: getAddress(recipient),
      value: BigInt(authorization.value),
      validAfter: BigInt(authorization.validAfter),
      validBefore: BigInt(authorization.validBefore),
      nonce: hexBytes(authorization.nonce),
    },
  });
  return { ...payment, payload: { authorization, signature } };
};

describe("USDC credit settlement and recovery", () => {
  it("resends only persisted bytes while unknown, then confirms the exact quoted transfer without signing", async () => {
    const fixture = rpcFixture(null);
    let signatures = 0;
    const options = {
      network: "eip155:84532" as const,
      rpcUrl: fixture.server.url.toString(),
      token,
      payTo: recipient,
      relayer: {
        address: recipient,
        signTransaction: async () => {
          signatures += 1;
          return await Promise.reject(new Error("Recovery cannot sign"));
        },
      },
    };
    try {
      const first = await evmCreditSettlement(options).settle(
        paymentInput(envelope(), savedSubmission)
      );
      expect(first.status).toBe("uncertain");
      expect(first.transactionId).toBe(savedSubmission.transactionId);
      expect(fixture.state.sent).toEqual([rawTransaction]);
      fixture.state.receipt = receiptFor(savedSubmission.transactionId);
      const confirmed = await evmCreditSettlement(options).settle(
        paymentInput(envelope(), savedSubmission)
      );
      expect(confirmed.status).toBe("confirmed");
      expect(confirmed.error).toBeNull();
      expect(fixture.state.sent).toEqual([rawTransaction]);
      expect(signatures).toBe(0);
      expect(fixture.state.calls).not.toContain("eth_getTransactionCount");
    } finally {
      await fixture.server.stop(true);
    }
  });

  it.each([
    { label: "a reverted transaction", reverted: true },
    { label: "no Transfer event", omitTransfer: true },
    { label: "another token", token: recipient },
    { label: "another payer", from: recipient },
    { label: "another recipient", to: payer },
    { label: "a different amount", value: 999_999n },
  ])(
    "refuses credit confirmation for $label",
    async ({ label: _label, ...changes }) => {
      const fixture = rpcFixture(
        receiptFor(savedSubmission.transactionId, changes)
      );
      let signatures = 0;
      try {
        const settled = await evmCreditSettlement({
          network: "eip155:84532",
          rpcUrl: fixture.server.url.toString(),
          token,
          payTo: recipient,
          relayer: {
            address: recipient,
            signTransaction: async () => {
              signatures += 1;
              return await Promise.reject(new Error("Must not sign"));
            },
          },
        }).settle(paymentInput(envelope(), savedSubmission));
        expect(settled.status).toBe("failed");
        expect(settled.error).not.toBeNull();
        expect(fixture.state.sent).toHaveLength(0);
        expect(signatures).toBe(0);
      } finally {
        await fixture.server.stop(true);
      }
    }
  );

  it("does not broadcast when durable transaction persistence fails", async () => {
    const payment = await signedEnvelope();
    const fixture = rpcFixture(null);
    let signatures = 0;
    try {
      const settled = await evmCreditSettlement({
        network: "eip155:84532",
        rpcUrl: fixture.server.url.toString(),
        token,
        payTo: recipient,
        relayer: {
          address: account.address,
          signTransaction: async () => {
            signatures += 1;
            return await Promise.resolve(rawTransaction);
          },
        },
      }).settle({
        ...paymentInput(payment, null),
        beforeBroadcast: async () => {
          await Promise.reject(
            new Error("Database unavailable before broadcast")
          );
        },
      });
      expect(settled.status).toBe("failed");
      expect(settled.transactionId).toBeNull();
      expect(signatures).toBe(1);
      expect(fixture.state.sent).toHaveLength(0);
      expect(fixture.state.calls).not.toContain("eth_sendRawTransaction");
    } finally {
      await fixture.server.stop(true);
    }
  });

  it("persists transaction identity and bytes before broadcasting and never signs again on replay", async () => {
    const payment = await signedEnvelope();
    const fixture = rpcFixture(null);
    let signatures = 0;
    const options = {
      network: "eip155:84532" as const,
      rpcUrl: fixture.server.url.toString(),
      token,
      payTo: recipient,
      relayer: {
        address: account.address,
        signTransaction: async (
          input: Parameters<CreditEvmOptions["relayer"]["signTransaction"]>[0]
        ) => {
          signatures += 1;
          fixture.state.order.push("sign");
          expect(input.to).toBe(token);
          expect(input.value).toBe(0n);
          expect(input.nonce).toBe(7);
          return await account.signTransaction({
            chainId: input.chainId,
            type: "eip1559",
            to: getAddress(input.to),
            data: hexBytes(input.data),
            gas: input.gasLimit,
            nonce: input.nonce,
            maxFeePerGas: input.maxFeePerGas,
            maxPriorityFeePerGas: input.maxPriorityFeePerGas,
            value: input.value,
          });
        },
      },
    };
    try {
      const settled = await evmCreditSettlement(options).settle({
        ...paymentInput(payment, null),
        beforeBroadcast: async (submission) => {
          expect(fixture.state.sent).toHaveLength(0);
          fixture.state.order.push("persist");
          fixture.state.persisted = submission;
          fixture.state.receipt = receiptFor(submission.transactionId, {
            from: account.address,
          });
          await Promise.resolve();
        },
      });
      expect({
        settled,
        calls: fixture.state.calls,
        order: fixture.state.order,
      }).toMatchObject({ settled: { status: "confirmed" } });
      expect(fixture.state.order).toEqual(["sign", "persist", "broadcast"]);
      const { persisted } = fixture.state;
      if (persisted === null) {
        throw new Error("Expected durable transaction identity");
      }
      expect(persisted.transactionId).toBe(
        keccak256(hexBytes(persisted.signedTransaction))
      );
      expect(fixture.state.sent).toEqual([persisted.signedTransaction]);
      const replayed = await evmCreditSettlement(options).settle(
        paymentInput(payment, persisted)
      );
      expect(replayed.status).toBe("confirmed");
      expect(signatures).toBe(1);
      expect(fixture.state.sent).toHaveLength(1);
    } finally {
      await fixture.server.stop(true);
    }
  });
});
