import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

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
  await page.goto("/");
  await page
    .getByRole("textbox", { name: "Message" })
    .fill("Read the fixture page");
  await page.keyboard.press("Enter");
};

for (const uncertain of [false, true]) {
  test(`browsing budget requires confirmation and ${uncertain ? "locks an uncertain payment" : "shows the purchased task"}`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => {
      errors.push(error.message);
    });
    const taskId = TaskId.generate();
    let signatures = 0;
    let purchases = 0;
    const task = {
      id: taskId,
      status: uncertain ? "uncertain" : "paid",
      error: uncertain ? "Payment outcome is unknown." : null,
      result: null,
    };
    await page.route("**/api/tasks", async (route) => {
      // SAFETY: this fixture asserts the request emitted by the budget form.
      const body = route.request().postDataJSON() as {
        budgetUsd: number;
        instruction: string;
        idempotencyKey: string;
        quoteTaskId?: string;
      };
      if (body.quoteTaskId !== undefined) {
        purchases += 1;
        await route.fulfill({ status: 202, json: { v: 1, task } });
        return;
      }
      await route.fulfill({
        status: 402,
        json: {
          v: 1,
          x402Version: 2,
          resource: { url: `http://localhost/api/tasks?quote=${taskId}` },
          accepts: [
            {
              scheme: "exact",
              network: "hedera:testnet",
              amount: "100",
              asset: "0.0.0",
              payTo: "0.0.0",
            },
          ],
          quote: {
            taskId,
            ...body,
            priceUsdMicros: body.budgetUsd * 1_000_000,
            modelAllowanceUsdMicros: body.budgetUsd * 500_000,
            executionMs: 1_200_000,
            expiresAt: Date.now() + 300_000,
          },
        },
      });
    });
    await page.route("**/api/tasks/*", async (route) => {
      await route.fulfill({ json: { v: 1, task } });
    });
    await page.route("**/api/wallet/pay", async (route) => {
      signatures += 1;
      await route.fulfill(
        uncertain
          ? { status: 502, json: { error: "Payment outcome is unknown." } }
          : { json: { v: 1, header: "fixture-proof" } }
      );
    });
    await offer(page);
    await page.getByRole("button", { name: "$3", exact: true }).click();
    await page.getByRole("button", { name: "Get quote", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Pay $3 and browse", exact: true })
    ).toBeVisible();
    expect(signatures).toBe(0);
    expect(purchases).toBe(0);
    await page
      .getByRole("button", { name: "Pay $3 and browse", exact: true })
      .click();
    await expect(
      page.getByText(`Browsing task · ${uncertain ? "uncertain" : "paid"}`, {
        exact: true,
      })
    ).toBeVisible();
    expect(signatures).toBe(1);
    expect(purchases).toBe(uncertain ? 0 : 1);
    await expect(
      page.getByRole("button", { name: "Pay $3 and browse", exact: true })
    ).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
