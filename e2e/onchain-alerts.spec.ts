import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { Schema } from "effect";

import {
  EvmAddress,
  OnchainAlertRuleId,
  WalletActivityId,
  WalletMonitorId,
  WatchlistItem,
} from "../packages/domain/src/index";
import type {
  WalletActivity,
  WalletMonitorStatus,
} from "../packages/domain/src/index";
import {
  OnchainMonitorConfigure,
  WalletMonitorUpdate,
} from "../packages/protocol/src/wallet-monitor";
import { captureScreen } from "./capture";

const address = Schema.decodeUnknownSync(EvmAddress)(`0x${"1".repeat(40)}`);
const blockHash = `0x${"a".repeat(64)}`;
const browserErrors = (page: Page): string[] => {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  return errors;
};

const saveFixture = async (
  page: Page,
  kind: "wallet" | "token",
  network: "eip155:8453" | "eip155:4663"
) => {
  await page.goto("/watchlist");
  await expect(
    page.getByRole("button", { name: "More actions", exact: true })
  ).toBeVisible();
  const body = await page.evaluate(
    async (input) => {
      const token = localStorage.getItem("froggy.local-identity");
      const response = await fetch("/api/watchlist", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(input),
      });
      if (!response.ok) {
        throw new Error("Could not save the browser fixture.");
      }
      const result: unknown = await response.json();
      return result;
    },
    {
      v: 1,
      title: kind === "wallet" ? "My demo wallet" : "Demo token",
      notes: "Browser fixture",
      source: { _tag: kind, network, address },
    }
  );
  return Schema.decodeUnknownSync(WatchlistItem)(body);
};
const simulatedPresence = async (page: Page, item: WatchlistItem) => {
  await page.route(`**/api/watchlist/${item.id}/details`, async (route) => {
    await route.fulfill({
      json: {
        v: 1,
        item,
        snapshot: null,
        data: {
          v: 1,
          itemId: item.id,
          latest: null,
          observations: [],
          snapshotTaskId: null,
          enrichment: null,
          discovery: {
            key: "explicit-ui-fixture",
            requestedAt: 1,
            startedAt: 1,
            status: "done",
            note: "Simulated presence for browser verification",
          },
          presence: [
            {
              network: "eip155:8453",
              status: "observed",
              kind: item.source._tag === "token" ? "contract" : "eoa",
              block: "0x64",
              nativeBalance: "0",
              usdc: null,
              token:
                item.source._tag === "token"
                  ? {
                      name: "Demo token",
                      symbol: "DEMO",
                      decimals: 18,
                      totalSupply: "0",
                    }
                  : null,
              observedAt: 1,
              stubbed: true,
              note: "Explicit simulated UI fixture",
            },
          ],
        },
      },
    });
  });
};

