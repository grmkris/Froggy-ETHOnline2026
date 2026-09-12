import { describe, expect, test } from "bun:test";

import { keccak_256 } from "@noble/hashes/sha3";
import { bytesToHex } from "@noble/hashes/utils";
import { Schema } from "effect";

import {
  decodeString,
  encodeTransferWithAuthorization,
  readTokenDomain,
  sendAuthorizedTransfer,
  TRANSFER_WITH_AUTHORIZATION_ABI,
  TRANSFER_WITH_AUTHORIZATION_SELECTOR,
} from "./authorized-transfer";
import type { EvmRpc } from "./evm-rpc";
import { EvmRpcError } from "./evm-rpc";
import type {
  AgentEvmSigner,
  AgentTypedDataSigner,
  UnsignedEvmTransaction,
} from "./evm-signer";
import { PrivySignerRefusedError } from "./evm-signer";

const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const TREASURY = "0x8Cc232c9EB25b4b20ee448106858e3B6281708C2";
const PERSON = "0x1111111111111111111111111111111111111111";
const RELAYER = "0x2222222222222222222222222222222222222222";
const NONCE = `0x${"ab".repeat(32)}`;
const SIGNATURE = `0x${"11".repeat(32)}${"22".repeat(32)}1c`;

/** `name()` → "USD Coin", `version()` → "2", ABI-encoded as the chain answers. */
const abiString = (value: string): string => {
  const bytes = Buffer.from(value, "utf-8").toString("hex");
  return `0x${"20".padStart(64, "0")}${value.length.toString(16).padStart(64, "0")}${bytes.padEnd(64, "0")}`;
};

/** What a promise failed with, as `name: message` plus the refusal flag, or null when it did not. */
const failure = async <T>(
  work: Promise<T>
): Promise<{ readonly text: string; readonly refused: boolean } | null> => {
  try {
    await work;
    return null;
  } catch (error) {
    return {
      refused: error instanceof EvmRpcError && error.refused,
      text: error instanceof Error ? `${error.name}: ${error.message}` : "?",
    };
  }
};

