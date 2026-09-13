import { describe, expect, it } from "bun:test";

import { creditLimit, formatCredits, purchaseAmount } from "./credit-view";

describe("credit amounts", () => {
  it("preserves fractions of one credit", () => {
    expect(formatCredits(10_000)).toBe("1 credit");
    expect(formatCredits(12_345)).toBe("1.2345 credits");
    expect(creditLimit("1.2345")).toBe(12_345);
    expect(creditLimit("1.23456")).toBeNull();
  });
  it("accepts only dollar purchases from one to one hundred in exact cents", () => {
    expect(purchaseAmount("1.01")).toBe(1_010_000);
    expect(purchaseAmount("100.00")).toBe(100_000_000);
    for (const value of ["0.99", "100.01", "1.001", "1e2", "-5"]) {
      expect(purchaseAmount(value)).toBeNull();
    }
  });
});
