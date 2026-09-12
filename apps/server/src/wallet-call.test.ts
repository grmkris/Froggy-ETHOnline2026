import { describe, expect, it } from "bun:test";

import { EvmAddress } from "@froggy/domain";
import { Schema } from "effect";

import { classifyWalletCall } from "./wallet-call";

const address = Schema.decodeUnknownSync(EvmAddress)(
  "0x00000000000000000000000000000000000000aa"
);

describe("classifyWalletCall", () => {
  it("answers identity methods without a payload", () => {
    expect(
      classifyWalletCall({ id: "1", method: "eth_chainId", params: [], v: 1 })
    ).toEqual({ tag: "chainId" });
    expect(
      classifyWalletCall({
        id: "1",
        method: "eth_requestAccounts",
        params: [],
        v: 1,
      })
    ).toEqual({ tag: "connect" });
  });

  it("reads a sendTransaction object into a payload", () => {
    const classified = classifyWalletCall({
      id: "1",
      method: "eth_sendTransaction",
      params: [
        {
          data: "0x",
          from: address,
          to: address,
          value: "0x1",
        },
      ],
      v: 1,
    });
    expect(classified).toEqual({
      payload: {
        data: "0x",
        from: address,
        kind: "send_transaction",
        to: address,
        value: "0x1",
      },
      tag: "sign",
    });
  });

  it("accepts personal_sign with the message first or the address first", () => {
    const message = "0x6869";
    const usual = classifyWalletCall({
      id: "1",
      method: "personal_sign",
      params: [message, address],
      v: 1,
    });
    const swapped = classifyWalletCall({
      id: "1",
      method: "personal_sign",
      params: [address, "hi"],
      v: 1,
    });
    expect(usual).toEqual({
      payload: { address, kind: "personal_sign", message },
      tag: "sign",
    });
    expect(swapped).toEqual({
      payload: {
        address,
        kind: "personal_sign",
        message: "0x6869",
      },
      tag: "sign",
    });
  });
});
