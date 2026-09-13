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
  WalletMonitorView,
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
    page.getByRole("button", { name: "Add item", exact: true })
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
for (const [network, width] of [
  ["eip155:8453", 1440],
  ["eip155:4663", 390],
] as const) {
  test(`wallet conditions persist and pause on ${network} at ${width}px`, async ({
    page,
  }, testInfo) => {
    const errors = browserErrors(page);
    await page.setViewportSize({ width, height: 900 });
    const saved = await saveFixture(page, "wallet", network);
    await page.goto(`/watchlist/${saved.id}`);
    const panel = page.getByRole("region", { name: "Wallet activity monitor" });
    await panel.getByRole("button", { name: "Remove condition 2" }).click();
    await panel
      .getByLabel("Direction 1")
      .getByRole("button", { name: "Receives", exact: true })
      .click();
    await panel.getByLabel("Token filter").fill("native");
    const configured = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/watchlist/${saved.id}/alerts`) &&
        response.request().method() === "POST"
    );
    await panel.getByRole("button", { name: "Track this wallet" }).click();
    const response = await configured;
    expect(response.status()).toBe(200);
    await expect(
      panel.getByText("Receives ETH", { exact: true })
    ).toBeVisible();
    await expect(
      panel.getByText("Simulated stream · local demo", { exact: true })
    ).toBeVisible();
    await expect(
      panel.getByRole("button", { name: "Pause watch", exact: true })
    ).toBeVisible();
    await panel
      .getByRole("button", { name: "Pause watch", exact: true })
      .click();
    await expect(
      panel.getByRole("button", { name: "Resume watch", exact: true })
    ).toBeVisible();
    await page.reload();
    await expect(
      panel.getByRole("button", { name: "Resume watch", exact: true })
    ).toBeVisible();
    await panel
      .getByRole("button", { name: "Resume watch", exact: true })
      .click();
    await expect(
      panel.getByRole("button", { name: "Pause watch", exact: true })
    ).toBeVisible();
    await expect(panel.getByText("Watching", { exact: true })).toBeVisible();
    await captureScreen(page, testInfo, `onchain-wallet-${width}`);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true);
    expect(errors).toEqual([]);
  });
}
for (const network of ["eip155:8453", "eip155:4663"] as const) {
  test(`local demo price triggers and rearms without extending expiry on ${network}`, async ({
    page,
  }, testInfo) => {
    const errors = browserErrors(page);
    await page.setViewportSize({ width: 390, height: 900 });
    const saved = await saveFixture(page, "token", network);
    await page.goto(`/watchlist/${saved.id}`);
    const panel = page.getByRole("region", { name: "Token price alerts" });
    await panel
      .getByLabel("Price comparison 1")
      .getByRole("button", { name: "Above", exact: true })
      .click();
    await panel.getByLabel("Price per token").fill("0.5");
    const configured = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/watchlist/${saved.id}/alerts`) &&
        response.request().method() === "POST"
    );
    await panel
      .getByRole("button", { name: "Start price alert", exact: true })
      .click();
    const response = await configured;
    expect(response.status()).toBe(200);
    const initial = Schema.decodeUnknownSync(WalletMonitorView)(
      await response.json()
    );
    const expiresAt = initial.status.monitor?.expiresAt;
    expect(expiresAt).toBeDefined();
    await expect(
      panel.getByText("Price matched", { exact: true })
    ).toBeVisible();
    await expect(
      panel.getByRole("heading", { name: "Price alert", exact: true })
    ).toHaveCount(1);
    await expect(
      panel.getByText("Demo token price · USD per token", { exact: true })
    ).toBeVisible();
    await expect(
      panel.getByText("Demo price; no live oracle or pool was read.", {
        exact: true,
      })
    ).toBeVisible();
    await expect(
      panel.getByText("Observed 1 USD · Demo token price", { exact: true })
    ).toBeVisible();
    await expect(
      panel.getByText("Simulated stream · local demo", { exact: true })
    ).toBeVisible();
    await expect(panel.getByText("Simulated", { exact: true })).toHaveCount(1);
    const rearmed = page.waitForResponse(
      (result) =>
        result.url().endsWith(`/api/watchlist/${saved.id}/alerts`) &&
        result.request().method() === "PATCH"
    );
    await panel
      .getByRole("button", { name: "Rearm price alert", exact: true })
      .click();
    const rearmResponse = await rearmed;
    expect(rearmResponse.status()).toBe(200);
    const after = Schema.decodeUnknownSync(WalletMonitorView)(
      await rearmResponse.json()
    );
    expect(after.status.monitor?.expiresAt).toBe(expiresAt);
    await expect(
      panel.getByRole("heading", { name: "Price alert", exact: true })
    ).toHaveCount(2);
    await expect(
      panel.getByText("Price matched", { exact: true })
    ).toBeVisible();
    await captureScreen(
      page,
      testInfo,
      `onchain-local-price-${network.replace(":", "-")}`
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true);
    expect(errors).toEqual([]);
  });
}
test("price editor keeps quote units and renders a marked fixture with rearm and pagination", async ({
  page,
}, testInfo) => {
  const errors = browserErrors(page);
  await page.setViewportSize({ width: 320, height: 800 });
  const saved = await saveFixture(page, "token", "eip155:8453");
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
