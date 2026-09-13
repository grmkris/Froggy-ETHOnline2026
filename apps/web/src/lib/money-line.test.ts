import { describe, expect, it } from "bun:test";

import { creditGauge, moneyLineName } from "./money-line";

describe("creditGauge", () => {
  it("is full when nothing has been spent or held", () => {
    const gauge = creditGauge({
      availableUnits: 20_000_000,
      reservedUnits: 0,
      spentUnits: 0,
    });
    expect(gauge).toEqual({
      count: "2,000",
      empty: false,
      heldPercent: 0,
      leftPercent: 100,
    });
  });

  it("drains as credits are spent, and keeps a sliver while any remain", () => {
    expect(
      creditGauge({ availableUnits: 100, reservedUnits: 0, spentUnits: 99_900 })
        .leftPercent
    ).toBe(2);
    expect(
      creditGauge({ availableUnits: 0, reservedUnits: 0, spentUnits: 99_900 })
        .leftPercent
    ).toBe(0);
  });

  it("shows held credits as their own share", () => {
    const gauge = creditGauge({
      availableUnits: 5000,
      reservedUnits: 2500,
      spentUnits: 2500,
    });
    expect(gauge.leftPercent).toBe(50);
    expect(gauge.heldPercent).toBe(25);
  });

  it("has words, not a bar, before anything was bought", () => {
    expect(
      creditGauge({ availableUnits: 0, reservedUnits: 0, spentUnits: 0 })
    ).toEqual({
      count: "No credits yet",
      empty: true,
      heldPercent: 0,
      leftPercent: 0,
    });
  });
});

describe("moneyLineName", () => {
  it("reads both figures as one place", () => {
    expect(
      moneyLineName(
        { figure: "$15.32", unavailable: false },
        { count: "2,000", empty: false, heldPercent: 0, leftPercent: 100 }
      )
    ).toBe("Your money: $15.32 balance, 2,000 credits left");
  });

  it("keeps the wallet's own words when the chain did not answer", () => {
    expect(
      moneyLineName({ figure: "Balance unavailable", unavailable: true }, null)
    ).toBe("Your money: Balance unavailable");
  });
});
