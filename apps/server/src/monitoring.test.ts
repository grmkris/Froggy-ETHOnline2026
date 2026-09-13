import { describe, expect, test } from "bun:test";

import { TaskId, userId } from "@froggy/domain";
import type { MonitorConfig, MonitorObservation } from "@froggy/domain";
import { memoryStore } from "@froggy/wallet";

import {
  claimMonitor,
  claimMonitorContinuation,
  updateMonitorCheck,
  configureMonitor,
  finishMonitorCheck,
  monitoringMonth,
  monitoringState,
  setMonitoringBudget,
  changeMonitor,
} from "./monitoring";
import { handleMonitoring } from "./monitoring-routes";
import { saveWatchlistItem, handleWatchlist } from "./watchlist-routes";

const owner = userId("did:privy:monitor-owner");
const now = Date.UTC(2026, 8, 13, 12);
const setup = async () => {
  const store = memoryStore();
  const item = await saveWatchlistItem(store, owner, {
    title: "Green shoe",
    notes: "Size 42",
    source: { _tag: "product", url: "https://example.com/shoe" },
  });
  const config: MonitorConfig = {
    itemId: item.id,
    context: "Green, size 42, one pair",
    cadence: "daily",
    timezone: "Europe/Berlin",
    condition: { _tag: "price_below", amount: 50, currency: "EUR" },
  };
  await setMonitoringBudget(store, owner, 2_000_000, "Europe/Berlin");
  const monitor = await configureMonitor(store, owner, config, null, now);
  return { store, monitor, item, config };
};
const observation = (price: number): MonitorObservation => ({
  at: now,
  value: `EUR ${price}`,
  price,
  currency: "EUR",
  sourceUrl: "https://example.com/shoe",
  evidence: "Green shoe, size 42",
  stubbed: true,
});

