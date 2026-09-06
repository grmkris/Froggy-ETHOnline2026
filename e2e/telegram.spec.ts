import { expect, test } from "@playwright/test";

import {
  decodeAppServerMessage,
  encodeAppServerMessage,
} from "../packages/protocol/src/app";

test("Telegram linking recovers from errors and confirms the real pairing state", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.routeWebSocket("**/ws/app", (socket) => {
    const server = socket.connectToServer();
    server.onMessage((message) => {
      const decoded = decodeAppServerMessage(message);
      if (
        decoded._tag === "Success" &&
        decoded.success.type === "session.welcome"
      ) {
        socket.send(
          encodeAppServerMessage({
            ...decoded.success,
            modes: { ...decoded.success.modes, telegram: "live" },
          })
        );
      } else {
        socket.send(message);
      }
    });
  });
  let paired = false;
  let statusFailed = false;
  let creates = 0;
  let disconnects = 0;
  await page.route("**/api/telegram", async (route) => {
    const method = route.request().method();
    if (method === "POST") {
      creates += 1;
      if (creates === 1) {
        await route.fulfill({ status: 503 });
        return;
      }
      await route.fulfill({
        json: {
          code: "ABCDEF",
          expiresAt: Date.now() + (creates === 3 ? 500 : 600_000),
          link: "https://t.me/froggy_onchainbot?start=ABCDEF",
        },
      });
      return;
    }
    if (method === "DELETE") {
      disconnects += 1;
      if (disconnects === 1) {
        await route.fulfill({ status: 503 });
        return;
      }
      paired = false;
    }
    if (!statusFailed) {
      statusFailed = true;
      await route.fulfill({ status: 503 });
      return;
    }
    await route.fulfill({
      json: { paired, since: paired ? Date.now() : null },
    });
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Connect an agent", exact: true })
    .click();
  const telegram = page.getByRole("region", { name: "Telegram connection" });
  await expect(telegram.getByRole("alert")).toContainText("Couldn’t check");
  await telegram.getByRole("button", { name: "Retry Telegram status" }).click();
  await telegram
    .getByRole("button", { name: "Connect Telegram", exact: true })
    .click();
  await expect(telegram.getByRole("alert")).toContainText("Couldn’t create");
  await telegram
    .getByRole("button", { name: "Connect Telegram", exact: true })
    .click();
  await expect(
    telegram.getByRole("link", { name: "Open Telegram" })
  ).toHaveAttribute("href", "https://t.me/froggy_onchainbot?start=ABCDEF");
  await expect(
    telegram.getByText("/start ABCDEF", { exact: true })
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Connect an agent", exact: true })
    .click();
  await expect(
    telegram.getByText("/start ABCDEF", { exact: true })
  ).toBeVisible();
  expect(creates).toBe(2);
  await expect(page.getByRole("dialog")).toHaveCSS("opacity", "1");
  await page.screenshot({ path: testInfo.outputPath("telegram-linking.png") });
  paired = true;
  await expect(
    telegram.getByText("Telegram connected.", { exact: true })
  ).toBeVisible();
  await expect(
    telegram.getByRole("link", { name: "Open Telegram" })
  ).toHaveCount(0);
  await telegram.getByRole("button", { name: "Disconnect Telegram" }).click();
  await expect(telegram.getByRole("alert")).toContainText("Couldn’t confirm");
  await expect(
    telegram.getByText("Telegram connected.", { exact: true })
  ).toBeVisible();
  await telegram.getByRole("button", { name: "Disconnect Telegram" }).click();
  await expect(
    telegram.getByText("Telegram not connected.", { exact: true })
  ).toBeVisible();
  await telegram
    .getByRole("button", { name: "Connect Telegram", exact: true })
    .click();
  await expect(
    telegram.getByText("This code expired. Get a new code to connect.")
  ).toBeVisible();
  await expect(
    telegram.getByRole("link", { name: "Open Telegram" })
  ).toHaveCount(0);
  await telegram.getByRole("button", { name: "Get a new code" }).click();
  await expect(
    telegram.getByRole("link", { name: "Open Telegram" })
  ).toBeVisible();
  expect(errors).toEqual([]);
});
