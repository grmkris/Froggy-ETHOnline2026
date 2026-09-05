import { describe, expect, test } from "bun:test";

import type { EvmRpc } from "./evm-rpc";
import type { AgentEvmSigner, UnsignedEvmTransaction } from "./evm-signer";
import { sendErc20Transfer } from "./transfer";

const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const TREASURY = "0x74bcfbc5abb7c342a128764e1f17707ee3b0031f";

const rpcWith = (overrides: Partial<EvmRpc> = {}): EvmRpc => ({
  chainId: async () => {
    await Promise.resolve();
    return 84_532;
  },
  gasPrice: async () => {
    await Promise.resolve();
    return 6_000_000n;
  },
  maxPriorityFeePerGas: async () => {
    await Promise.resolve();
    return 0n;
  },
  sendRawTransaction: async () => {
    await Promise.resolve();
    return "0xhash";
  },
  transactionCount: async () => {
    await Promise.resolve();
    return 3;
  },
  transactionReceipt: async () => {
    await Promise.resolve();
    return null;
  },
  waitForReceipt: async () => {
    await Promise.resolve();
    return { blockNumber: 1, status: "success", transactionHash: "0xhash" };
  },
  ...overrides,
});

const signerRecording = () => {
  const signed: UnsignedEvmTransaction[] = [];
  const signer: AgentEvmSigner = {
    address: "0x1111111111111111111111111111111111111111",
    signTransaction: async (transaction) => {
      signed.push(transaction);
      await Promise.resolve();
      return "0x02f8signed";
    },
    signTypedData: async () => {
      await Promise.resolve();
      return "0xsig";
    },
  };
  return { signed, signer };
};

describe("sendErc20Transfer", () => {
  test("signs a type-2 transfer to the token with the encoded call", async () => {
    const { signed, signer } = signerRecording();
    const broadcast: string[] = [];
    const outcome = await sendErc20Transfer({
      amount: 2_000_000n,
      chainId: 84_532,
      rpc: rpcWith({
        sendRawTransaction: async (raw) => {
          broadcast.push(raw);
          await Promise.resolve();
          return "0xhash";
        },
      }),
      signer,
      to: TREASURY,
      token: USDC,
    });

    expect(outcome).toEqual({ hash: "0xhash", status: "success" });
    expect(broadcast).toEqual(["0x02f8signed"]);
    const [transaction] = signed;
    expect(transaction?.to).toBe(USDC);
    expect(transaction?.value).toBe(0n);
    expect(transaction?.nonce).toBe(3);
    expect(transaction?.chainId).toBe(84_532);
    expect(transaction?.data.startsWith("0xa9059cbb")).toBe(true);
    expect(transaction?.data).toContain(TREASURY.slice(2));
  });

  test("keeps the tip above the floor and the max fee above the tip", async () => {
    const { signed, signer } = signerRecording();
    await sendErc20Transfer({
      amount: 1n,
      chainId: 84_532,
      rpc: rpcWith(),
      signer,
      to: TREASURY,
      token: USDC,
    });

    const [transaction] = signed;
    expect(transaction?.maxPriorityFeePerGas).toBe(1_000_000n);
    expect(transaction?.maxFeePerGas).toBe(6_000_000n * 2n + 1_000_000n);
  });

  test("a node without eth_maxPriorityFeePerGas still gets a tip", async () => {
    const { signed, signer } = signerRecording();
    await sendErc20Transfer({
      amount: 1n,
      chainId: 84_532,
      rpc: rpcWith({
        maxPriorityFeePerGas: async () => {
          await Promise.resolve();
          throw new Error("method not found");
        },
      }),
      signer,
      to: TREASURY,
      token: USDC,
    });

    expect(signed[0]?.maxPriorityFeePerGas).toBe(1_000_000n);
  });

  test("a signer refusal stops everything before any broadcast", async () => {
    let broadcasts = 0;
    const signer: AgentEvmSigner = {
      address: "0x1111111111111111111111111111111111111111",
      signTransaction: async () => {
        await Promise.resolve();
        throw new Error("Privy refused to sign: policy rk6q… denied");
      },
      signTypedData: async () => {
        await Promise.resolve();
        return "0xsig";
      },
    };

    let refusal: string | null = null;
    try {
      await sendErc20Transfer({
        amount: 1n,
        chainId: 84_532,
        rpc: rpcWith({
          sendRawTransaction: async () => {
            broadcasts += 1;
            await Promise.resolve();
            return "0xhash";
          },
        }),
        signer,
        to: TREASURY,
        token: USDC,
      });
    } catch (error) {
      refusal = error instanceof Error ? error.message : "?";
    }
    expect(refusal).toContain("Privy refused");
    expect(broadcasts).toBe(0);
  });
});