describe("watchlist monitoring", () => {
  test("concurrent tickers reserve one check, and repeat settlement cannot double bill", async () => {
    const { store, monitor } = await setup();
    const claims = await Promise.all([
      claimMonitor(store, owner, now),
      claimMonitor(store, owner, now),
    ]);
    const check = claims.find((entry) => entry !== null);
    expect(claims.filter(Boolean)).toHaveLength(1);
    if (!check) {
      throw new Error("Expected a check");
    }
    await finishMonitorCheck(
      store,
      owner,
      check.id,
      observation(80),
      1_000_000,
      null
    );
    await finishMonitorCheck(
      store,
      owner,
      check.id,
      observation(80),
      1_000_000,
      null
    );
    const state = await monitoringState(store, owner);
    expect(state.months[0]?.spentUsdMicros).toBe(1_000_000);
    expect(
      state.monitors.find((entry) => entry.id === monitor.id)?.baseline?.price
    ).toBe(80);
    expect(state.checks[0]?.alert).toBeNull();
  });

  test("baseline, threshold alert, repeat suppression and shared cap", async () => {
    const { store, monitor } = await setup();
    const first = await claimMonitor(store, owner, now);
    if (!first) {
      throw new Error("Expected first check");
    }
    await finishMonitorCheck(
      store,
      owner,
      first.id,
      observation(80),
      1_000_000,
      null
    );
    await changeMonitor(store, owner, monitor.id, "check", now);
    const second = await claimMonitor(store, owner, now);
    if (!second) {
      throw new Error("Expected second check");
    }
    const finished = await finishMonitorCheck(
      store,
      owner,
      second.id,
      observation(40),
      1_000_000,
      null
    );
    expect(finished?.alert).toContain("EUR 40");
    await changeMonitor(store, owner, monitor.id, "check", now);
    expect(await claimMonitor(store, owner, now)).toBeNull();
    const exhaustedState = await monitoringState(store, owner);
    expect(exhaustedState.monitors[0]?.status).toBe("budget_exhausted");
  });

  test("failed observations never trigger a price alert; unused reservation is released", async () => {
    const { store } = await setup();
    const check = await claimMonitor(store, owner, now);
    if (!check) {
      throw new Error("Expected check");
    }
    await finishMonitorCheck(
      store,
      owner,
      check.id,
      null,
      0,
      "Variant unavailable"
    );
    const state = await monitoringState(store, owner);
    expect(state.checks[0]?.reservedUsdMicros).toBe(0);
    expect(state.monitors[0]?.baseline).toBeNull();
    expect(state.monitors[0]?.status).toBe("failed");
  });

  test("credit billing returns the charge for an observation rejected by currency validation", async () => {
    const { store } = await setup();
    const check = await claimMonitor(store, owner, now);
    if (check === null) {
      throw new Error("Expected a check");
    }
    const finished = await finishMonitorCheck(
      store,
      owner,
      check.id,
      { ...observation(40), currency: "USD" },
      1_000_000,
      null,
      false,
      true
    );
    expect(finished?.observation).toBeNull();
    expect(finished?.spentUsdMicros).toBe(0);
    const state = await monitoringState(store, owner);
    expect(state.months[0]?.spentUsdMicros).toBe(0);
  });
  test("archiving pauses checks and other owners cannot read or reconfigure them", async () => {
    const { store, item, config } = await setup();
    const other = userId("did:privy:monitor-other");
    const otherState = await monitoringState(store, other);
    expect(otherState.monitors).toHaveLength(0);
    expect(configureMonitor(store, other, config, null, now)).rejects.toThrow(
      "active item"
    );
    const path = `/api/watchlist/${item.id}`;
    await handleWatchlist(
      store,
      new Request(`https://froggy.test${path}`, {
        method: "PATCH",
        body: JSON.stringify({ v: 1, revision: item.revision, archived: true }),
      }),
      owner,
      path
    );
    expect(await claimMonitor(store, owner, now)).toBeNull();
  });

  test("help records retain the same task and reconcile costs once on continuation", async () => {
    const { store, monitor } = await setup();
    const check = await claimMonitor(store, owner, now);
    if (!check) {
      throw new Error("Expected check");
    }
    await finishMonitorCheck(
      store,
      owner,
      check.id,
      null,
      1_000_000,
      "CAPTCHA",
      true
    );
    await changeMonitor(store, owner, monitor.id, "resume", now);
    await finishMonitorCheck(
      store,
      owner,
      check.id,
      observation(80),
      1_000_000,
      null
    );
    const state = await monitoringState(store, owner);
    expect(state.months[0]?.spentUsdMicros).toBe(1_000_000);
    expect(state.checks).toHaveLength(1);
  });

  test("calendar months follow owner timezone; budget timezone cannot reset existing accounting", async () => {
    expect(monitoringMonth(Date.UTC(2026, 8, 30, 23), "Europe/Berlin")).toBe(
      "2026-10"
    );
    const { store } = await setup();
    await claimMonitor(store, owner, now);
    expect(setMonitoringBudget(store, owner, 2_000_000, "UTC")).rejects.toThrow(
      "timezone is fixed"
    );
  });

  test("budget mutations require the human and reject invalid envelopes", async () => {
    const { store } = await setup();
    const caller = {
      userId: owner,
      grantId: null,
      agentTokenId: null,
      scopes: null,
    };
    const response = await handleMonitoring(
      store,
      caller,
      new Request("https://froggy.test/api/monitoring/budget", {
        method: "PUT",
        body: JSON.stringify({ v: 2, monthlyUsdMicros: -1, timezone: "UTC" }),
      })
    );
    expect(response?.status).toBe(400);
    const budgetState = await monitoringState(store, owner);
    expect(budgetState.budget.monthlyUsdMicros).toBe(2_000_000);
  });
  test("continuation is claimed once and keeps the original paid task", async () => {
    const { store, monitor } = await setup();
    const check = await claimMonitor(store, owner, now);
    if (!check) {
      throw new Error("Expected check");
    }
    const taskId = TaskId.generate();
    await updateMonitorCheck(store, owner, check.id, { taskId });
    await finishMonitorCheck(
      store,
      owner,
      check.id,
      null,
      1_000_000,
      "Login needed",
      true
    );
    await changeMonitor(store, owner, monitor.id, "resume", now);
    const claims = await Promise.all([
      claimMonitorContinuation(store, owner, monitor.id),
      claimMonitorContinuation(store, owner, monitor.id),
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(claims.find(Boolean)?.taskId).toBe(taskId);
    const state = await monitoringState(store, owner);
    expect(state.checks).toHaveLength(1);
    expect(state.checks[0]?.reservedUsdMicros).toBe(0);
  });

  test("currency mismatch and simulation changes never generate a price alert", async () => {
    const { store, monitor } = await setup();
    const check = await claimMonitor(store, owner, now);
    if (!check) {
      throw new Error("Expected check");
    }
    await finishMonitorCheck(
      store,
      owner,
      check.id,
      { ...observation(10), currency: "USD" },
      0,
      null
    );
    const invalid = await monitoringState(store, owner);
    expect(invalid.monitors[0]?.baseline).toBeNull();
    expect(invalid.checks[0]?.alert).toContain("configured currency");
    await changeMonitor(store, owner, monitor.id, "resume", now);
    const baseline = await claimMonitor(store, owner, now);
    if (!baseline) {
      throw new Error("Expected baseline");
    }
    await finishMonitorCheck(
      store,
      owner,
      baseline.id,
      observation(80),
      0,
      null
    );
    await changeMonitor(store, owner, monitor.id, "check", now);
    const live = await claimMonitor(store, owner, now);
    if (!live) {
      throw new Error("Expected live check");
    }
    await finishMonitorCheck(
      store,
      owner,
      live.id,
      { ...observation(40), stubbed: false },
      0,
      null
    );
    const state = await monitoringState(store, owner);
    expect(state.monitors[0]?.baseline?.stubbed).toBe(false);
    expect(state.checks.at(-1)?.alert).toBeNull();
  });

  test("an item edit invalidates an in-flight result and uncertain payments cannot be retried", async () => {
    const { store, item, monitor } = await setup();
    const check = await claimMonitor(store, owner, now);
    if (!check) {
      throw new Error("Expected check");
    }
    const path = `/api/watchlist/${item.id}`;
    await handleWatchlist(
      store,
      new Request(`https://froggy.test${path}`, {
        method: "PATCH",
        body: JSON.stringify({
          v: 1,
          revision: item.revision,
          notes: "Size 43",
        }),
      }),
      owner,
      path
    );
    await finishMonitorCheck(
      store,
      owner,
      check.id,
      observation(40),
      1_000_000,
      null
    );
    const state = await monitoringState(store, owner);
    expect(state.monitors[0]?.baseline).toBeNull();
    expect(state.monitors[0]?.context).toContain("Size 43");
    expect(state.months[0]?.spentUsdMicros).toBe(1_000_000);
    await changeMonitor(store, owner, monitor.id, "resume", now);
    const next = await claimMonitor(store, owner, now);
    if (!next) {
      throw new Error("Expected next check");
    }
    await updateMonitorCheck(store, owner, next.id, { status: "uncertain" });
    expect(
      changeMonitor(store, owner, monitor.id, "resume", now)
    ).rejects.toThrow("unconfirmed payment");
  });
});
