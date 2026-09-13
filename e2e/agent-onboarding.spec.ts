import { expect, test } from "@playwright/test";

import {
  AgentTokenId,
  OAuthClientId,
  OAuthGrantId,
  ReceiptId,
  RunId,
  SessionId,
  SpendId,
} from "../packages/domain/src/id";
import { usdMicros } from "../packages/domain/src/money";
import type { Receipt } from "../packages/domain/src/receipt";

const layoutOf = (node: Element) => {
  if (!(node instanceof HTMLElement)) {
    throw new Error("Expected an HTML control");
  }
  return {
    width: node.offsetWidth,
    height: node.offsetHeight,
    x: node.offsetLeft,
    y: node.offsetTop,
  };
};

for (const path of ["/agents"]) {
  test(`copy agent instructions and recover clipboard denial on ${path}`, async ({
    page,
    context,
    baseURL,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => {
      errors.push(error.message);
    });
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto(path);
    await page.getByRole("button", { name: "Copy for your agent" }).click();
    await expect(
      page.getByText("Copied. Paste this into your agent’s chat.")
    ).toBeVisible();
    const prompt = `Read ${baseURL}/llm.md and follow it to connect yourself to my Froggy wallet as an MCP server; then tell me what you can do.`;
    expect(
      await page.evaluate(async () => await navigator.clipboard.readText())
    ).toBe(prompt);
    await page.evaluate(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async () => {
            await Promise.reject(new Error("denied"));
          },
        },
      });
    });
    await page.getByRole("button", { name: "Copy for your agent" }).click();
    await expect(page.getByRole("alert")).toContainText("Couldn’t copy");
    await expect(page.getByLabel("Instructions for your agent")).toHaveValue(
      prompt
    );
    expect(errors).toEqual([]);
  });
}

test("connection counts update without removing the copy action", async ({
  page,
}) => {
  const token = {
    id: AgentTokenId.generate(),
    label: "Legacy",
    createdAt: Date.now(),
    lastUsedAt: null,
    revokedAt: null,
  };
  const grant = {
    id: OAuthGrantId.generate(),
    clientId: OAuthClientId.generate(),
    clientName: "MCP",
    scopes: ["services"],
    createdAt: Date.now(),
    lastUsedAt: null,
    revokedAt: null,
  };
  let active = 0;
  await page.route("**/api/agents", async (route) => {
    await route.fulfill({
      json: {
        agents: [{ ...token, revokedAt: active >= 1 ? null : Date.now() }],
        grants: [{ ...grant, revokedAt: active >= 2 ? null : Date.now() }],
      },
    });
  });
  await page.goto("/agents");
  await expect(
    page.getByRole("button", { name: "Copy for your agent" })
  ).toBeVisible();
  active = 1;
  await page.reload();
  await expect(
    page.getByRole("link", { name: "1 agent connected" })
  ).toHaveAttribute("href", `/agents/${token.id}`);
  await expect(
    page.getByRole("button", { name: "Copy for your agent" })
  ).toBeVisible();
  active = 2;
  await page.goto("/agents");
  await expect(
    page.getByRole("link", { name: "2 agents connected" })
  ).toHaveAttribute("href", "/agents");
  await expect(
    page.getByRole("button", { name: "Copy for your agent" })
  ).toBeVisible();
});

test("Home keeps its position when earlier receipts arrive", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const at = Date.now() - 86_400_000;
  const receipt: Receipt = {
    at,
    id: ReceiptId.generate(),
    runId: RunId.generate(),
    sessionId: SessionId.generate(),
    spendId: SpendId.generate(),
    stubbed: true,
    decision: { _tag: "allow", satisfied: [] },
    intent: {
      amount: {
        asset: {
          decimals: 8,
          id: "0.0.0",
          network: "hedera:testnet",
          symbol: "HBAR",
        },
        units: "5000000",
      },
      idempotencyKey: "onboarding-earlier-receipt",
      payee: { id: "0.0.1", label: "the oracle", provenance: "server" },
      purpose: "Earlier research",
      usdMicros: usdMicros(4000),
    },
    quote: { asOf: at, source: "test", usdMicrosPerUnit: usdMicros(80_000) },
  };
  const backfill = Promise.withResolvers<null>();
  await page.route("**/api/receipts", async (route) => {
    await backfill.promise;
    await route.fulfill({ json: { receipts: [receipt] } });
  });
  try {
    await page.goto("/chat");
    const welcome = page.getByRole("region", { name: "Use Froggy here" });
    const heading = page.getByRole("heading", {
      name: "What can I help with?",
    });
    await expect(heading).toBeVisible();
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    const before = await heading.evaluate(layoutOf);
    const loaded = page.waitForResponse("**/api/receipts");
    backfill.resolve(null);
    await loaded;
    await expect(welcome).toBeVisible();
    expect(await heading.evaluate(layoutOf)).toEqual(before);
    await page.getByRole("button", { name: "Workspace menu" }).click();
    await page
      .locator('[data-slot="popover-content"]')
      .getByRole("link", { name: "Your money", exact: true })
      .last()
      .click();
    await expect(page.getByRole("region", { name: "Activity" })).toContainText(
      "$0.0040"
    );
    await page.goto("/chat");
    await expect(welcome).toBeVisible();
    await page.getByRole("button", { name: "Conversation options" }).click();
    await page
      .getByRole("button", { name: "Show the browser", exact: true })
      .last()
      .click();
    await expect(welcome).toHaveCount(0);
  } finally {
    backfill.resolve(null);
  }
});

test("copying shows progress without moving the button or discarding instructions", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          const pending = Promise.withResolvers<null>();
          document.addEventListener(
            "finish-test-copy",
            () => {
              pending.resolve(null);
            },
            { once: true }
          );
          await pending.promise;
        },
      },
    });
  });
  await page.goto("/agents");
  const copy = page.getByRole("button", { name: "Copy for your agent" });
  await expect(copy).toBeVisible();
  await copy.scrollIntoViewIfNeeded();
  const before = await copy.evaluate(layoutOf);
  await copy.click();
  await expect(copy).toBeDisabled();
  await expect(copy).toHaveAttribute("aria-busy", "true");
  await expect(page.getByLabel("Copying to clipboard")).toBeVisible();
  expect(await copy.evaluate(layoutOf)).toEqual(before);
  await page.evaluate(() => {
    document.dispatchEvent(new Event("finish-test-copy"));
  });
  await expect(copy).toBeEnabled();
  await expect(
    page.getByText("Copied. Paste this into your agent’s chat.")
  ).toBeVisible();
});

test("agent status loading and failures never remove the onboarding action", async ({
  page,
}) => {
  const response = Promise.withResolvers<null>();
  let failed = true;
  await page.route("**/api/agents", async (route) => {
    await response.promise;
    await route.fulfill(
      failed
        ? { status: 503, json: { error: "temporarily unavailable" } }
        : { json: { agents: [], grants: [] } }
    );
  });
  try {
    await page.goto("/agents");
    const copy = page.getByRole("button", { name: "Copy for your agent" });
    await expect(copy).toBeVisible();
    await expect(page.getByLabel("Loading agent connections")).toBeVisible();
    response.resolve(null);
    await expect(
      page.getByText("Connection status unavailable.")
    ).toBeVisible();
    await expect(copy).toBeVisible();
    failed = false;
    await page.getByRole("button", { name: "Retry connection status" }).click();
    await expect(page.getByText("No agent connected yet.")).toBeVisible();
    await expect(copy).toBeVisible();
  } finally {
    response.resolve(null);
  }
});