for (const kind of ["wallet", "token"] as const) {
  test(`Notify me ${kind} flow uses a marked browser fixture and pauses`, async ({
    page,
  }) => {
    const item = await saveFixture(page, kind, "eip155:8453");
    await simulatedPresence(page, item);
    const now = Date.now();
    let status: WalletMonitorStatus = {
      v: 1,
      itemId: item.id,
      monitor: null,
      state: "saved",
      latestBlock: 100,
      latestBlockAt: now,
      telegramPaired: false,
      gapSince: null,
      coverage: "Explicit simulated browser fixture",
      stubbed: true,
    };
    let starts = 0;
    await page.route(`**/api/watchlist/${item.id}/alerts*`, async (route) => {
      const request = route.request();
      if (request.method() === "POST") {
        starts += 1;
        const input = Schema.decodeUnknownSync(OnchainMonitorConfigure)(
          request.postDataJSON()
        );
        expect(input.telegram).toBe(false);
        expect(input.conditions).toEqual(
          kind === "wallet"
            ? [
                { _tag: "transfer", direction: "both", token: null },
                { _tag: "swap", side: "both", token: null },
              ]
            : [
                {
                  _tag: "price",
                  comparison: "below",
                  threshold: "0.5",
                  quoteCurrency: "USD",
                },
              ]
        );
        status = {
          ...status,
          state: "watching",
          monitor: {
            v: 1,
            id: WalletMonitorId.generate(),
            revision: 1,
            enabled: true,
            startedAt: now,
            expiresAt: now + 86_400_000,
            startBlock: 100,
            telegram: false,
            swaps: kind === "wallet",
            transfers: kind === "wallet",
            rules: input.conditions.map((condition) => ({
              id: OnchainAlertRuleId.generate(),
              condition,
              source: null,
              latest: null,
              triggeredBlock: null,
            })),
          },
        };
      }
      if (request.method() === "PATCH") {
        expect(request.postDataJSON()).toMatchObject({ action: "pause" });
        status = {
          ...status,
          state: "paused",
          monitor:
            status.monitor === null
              ? null
              : { ...status.monitor, enabled: false },
        };
      }
      await route.fulfill({ json: { v: 1, status, activities: [] } });
    });
    await page.goto(`/watchlist/${item.id}`);
    await expect(
      page.getByRole("article").getByText("Simulated", { exact: true })
    ).toBeVisible();
    const toggle = page.getByRole("switch", { name: "Notify me" });
    await expect(toggle).toHaveAttribute("aria-disabled", "false");
    await toggle.click();
    if (kind === "token") {
      expect(starts).toBe(0);
      await page.getByLabel("Price in USD").fill("0.5");
      await page.getByRole("button", { name: "Start", exact: true }).click();
    }
    await expect(toggle).toBeChecked();
    await expect(page.getByText(/Watching until/u)).toBeVisible();
    expect(starts).toBe(1);
    await toggle.click();
    await expect(toggle).not.toBeChecked();
  });
}

test("an unchecked address cannot start a watch on an invented chain", async ({
  page,
}) => {
  await page.goto("/watchlist");
  const input = page.getByRole("textbox", {
    name: "Address, link or token name",
  });
  await input.fill(address);
  await input.press("Enter");
  const toggle = page.getByRole("switch", { name: "Notify me" });
  await expect(toggle).toHaveAttribute("aria-disabled", "true");
  await expect(page.getByRole("region", { name: "Saved items" })).toContainText(
    "Not seen on any chain we checked"
  );
  await expect(toggle).toBeDisabled();
  await expect(page.getByRole("region", { name: "Saved items" })).toContainText(
    "No supported chain was found. Alerts work on Base and Robinhood."
  );
  const monitorRequests: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/alerts")) {
      monitorRequests.push(request.url());
    }
  });
  await toggle.focus();
  await toggle.press("Space");
  await expect(toggle).not.toBeChecked();
  expect(monitorRequests).toEqual([]);
});

