import { expect, test } from "bun:test";

import { creditUnits, usdMicros } from "@froggy/domain";
import { PromptServiceName } from "@froggy/protocol";
import type { ServiceCard, ServiceModes } from "@froggy/protocol";

import { CAPABILITIES } from "./capabilities";
import { buildToolCatalog, TOOL_GROUPS, usageName } from "./tool-catalog";

const MODES: ServiceModes = {
  browser: "stub",
  database: "stub",
  graph: "live",
  hedera: "stub",
  model: "stub",
  privy: "stub",
  telegram: "stub",
};
const card = (
  name: ServiceCard["name"],
  status: ServiceCard["status"]
): ServiceCard => ({
  name,
  title: `Card ${name}`,
  description: `Runs ${name}.`,
  provider: "Fixture",
  priceUsdMicros: usdMicros(10_000),
  priceCreditUnits: creditUnits(10_000),
  maxInput: 1000,
  status,
  note: "",
});

test("every capability except the internal report is listed exactly once, and every listed name is real", () => {
  const placed = TOOL_GROUPS.flatMap((group) => group.names);
  const capabilities = CAPABILITIES.flatMap((entry) => entry.names).filter(
    (name) => name !== "task_report"
  );
  for (const name of capabilities) {
    expect(placed.filter((entry) => entry === name)).toHaveLength(1);
  }
  const known = new Set([
    ...capabilities,
    ...PromptServiceName.literals,
    "brief",
  ]);
  for (const name of placed) {
    expect(known.has(name)).toBe(true);
  }
  expect(new Set(placed).size).toBe(placed.length);
});

test("prices come from the cards, usage from tasks for priced tools and from executions otherwise", () => {
  const catalog = buildToolCatalog({
    cards: [card("web_search", "demo"), card("market_search", "unavailable")],
    modes: MODES,
    emailConfigured: false,
    taskUsage: [
      {
        kind: "service",
        service: "web_search",
        calls: 3,
        capturedUnits: 20_000,
        lastAt: 1_700_000_000_000,
      },
      {
        kind: "brief",
        service: null,
        calls: 1,
        capturedUnits: 50_000,
        lastAt: 5,
      },
    ],
    toolUsage: [
      { name: "froggy_email_read", calls: 2, lastAt: 9 },
      { name: "froggy_credits", calls: 4, lastAt: 11 },
      { name: "services.run", calls: 7, lastAt: 12 },
      { name: "service_status", calls: 5, lastAt: 13 },
    ],
  });
  const tools = catalog.groups.flatMap((group) => group.tools);
  const find = (name: string) => {
    const found = tools.find((tool) => tool.name === name);
    if (found === undefined) {
      throw new Error(`${name} missing`);
    }
    return found;
  };
  expect(find("web_search")).toMatchObject({
    price: { kind: "credits", units: 10_000 },
    availability: "simulated",
    service: "web_search",
    usage: { calls: 3, creditUnits: 20_000, lastAt: 1_700_000_000_000 },
    scope: "services",
  });
  expect(find("web_search").surfaces).toContain("mcp");
  expect(find("market_search").availability).toBe("unavailable");
  expect(find("brief")).toMatchObject({
    price: { kind: "credits", units: 50_000 },
    usage: { calls: 1, creditUnits: 50_000 },
  });
  expect(find("browse_task").price).toEqual({
    kind: "budget",
    options: [1_000_000, 3_000_000, 5_000_000].map((usd) => creditUnits(usd)),
  });
  expect(find("browse_task").availability).toBe("simulated");
  expect(find("email_read")).toMatchObject({
    price: { kind: "included" },
    availability: "unavailable",
    usage: { calls: 2, creditUnits: 0, lastAt: 9 },
  });
  expect(find("credits_balance").usage.calls).toBe(4);
  expect(find("credits_balance").surfaces).not.toContain("mcp");
  expect(find("service_status").usage.calls).toBe(5);
  expect(find("x402_fetch").price).toEqual({ kind: "wallet" });
  expect(find("wallet_send").surfaces).toEqual(["chat"]);
  expect(find("image").availability).toBe("unavailable");
});

test("recorded names fold to the chat's names and endpoint names fold to nothing", () => {
  expect(usageName("froggy_market_search")).toBe("market_search");
  expect(usageName("froggy_x402_status")).toBe("x402_fetch");
  expect(usageName("tasks.get")).toBeNull();
  expect(usageName("Protocol validation")).toBeNull();
});