const rpcWith = (overrides: Partial<EvmRpc> = {}): EvmRpc => ({
  call: async (_to, data) => {
    await Promise.resolve();
    return data === "0x06fdde03" ? abiString("USD Coin") : abiString("2");
  },
  chainId: async () => {
    await Promise.resolve();
    return 8453;
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
    return 7;
  },
  transactionKnown: async () => {
    await Promise.resolve();
    return false;
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

const personSigner = () => {
  const typed: Parameters<AgentTypedDataSigner["signTypedData"]>[0][] = [];
  const signer: AgentTypedDataSigner = {
    address: PERSON,
    signTypedData: async (typedData) => {
      typed.push(typedData);
      await Promise.resolve();
      return SIGNATURE;
    },
  };
  return { signer, typed };
};

const relayerSigner = () => {
  const signed: UnsignedEvmTransaction[] = [];
  const signer: Pick<AgentEvmSigner, "address" | "signTransaction"> = {
    address: RELAYER,
    signTransaction: async (transaction) => {
      signed.push(transaction);
      await Promise.resolve();
      return "0x02f8abcd";
    },
  };
  return { signer, signed };
};

describe("encodeTransferWithAuthorization", () => {
  test("uses the selector the treasury policy decodes and lays out nine words", () => {
    const data = encodeTransferWithAuthorization(
      {
        from: PERSON,
        to: TREASURY,
        value: 1_744_000n,
        validAfter: 0n,
        validBefore: 1_800_000_000n,
        nonce: NONCE,
      },
      SIGNATURE
    );
    const selector = `0x${bytesToHex(
      keccak_256(
        new TextEncoder().encode(
          "transferWithAuthorization(address,address,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32)"
        )
      )
    ).slice(0, 8)}`;
    expect(TRANSFER_WITH_AUTHORIZATION_SELECTOR).toBe(selector);
    expect(data.startsWith(selector)).toBe(true);
    expect(data.length).toBe(10 + 9 * 64);
    const words = data.slice(10).match(/.{64}/gu) ?? [];
    expect(words[1]).toBe(TREASURY.slice(2).toLowerCase().padStart(64, "0"));
    expect(BigInt(`0x${words[2] ?? ""}`)).toBe(1_744_000n);
    expect(words[5]).toBe(NONCE.slice(2));
    expect(BigInt(`0x${words[6] ?? ""}`)).toBe(28n);
  });

  test("lifts a recovery id of 0 or 1 to the 27/28 the token takes", () => {
    const data = encodeTransferWithAuthorization(
      {
        from: PERSON,
        to: TREASURY,
        value: 1n,
        validAfter: 0n,
        validBefore: 1n,
        nonce: NONCE,
      },
      `0x${"11".repeat(32)}${"22".repeat(32)}01`
    );
    const words = data.slice(10).match(/.{64}/gu) ?? [];
    expect(BigInt(`0x${words[6] ?? ""}`)).toBe(28n);
  });

  test("refuses a signature that is not 65 bytes", () => {
    expect(() =>
      encodeTransferWithAuthorization(
        {
          from: PERSON,
          to: TREASURY,
          value: 1n,
          validAfter: 0n,
          validBefore: 1n,
          nonce: NONCE,
        },
        "0x1234"
      )
    ).toThrow("65 bytes");
  });
});

const Condition = Schema.Struct({
  abi: Schema.optional(Schema.Unknown),
  operator: Schema.String,
  field: Schema.String,
  field_source: Schema.String,
  value: Schema.Union([Schema.String, Schema.Array(Schema.String)]),
});
const Rule = Schema.Struct({
  action: Schema.String,
  conditions: Schema.Array(Condition),
  method: Schema.String,
  name: Schema.String,
});
const Rules = Schema.Array(Rule);
const Policy = Schema.Struct({ rules: Rules });
/** A committed policy document, decoded at the boundary. */
const committed = async <T>(
  name: string,
  schema: Schema.Codec<T>
): Promise<T> => {
  const json: unknown = await Bun.file(
    new URL(`../../../docs/${name}`, import.meta.url)
  ).json();
  return Schema.decodeUnknownSync(schema)(json);
};

describe("the committed treasury relay rules", () => {
  test.each([
    {
      name: "settle-conversion-authorization-usdc-base-mainnet",
      abi: [TRANSFER_WITH_AUTHORIZATION_ABI[0]],
    },
    {
      name: "settle-conversion-erc1271-usdc-base",
      abi: [TRANSFER_WITH_AUTHORIZATION_ABI[1]],
    },
  ])(
    "$name decodes its overload and preserves the treasury restrictions",
    async ({ name, abi }) => {
      const rules = await committed("privy-treasury-relay-rule.json", Rules);
      const shared = await committed("privy-agent-policy.json", Policy);
      const matching = rules.filter((candidate) => candidate.name === name);
      expect(matching).toHaveLength(1);
      const [rule] = matching;
      expect(rule?.method).toBe("eth_signTransaction");
      expect(rule?.action).toBe("ALLOW");
      expect(rule?.conditions).toEqual([
        {
          field_source: "ethereum_transaction",
          field: "chain_id",
          operator: "eq",
          value: "8453",
        },
        {
          field_source: "ethereum_transaction",
          field: "to",
          operator: "eq",
          value: USDC,
        },
        {
          field_source: "ethereum_transaction",
          field: "value",
          operator: "eq",
          value: "0",
        },
        {
          field_source: "ethereum_calldata",
          field: "transferWithAuthorization.to",
          operator: "eq",
          value: TREASURY,
          abi,
        },
        {
          field_source: "system",
          field: "current_unix_timestamp",
          operator: "lt",
          value: "1790726400",
        },
      ]);
      const treasury = shared.rules
        .find(
          (candidate) => candidate.name === "pocket-topup-usdc-base-mainnet"
        )
        ?.conditions.find((condition) => condition.field === "transfer.to");
      expect(treasury?.value).toBeString();
      expect(String(treasury?.value).toLowerCase()).toBe(
        TREASURY.toLowerCase()
      );
    }
  );
});

describe("readTokenDomain", () => {
  test("decodes name() and version() from the token", async () => {
    expect(await readTokenDomain(rpcWith(), USDC)).toEqual({
      name: "USD Coin",
      version: "2",
    });
  });

  test("decodeString answers null for anything that is not one ABI string", () => {
    expect(decodeString("0x")).toBeNull();
    expect(decodeString("0x1234")).toBeNull();
  });

  test("throws rather than sign under a guessed domain", async () => {
    const rpc = rpcWith({
      call: async () => {
        await Promise.resolve();
        return "0x";
      },
    });
    const refused = await failure(readTokenDomain(rpc, USDC));
    expect(refused?.text).toContain("no EIP-712 domain");
  });
});

describe("sendAuthorizedTransfer", () => {
  const input = (rpc: EvmRpc) => {
    const person = personSigner();
    const relayer = relayerSigner();
    return {
      person,
      relayer,
      run: async (beforeBroadcast?: (hash: string) => Promise<void>) =>
        await sendAuthorizedTransfer({
          amount: 1_744_000n,
          beforeBroadcast,
          chainId: 8453,
          from: person.signer,
          now: () => 1_700_000_000,
          relayer: relayer.signer,
          rpc,
          to: TREASURY,
          token: USDC,
        }),
    };
  };

  test("the person signs the authorization; the relayer signs a zero-value settlement to the token", async () => {
    const { person, relayer, run } = input(rpcWith());
    const hashes: string[] = [];
    const outcome = await run(async (hash) => {
      hashes.push(hash);
      await Promise.resolve();
    });
    expect(outcome).toEqual({ hash: "0xhash", status: "success" });

    const [typed] = person.typed;
    expect(typed?.primaryType).toBe("TransferWithAuthorization");
    expect(typed?.domain).toEqual({
      name: "USD Coin",
      version: "2",
      chainId: 8453,
      verifyingContract: USDC,
    });
    expect(typed?.message["from"]).toBe(PERSON);
    expect(typed?.message["to"]).toBe(TREASURY);
    expect(typed?.message["value"]).toBe(1_744_000n);
    expect(typed?.message["validBefore"]).toBe(1_700_003_600n);

    const [settlement] = relayer.signed;
    expect(settlement?.to).toBe(USDC);
    expect(settlement?.value).toBe(0n);
    expect(settlement?.nonce).toBe(7);
    expect(
      settlement?.data.startsWith(TRANSFER_WITH_AUTHORIZATION_SELECTOR)
    ).toBe(true);
    // The hash is known, and persisted, before the bytes leave.
    expect(hashes).toEqual([
      `0x${bytesToHex(keccak_256(Buffer.from("02f8abcd", "hex")))}`,
    ]);
  });

  test("a refusal of the person's signature names the way to refresh their rules", async () => {
    const refused = await failure(
      sendAuthorizedTransfer({
        amount: 1n,
        chainId: 8453,
        from: {
          address: PERSON,
          signTypedData: async () => {
            await Promise.resolve();
            throw new PrivySignerRefusedError(
              "Privy refused to sign under policy p1: no rule matched"
            );
          },
        },
        relayer: relayerSigner().signer,
        rpc: rpcWith(),
        to: TREASURY,
        token: USDC,
      })
    );
    expect(refused?.text).toMatch(
      /^PrivySignerRefusedError: .*no rule matched.*save them again in Settings/u
    );
  });

  test("a refusal of the relayer's signature says which signer said no", async () => {
    const refused = await failure(
      sendAuthorizedTransfer({
        amount: 1n,
        chainId: 8453,
        from: personSigner().signer,
        relayer: {
          address: RELAYER,
          signTransaction: async () => {
            await Promise.resolve();
            throw new PrivySignerRefusedError("Privy refused: treasury policy");
          },
        },
        rpc: rpcWith(),
        to: TREASURY,
        token: USDC,
      })
    );
    expect(refused?.text).toContain(
      `The gas relayer ${RELAYER} could not sign`
    );
  });

  test("a node that refuses the relayer's bytes is reported as the relayer's problem, still refused", async () => {
    const rpc = rpcWith({
      sendRawTransaction: async () => {
        await Promise.resolve();
        throw new EvmRpcError(
          "eth_sendRawTransaction: gas required exceeds allowance (0)",
          true
        );
      },
    });
    const { run } = input(rpc);
    const refused = await failure(run());
    expect(refused?.refused).toBe(true);
    expect(refused?.text).toContain(`EvmRpcError: the gas relayer ${RELAYER}`);
    expect(refused?.text).toContain("gas required exceeds allowance");
  });
});

test("ERC-1271 conversion preserves the full signature in the bytes overload", () => {
  const signature = `0x${"ab".repeat(130)}`;
  const data = encodeTransferWithAuthorization(
    {
      from: PERSON,
      to: TREASURY,
      value: 100n,
      validAfter: 0n,
      validBefore: 1000n,
      nonce: NONCE,
    },
    signature
  );
  const expectedSelector = bytesToHex(
    keccak_256(
      new TextEncoder().encode(
        "transferWithAuthorization(address,address,uint256,uint256,uint256,bytes32,bytes)"
      )
    )
  ).slice(0, 8);
  expect(data.slice(2, 10)).toBe(expectedSelector);
  const words = data.slice(10).match(/.{64}/gu) ?? [];
  expect(BigInt(`0x${words[6] ?? ""}`)).toBe(224n);
  expect(BigInt(`0x${words[7] ?? ""}`)).toBe(130n);
  expect(data.slice(10 + 8 * 64, 10 + 8 * 64 + 260)).toBe(signature.slice(2));
  expect(words[1]).toBe(TREASURY.slice(2).toLowerCase().padStart(64, "0"));
});

test("invalid delegated USDC signatures fail simulation before the treasury signs or broadcasts", async () => {
  const relayer = relayerSigner();
  const result = await failure(
    sendAuthorizedTransfer({
      amount: 100n,
      chainId: 8453,
      domain: { name: "USD Coin", version: "2" },
      from: {
        address: PERSON,
        signTypedData: async () =>
          await Promise.resolve(`0x${"ab".repeat(130)}`),
      },
      relayer: relayer.signer,
      token: USDC,
      to: TREASURY,
      rpc: rpcWith({
        call: async () => {
          await Promise.resolve();
          throw new EvmRpcError("invalid signature", true);
        },
      }),
    })
  );
  expect(result?.text).toContain("invalid signature");
  expect(relayer.signed).toHaveLength(0);
});