test("price editor keeps quote units and renders a marked fixture with rearm and pagination", async ({
  page,
}, testInfo) => {
  const errors = browserErrors(page);
  await page.setViewportSize({ width: 320, height: 800 });
  const saved = await saveFixture(page, "token", "eip155:8453");
  await simulatedPresence(page, saved);
  const now = Date.now();
  const monitorId = WalletMonitorId.generate();
  const ruleId = OnchainAlertRuleId.generate();
  const olderId = WalletActivityId.generate();
  const activityId = WalletActivityId.generate();
  let status: WalletMonitorStatus = {
    v: 1,
    itemId: saved.id,
    monitor: null,
    state: "saved",
    latestBlock: 100,
    latestBlockAt: now,
    telegramPaired: true,
    gapSince: null,
    coverage: "Explicitly simulated browser fixture",
    stubbed: true,
  };
  let record: WalletActivity | null = null;
  await page.route(`**/api/watchlist/${saved.id}/alerts*`, async (route) => {
    const request = route.request();
    if (request.method() === "POST") {
      const input = Schema.decodeUnknownSync(OnchainMonitorConfigure)(
        request.postDataJSON()
      );
      expect(input.conditions).toEqual([
        {
          _tag: "price",
          comparison: "below",
          threshold: "0.01",
          quoteCurrency: "USDC",
        },
      ]);
      const observation = {
        v: 1 as const,
        sourceKey: "fixture",
        network: "eip155:8453" as const,
        blockNumber: 100,
        blockHash,
        blockTime: now,
        status: "available" as const,
        price: "0.009",
        numerator: "9",
        denominator: "1000",
        reason: null,
        stubbed: true,
      };
      status = {
        ...status,
        state: "triggered",
        monitor: {
          v: 1,
          id: monitorId,
          revision: 1,
          enabled: true,
          startedAt: now,
          expiresAt: now + 86_400_000,
          startBlock: 100,
          telegram: true,
          swaps: false,
          transfers: false,
          rules: [
            {
              id: ruleId,
              condition: {
                _tag: "price",
                comparison: "below",
                threshold: "0.01",
                quoteCurrency: "USDC",
              },
              source: null,
              latest: observation,
              triggeredBlock: 100,
            },
          ],
        },
      };
      record = {
        v: 1,
        id: activityId,
        itemId: saved.id,
        monitorId,
        monitorRevision: 1,
        network: "eip155:8453",
        wallet: address,
        transactionHash: null,
        blockHash,
        blockNumber: 100,
        blockTime: now,
        observedAt: now,
        kind: "price",
        price: {
          ruleId,
          observation,
          threshold: "0.01",
          comparison: "below",
          initiallyMatched: true,
          quoteCurrency: "USDC",
          sourceLabel: "Simulated price fixture",
        },
        flows: [],
        venues: [],
        finality: "provisional",
        delivery: "not_paired",
        telegramMessageId: null,
        complete: true,
        stubbed: true,
      };
    }
    if (request.method() === "PATCH") {
      const action = Schema.decodeUnknownSync(WalletMonitorUpdate)(
        request.postDataJSON()
      );
      expect(action.action).toBe("rearm");
      const { monitor } = status;
      if (!monitor) {
        throw new Error("Price fixture must be configured before rearm.");
      }
      status = {
        ...status,
        state: "waiting_price",
        monitor: {
          ...monitor,
          revision: monitor.revision + 1,
          rules: monitor.rules?.map((rule) => ({
            ...rule,
            latest: null,
            triggeredBlock: null,
          })),
        },
      };
    }
    const older = new URL(request.url()).searchParams.has("before");
    await route.fulfill({
      json: {
        v: 1,
        status,
        activities: record
          ? [{ ...record, id: older ? olderId : record.id }]
          : [],
        nextCursor: record && !older ? activityId : null,
      },
    });
  });
  await page.goto(`/watchlist/${saved.id}`);

  const panel = page.getByRole("region", { name: "Token price alerts" });
  await panel.getByLabel("Price per token").fill("0.01");
  await panel
    .getByLabel("Quote currency 1")
    .getByRole("button", { name: "USDC", exact: true })
    .click();
  await panel
    .getByRole("button", { name: "Start price alert", exact: true })
    .click();
  await expect(
    panel.getByText("Price below 0.01 USDC · matched", { exact: true })
  ).toBeVisible();
  await expect(panel.getByText(/Price already below 0.01 USDC/u)).toBeVisible();
  await expect(
    panel.getByRole("button", { name: "Rearm price alert" })
  ).toBeVisible();
  await expect(panel.getByText("Simulated stream · local demo")).toBeVisible();
  await panel.getByRole("button", { name: "Load older activity" }).click();
  await expect(
    panel.getByRole("heading", { name: "Price alert", exact: true })
  ).toHaveCount(2);
  await captureScreen(page, testInfo, "onchain-price-320");
  await panel.getByRole("button", { name: "Rearm price alert" }).click();
  await expect(
    panel.getByText("Waiting for a price", { exact: true })
  ).toBeVisible();
  expect(errors).toEqual([]);

  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true);
});
