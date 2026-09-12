import { describe, expect, it } from "bun:test";

import { Schema } from "effect";

import { EvmAddress } from "./address";
import {
  assessMessage,
  assessTransaction,
  assessTypedData,
  parseSiwe,
} from "./dapp-decode";

const address = Schema.decodeUnknownSync(EvmAddress);
const ME = address("0x1111111111111111111111111111111111111111");
const OTHER = address("0x2222222222222222222222222222222222222222");
const SPENDER = "0x3333333333333333333333333333333333333333";
/** Base mainnet USDC, from `KNOWN_ASSETS`; the chain id makes it print as USDC. */
const USDC = address("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
const BASE = { account: ME, chainId: 8453 };

const pad = (hex: string): string => hex.replace(/^0x/u, "").padStart(64, "0");
const call = (selector: string, ...words: string[]): string =>
  `0x${selector}${words.map(pad).join("")}`;
const MAX = "f".repeat(64);

const utf8Hex = (text: string): string =>
  `0x${Array.from(new TextEncoder().encode(text), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;

describe("assessTransaction", () => {
  it("reads a plain ETH send", () => {
    const read = assessTransaction(
      {
        data: "0x",
        from: ME,
        kind: "send_transaction",
        to: OTHER,
        value: "0x2386f26fc10000",
      },
      BASE
    );
    expect(read.refusals).toEqual([]);
    expect(read.title).toBe("Send 0.01 ETH");
    expect(read.lines[0]).toContain(OTHER.toLowerCase());
  });

  it("reads an ERC-20 transfer in the token's own units when it is known", () => {
    const read = assessTransaction(
      {
        data: call("a9059cbb", OTHER, (12_500_000).toString(16)),
        from: ME,
        kind: "send_transaction",
        to: USDC,
        value: "0x0",
      },
      BASE
    );
    expect(read.refusals).toEqual([]);
    expect(read.title).toBe("Send 12.5 USDC");
  });

  it("refuses an unlimited approve rather than warning about it", () => {
    const read = assessTransaction(
      {
        data: call("095ea7b3", SPENDER, MAX),
        from: ME,
        kind: "send_transaction",
        to: USDC,
        value: "0x0",
      },
      BASE
    );
    expect(read.refusals).toHaveLength(1);
    expect(read.refusals[0]).toContain("unlimited");
  });

  it("allows an exact approve with a warning", () => {
    const read = assessTransaction(
      {
        data: call("095ea7b3", SPENDER, (5_000_000).toString(16)),
        from: ME,
        kind: "send_transaction",
        to: USDC,
        value: "0x0",
      },
      BASE
    );
    expect(read.refusals).toEqual([]);
    expect(read.title).toBe("Allow 5 USDC");
    expect(read.lines[0]).toContain(SPENDER);
    expect(read.warnings).toHaveLength(1);
  });

  it("refuses an unlimited Permit2 approve, which is 2^160 - 1 not 2^256 - 1", () => {
    const read = assessTransaction(
      {
        data: call("87517c45", USDC, SPENDER, "f".repeat(40), "0"),
        from: ME,
        kind: "send_transaction",
        to: OTHER,
        value: "0x0",
      },
      BASE
    );
    expect(read.refusals).toHaveLength(1);
  });

  it("refuses setApprovalForAll(true) and reads the revoke", () => {
    const grant = assessTransaction(
      {
        data: call("a22cb465", SPENDER, "1"),
        from: ME,
        kind: "send_transaction",
        to: OTHER,
        value: "0x0",
      },
      BASE
    );
    expect(grant.refusals).toHaveLength(1);
    const revoke = assessTransaction(
      {
        data: call("a22cb465", SPENDER, "0"),
        from: ME,
        kind: "send_transaction",
        to: OTHER,
        value: "0x0",
      },
      BASE
    );
    expect(revoke.refusals).toEqual([]);
  });

  it("refuses a transaction from an address that is not the wallet's", () => {
    const read = assessTransaction(
      {
        data: "0x",
        from: OTHER,
        kind: "send_transaction",
        to: ME,
        value: "0x1",
      },
      BASE
    );
    expect(read.refusals[0]).toContain("not yours");
  });

  it("refuses contract creation", () => {
    const read = assessTransaction(
      {
        data: "0x6080",
        from: ME,
        kind: "send_transaction",
        to: null,
        value: "0x0",
      },
      BASE
    );
    expect(read.refusals).toHaveLength(1);
  });

  it("shows an unknown call as opaque with its selector, and warns", () => {
    const read = assessTransaction(
      {
        data: "0xdeadbeef00",
        from: ME,
        kind: "send_transaction",
        to: OTHER,
        value: "0x0",
      },
      BASE
    );
    expect(read.refusals).toEqual([]);
    expect(read.lines[0]).toContain("0xdeadbeef");
    expect(read.warnings).toHaveLength(1);
  });
});

const siwe = (domain: string, uri = `https://${domain}`) =>
  [
    `${domain} wants you to sign in with your Ethereum account:`,
    ME,
    "",
    "Sign in to the app.",
    "",
    `URI: ${uri}`,
    "Version: 1",
    "Chain ID: 8453",
    "Nonce: abcdef12",
    "Issued At: 2026-09-12T10:00:00Z",
  ].join("\n");

describe("assessMessage", () => {
  const context = { ...BASE, origin: "https://app.uniswap.org" };

  it("parses a SIWE message", () => {
    const parsed = parseSiwe(siwe("app.uniswap.org"));
    expect(parsed?.domain).toBe("app.uniswap.org");
    expect(parsed?.address).toBe(ME);
    expect(parsed?.chainId).toBe(8453);
    expect(parsed?.nonce).toBe("abcdef12");
    expect(parsed?.statement).toBe("Sign in to the app.");
  });

  it("accepts a sign-in whose domain is the asking origin", () => {
    const read = assessMessage(
      {
        address: ME,
        kind: "personal_sign",
        message: utf8Hex(siwe("app.uniswap.org")),
      },
      context
    );
    expect(read.refusals).toEqual([]);
    expect(read.title).toBe("Sign in to app.uniswap.org");
  });

  it("refuses a sign-in whose domain is not the asking origin", () => {
    const read = assessMessage(
      {
        address: ME,
        kind: "personal_sign",
        message: utf8Hex(siwe("app.uniswap.org.evil.example")),
      },
      context
    );
    expect(read.refusals).toHaveLength(1);
    expect(read.refusals[0]).toContain("app.uniswap.org.evil.example");
  });

  it("shows plain text with a warning and refuses bytes that are not text", () => {
    const plain = assessMessage(
      { address: ME, kind: "personal_sign", message: utf8Hex("hello") },
      context
    );
    expect(plain.refusals).toEqual([]);
    expect(plain.lines[0]).toContain("hello");
    expect(plain.warnings).toHaveLength(1);
    const bytes = assessMessage(
      { address: ME, kind: "personal_sign", message: "0xff00fe" },
      context
    );
    expect(bytes.refusals).toHaveLength(1);
  });
});

type Json = string | number | boolean | null | readonly Json[] | JsonObject;
interface JsonObject {
  readonly [key: string]: Json;
}

describe("assessTypedData", () => {
  const typed = (
    primaryType: string,
    message: JsonObject,
    domain: JsonObject = {}
  ) =>
    JSON.stringify({
      domain: {
        chainId: 8453,
        name: "USD Coin",
        verifyingContract: USDC,
        version: "2",
        ...domain,
      },
      message,
      primaryType,
      types: {},
    });

  it("reads an exact ERC-2612 permit", () => {
    const read = assessTypedData(
      {
        address: ME,
        kind: "sign_typed_data_v4",
        typedData: typed("Permit", {
          deadline: 1,
          nonce: 0,
          owner: ME,
          spender: SPENDER,
          value: "2500000",
        }),
      },
      BASE
    );
    expect(read.refusals).toEqual([]);
    expect(read.lines[0]).toContain("2.5 USDC");
  });

  it("refuses an unlimited permit and an unlimited Permit2 single", () => {
    const permit = assessTypedData(
      {
        address: ME,
        kind: "sign_typed_data_v4",
        typedData: typed("Permit", {
          owner: ME,
          spender: SPENDER,
          value: `0x${MAX}`,
        }),
      },
      BASE
    );
    expect(permit.refusals).toHaveLength(1);
    const permit2 = assessTypedData(
      {
        address: ME,
        kind: "sign_typed_data_v4",
        typedData: typed("PermitSingle", {
          details: { amount: `0x${"f".repeat(40)}`, token: USDC },
          spender: SPENDER,
        }),
      },
      BASE
    );
    expect(permit2.refusals).toHaveLength(1);
  });

  it("refuses a document for another chain", () => {
    const read = assessTypedData(
      {
        address: ME,
        kind: "sign_typed_data_v4",
        typedData: typed(
          "Permit",
          { spender: SPENDER, value: "1" },
          { chainId: 1 }
        ),
      },
      BASE
    );
    expect(read.refusals[0]).toContain("chain 1");
  });

  it("refuses something that is not an EIP-712 document", () => {
    const read = assessTypedData(
      { address: ME, kind: "sign_typed_data_v4", typedData: "{}" },
      BASE
    );
    expect(read.refusals).toHaveLength(1);
  });

  it("shows an unknown primary type field by field with a warning", () => {
    const read = assessTypedData(
      {
        address: ME,
        kind: "sign_typed_data_v4",
        typedData: typed("Order", { maker: ME, price: "100" }),
      },
      BASE
    );
    expect(read.refusals).toEqual([]);
    expect(read.title).toBe("Sign Order");
    expect(read.lines).toContain("price: 100");
    expect(read.warnings).toHaveLength(1);
  });
});
