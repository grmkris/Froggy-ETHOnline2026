import { expect, test } from "@playwright/test";
import { Schema } from "effect";

import { HistoryPage } from "../packages/domain/src/history";
import { lowerApprovalThreshold } from "./mandate";

for (const width of [1440, 390]) {
  test(`saved conversations reopen and activity exposes evidence at ${width}px`, async ({
    page,
    request,
  }, testInfo) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on("pageerror", (error) => {
      errors.push(error.message);
    });
    page.on("console", (message) => {
      if (message.type() === "error") {
        errors.push(message.text());
      }
    });
    await page.goto("/");
    await page
      .getByRole("textbox", { name: "Message" })
      .fill("Remember this history fixture about USDC.");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page).toHaveURL(/\/chat\/cnvrs_/u);
    await expect(page.getByRole("log")).toHaveAttribute("aria-busy", "false", {
      timeout: 30_000,
    });
    await expect(
      page
        .getByRole("log")
        .locator('[data-streamdown="strong"]', { hasText: "scripted model" })
    ).toBeVisible();
    const url = page.url();
    await page.reload();
    await expect(
      page
        .getByRole("log")
        .locator('[data-streamdown="strong"]', { hasText: "scripted model" })
    ).toBeVisible();
    await expect(
      page
        .getByRole("log")
        .getByText("Remember this history fixture about USDC.", { exact: true })
    ).toHaveCount(1);
    await page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("link", { name: "Wallet", exact: true })
      .click();
    await page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("link", { name: "Chat", exact: true })
      .click();
    await expect(page).toHaveURL(url);
    await page.getByRole("button", { name: "New chat", exact: true }).click();
    await expect(page).toHaveURL(/\/$/u);
    await expect(page.getByRole("log")).toHaveCount(0);
    await page.getByRole("button", { name: "Recent", exact: true }).click();
    await page
      .getByRole("dialog", { name: "Recent conversations" })
      .getByRole("link", { name: /Remember this history fixture/u })
      .click();
    await expect(page).toHaveURL(url);
    await expect(page.getByRole("log")).toBeVisible();
    const token = await page.evaluate(() =>
      localStorage.getItem("froggy.local-identity")
    );
    const response = await request.get("/api/activity", {
      headers: { authorization: `Bearer ${token}` },
    });
    const activity = Schema.decodeUnknownSync(HistoryPage)(
      await response.json()
    );
    const run = activity.records.find((record) => record.kind === "run");
    expect(run).toBeDefined();
    if (run === undefined) {
      throw new Error("Expected a durable run");
    }
    await page.goto(`/activity?record=${run.id}`);
    await expect(
      page.getByRole("heading", { name: "Payment evidence" })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Explain this run" })
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("activity-evidence.png"),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Back to activity" }).click();
    await expect(page).toHaveURL(/\/activity$/u);
    expect(errors).toEqual([]);
  });
}

test("loading older messages preserves the reader's position", async ({
  page,
}) => {
  const { ConversationId, MessageId } =
    await import("../packages/domain/src/id");
  const id = ConversationId.generate();
  const messages = Array.from({ length: 70 }, (_, index) => ({
    v: 1,
    kind: "message",
    id: MessageId.generate(),
    revision: 1,
    source: "web",
    conversationId: id,
    runId: null,
    clientId: `fixture-${index}`,
    role: "assistant",
    parts: [
      {
        type: "text",
        text: `Saved message ${index}. ${"A paragraph of archived evidence. ".repeat(10)}`,
      },
    ],
    status: "completed",
    delivery: "delivered",
    recovered: false,
    truncated: false,
    createdAt: index + 1,
    updatedAt: index + 1,
  }));
  await page.route(`**/api/conversations/${id}/messages?**`, async (route) => {
    const older = new URL(route.request().url()).searchParams.has("before");
    await route.fulfill({
      json: {
        v: 1,
        records: (older
          ? messages.slice(0, 20)
          : messages.slice(20)
        ).toReversed(),
        receipts: [],
        sequence: 0,
        cursor: older ? null : `21:${messages[20]?.id}`,
      },
    });
  });
  await page.route(`**/api/history/${id}`, async (route) => {
    await route.fulfill({
      json: {
        v: 1,
        record: {
          v: 1,
          kind: "conversation",
          id,
          revision: 1,
          source: "web",
          externalKey: null,
          title: "Long saved conversation",
          preview: "Older evidence",
          archived: false,
          createdAt: 1,
          updatedAt: 70,
        },
        related: [],
        receipts: [],
        business: [],
      },
    });
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`/chat/${id}`);
  const anchor = page.getByRole("log").getByText(/^Saved message 35\./u);
  const viewport = page.locator('[data-slot="message-scroller-viewport"]');
  await viewport.hover();
  await page.mouse.wheel(0, -1500);
  await anchor.scrollIntoViewIfNeeded();
  const before = await anchor.boundingBox();
  await page
    .getByRole("button", { name: "Load older messages", exact: true })
    .click();
  await expect(
    page.getByRole("log").getByText(/^Saved message 0\./u)
  ).toHaveCount(1);
  const after = await anchor.boundingBox();
  expect(before).not.toBeNull();
  expect(after).not.toBeNull();
  expect(Math.abs((after?.y ?? 0) - (before?.y ?? 0))).toBeLessThan(3);
  await expect(
    page.getByRole("button", { name: "Jump to latest" })
  ).toBeVisible();
});

test("another tab restores the same waiting run and its one receipt", async ({
  page,
  context,
}) => {
  const leash = await lowerApprovalThreshold(page, 0.001);
  await page.goto("/");
  await leash.applied;
  await page.getByText("Buy the lending snapshot").click();
  await expect(page.getByLabel(/^Approve .* to /u)).toBeVisible({
    timeout: 20_000,
  });
  const second = await context.newPage();
  await second.goto(page.url());
  const question = second.getByLabel(/^Approve .* to /u);
  await expect(question).toBeVisible();
  await question
    .getByRole("button", { name: "Allow once", exact: true })
    .click();
  await expect(page.getByLabel(/^Approve .* to /u)).toHaveCount(0);
  await expect(second.getByLabel(/^Receipt: Paid/u)).toHaveCount(1, {
    timeout: 20_000,
  });
  await expect(page.getByLabel(/^Receipt: Paid/u)).toHaveCount(1, {
    timeout: 20_000,
  });
  await second.reload();
  await expect(second.getByLabel(/^Receipt: Paid/u)).toHaveCount(1);
});

test("a failed recent-history request stays an error instead of an empty list", async ({
  page,
}) => {
  await page.route("**/api/conversations?**", async (route) => {
    await route.fulfill({
      status: 503,
      json: { v: 1, error: "History unavailable" },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Recent", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "History could not be loaded"
  );
  await expect(
    page.getByText("Your conversations will appear here.")
  ).toHaveCount(0);
});
