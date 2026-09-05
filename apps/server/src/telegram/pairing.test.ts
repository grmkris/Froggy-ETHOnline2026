import { describe, expect, test } from "bun:test";

import { userId } from "@froggy/domain";

import { PairingCodes } from "./pairing";

const ALICE = userId("did:privy:alice");
const BOB = userId("did:privy:bob");

describe("PairingCodes", () => {
  test("a code redeems once, for the person who minted it", () => {
    const codes = new PairingCodes({ now: () => 1000 });
    const { code } = codes.mint(ALICE);
    expect(code).toHaveLength(6);
    expect(codes.redeem(code.toLowerCase())).toBe(ALICE);
    expect(codes.redeem(code)).toBeNull();
  });

  test("minting again voids the earlier code", () => {
    const codes = new PairingCodes({ now: () => 1000 });
    const first = codes.mint(ALICE).code;
    const second = codes.mint(ALICE).code;
    expect(codes.redeem(first)).toBeNull();
    expect(codes.redeem(second)).toBe(ALICE);
  });

  test("a code expires after ten minutes", () => {
    let clock = 1000;
    const codes = new PairingCodes({ now: () => clock });
    const { code, expiresAt } = codes.mint(BOB);
    expect(expiresAt).toBe(1000 + 10 * 60 * 1000);
    clock = expiresAt;
    expect(codes.redeem(code)).toBeNull();
  });

  test("two people never share a code", () => {
    // A random source that always answers the same makes every code
    // identical; the minter must notice and try again.
    let calls = 0;
    const codes = new PairingCodes({
      now: () => 1000,
      random: () => {
        calls += 1;
        return calls <= 6 ? 0 : 0.5;
      },
    });
    const first = codes.mint(ALICE).code;
    const second = codes.mint(BOB).code;
    expect(first).not.toBe(second);
  });
});
