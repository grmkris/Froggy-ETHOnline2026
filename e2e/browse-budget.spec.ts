import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { Schema } from "effect";

import { TaskId } from "../packages/domain/src/id";

const offer = async (page: Page): Promise<void> => {
  await page.route("**/api/chat", async (route) => {
    const chunks = [
      { type: "start", messageId: "budget-fixture" },
      { type: "start-step" },
      {
        type: "tool-input-available",
        toolCallId: "budget-offer",
        toolName: "browse_task",
        input: { prompt: "Read the fixture page" },
      },
      {
        type: "tool-output-available",
        toolCallId: "budget-offer",
        output: "Choose a budget in the browsing card.",
      },
      { type: "finish-step" },
      { type: "finish" },
    ];
    await route.fulfill({
      headers: {
        "content-type": "text/event-stream",
        "x-vercel-ai-ui-message-stream": "v1",
      },
      body: `${chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("")}data: [DONE]\n\n`,
    });
  });
  await page.goto("/chat");
  await page
    .getByRole("textbox", { name: "Message" })
    .fill("Read the fixture page");
  await page.keyboard.press("Enter");
};

const credits = async (page: Page, amount = 2_000_000) => {
  await page.route("**/api/credits", async (route) => {
    await route.fulfill({
      json: {
        v: 1,
        availableUnits: amount,
        reservedUnits: 0,
        spentUnits: 0,
        limits: {
          perTaskUnits: amount,
          dailyUnits: 10_000_000,
          expiresAt: null,
          frozen: false,
        },
        funding: [],
        stubbed: true,
      },
    });
  });
  await page.route("**/api/tasks?**", async (route) => {
    await route.fulfill({ json: { v: 1, tasks: [] } });
  });
};
const TaskInput = Schema.Struct({
  v: Schema.Literal(2),
  budgetUsd: Schema.Int,
  instruction: Schema.String,
  idempotencyKey: Schema.String,
});

for (const uncertain of [false, true]) {
  test(`browsing spends credits once and ${uncertain ? "holds an uncertain outcome" : "shows the saved task"}`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => {
      errors.push(error.message);
    });
    await credits(page);
    const taskId = TaskId.generate();
    let signatures = 0;
    let purchases = 0;
    const task = {
      id: taskId,
      requestKey: "browse:budget-offer",
      kind: "browse",
      input: { instruction: "Read the fixture page" },
      priceUsdMicros: 1_000_000,
      priceCreditUnits: 1_000_000,
      chargeStatus: uncertain ? "uncertain" : "reserved",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      browse: null,
      status: uncertain ? "uncertain" : "running",
      error: uncertain ? "Execution outcome is unknown." : null,
      result: null,
    };
    await page.route("**/api/tasks", async (route) => {
      const body = Schema.decodeUnknownSync(TaskInput)(
        route.request().postDataJSON()
      );
      expect(body.budgetUsd).toBe(1);
      expect(route.request().headers()["payment-signature"]).toBeUndefined();
      purchases += 1;
      await route.fulfill({ status: 202, json: { v: 1, task } });
    });
    await page.route("**/api/tasks/*", async (route) => {
      await route.fulfill({ json: { v: 1, task } });
    });
    await page.route("**/api/wallet/pay", async (route) => {
      signatures += 1;
      await route.fulfill({
        status: 403,
        json: { error: "Wallet signing is not part of credit usage." },
      });
    });
    await offer(page);
    await expect(
      page.getByRole("button", { name: "100 credits", exact: true })
    ).toBeEnabled();
    await expect(
      page.getByRole("button", { name: "300 credits", exact: true })
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "500 credits", exact: true })
    ).toBeDisabled();
    expect(purchases).toBe(0);
    await page
      .getByRole("button", { name: "Browse · 100 credits", exact: true })
      .click();
    await expect(
      page.getByText(
        uncertain ? "100 credits held · outcome pending" : "100 credits held",
        { exact: true }
      )
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Browse · 100 credits", exact: true })
    ).toHaveCount(0);
    expect(purchases).toBe(1);
    expect(signatures).toBe(0);
    expect(errors).toEqual([]);
  });
}

test("changing a browsing budget does not spend until the task starts", async ({
  page,
}) => {
  await credits(page, 5_000_000);
  const submitted: number[] = [];
  await page.route("**/api/tasks", async (route) => {
    const body = Schema.decodeUnknownSync(TaskInput)(
      route.request().postDataJSON()
    );
    submitted.push(body.budgetUsd);
    await route.fulfill({
      status: 403,
      json: { error: "Fixture stops before any work." },
    });
  });
  await offer(page);
  await page.getByRole("button", { name: "100 credits", exact: true }).click();
  await page.getByRole("button", { name: "500 credits", exact: true }).click();
  expect(submitted).toEqual([]);
  await page
    .getByRole("button", { name: "Browse · 500 credits", exact: true })
    .click();
  await expect(page.getByText("Fixture stops before any work.")).toBeVisible();
  expect(submitted).toEqual([5]);
});

test("an empty credit balance keeps paid browsing disabled", async ({
  page,
}) => {
  await credits(page, 0);
  await offer(page);
  await expect(
    page.getByRole("button", { name: "Browse · 100 credits", exact: true })
  ).toBeDisabled();
  await expect(
    page.getByRole("link", { name: "Buy credits or adjust limits." })
  ).toBeVisible();
});
