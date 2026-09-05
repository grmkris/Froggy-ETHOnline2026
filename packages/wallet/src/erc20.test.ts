import { describe, expect, test } from "bun:test";

import { encodeTransfer, isEvmAddress, TRANSFER_SELECTOR } from "./erc20";

describe("encodeTransfer", () => {
  test("produces the selector, the padded address and the padded amount", () => {
    const data = encodeTransfer(
      "0x000000000000000000000000000000000000dEaD",
      1_000_000n
    );

    expect(data.startsWith(TRANSFER_SELECTOR)).toBe(true);
    // 4 bytes of selector plus two 32-byte words, as hex characters.
    expect(data).toHaveLength(2 + 8 + 64 + 64);
    expect(data.slice(10, 74)).toBe(
      "000000000000000000000000000000000000000000000000000000000000dead"
    );
    expect(data.slice(74)).toBe(
      "00000000000000000000000000000000000000000000000000000000000f4240"
    );
  });

  test("refuses anything that is not an address", () => {
    expect(() => encodeTransfer("dead", 1n)).toThrow("Not an EVM address");
    expect(() => encodeTransfer("0x1234", 1n)).toThrow("Not an EVM address");
  });

  test("refuses a negative amount rather than encoding two's complement", () => {
    expect(() =>
      encodeTransfer("0x000000000000000000000000000000000000dEaD", -1n)
    ).toThrow("negative");
  });
});

describe("isEvmAddress", () => {
  test("accepts either case and refuses the wrong length", () => {
    expect(isEvmAddress("0x74bcfbc5abb7c342a128764e1f17707ee3b0031f")).toBe(
      true
    );
    expect(isEvmAddress("0x74BCFBC5ABB7C342A128764E1F17707EE3B0031F")).toBe(
      true
    );
    expect(isEvmAddress("0x74bcfbc5abb7c342a128764e1f17707ee3b0031")).toBe(
      false
    );
  });
});
