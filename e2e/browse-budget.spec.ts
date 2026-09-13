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
  await page.goto("/chat");
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
    let finished = false;
    const task = {
      id: taskId,
      requestKey: "browse:budget-offer",
      kind: "browse",
      input: { instruction: "Read the fixture page" },
      priceUsdMicros: 1_000_000,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      browse: {
        executor: "legacy",
        revision: 1,
        phase: uncertain ? "checking" : "queued",
        conversationId: null,
        startedAt: null,
        finishedAt: null,
        refreshedAt: Date.now(),
        activeMs: 0,
        activity: [],
        controls: {
          stop: false,
          takeControl: false,
          continue: false,
          forceStop: false,
          watch: !uncertain,
        },
        stubbed: true,
      },
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
      const latest = finished
        ? {
            ...task,
            status: "done",
            updatedAt: Date.now(),
            result: { text: "Legacy browsing completed." },
            browse: {
              ...task.browse,
              revision: 2,
              phase: "done",
              finishedAt: Date.now(),
            },
          }
        : task;
      await route.fulfill({ json: { v: 1, task: latest } });
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
    // The default allowance caps one payment at $2, so only $1 is on offer;
    // the others say why rather than failing after a signature.
    await expect(
      page.getByRole("button", { name: "$1", exact: true })
    ).toBeEnabled();
    await expect(
      page.getByRole("button", { name: "$3", exact: true })
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "$5", exact: true })
    ).toBeDisabled();
    await expect(
      page.getByText("Budgets over your $2.00 per-payment cap are off.")
    ).toBeVisible();
    await page.getByRole("button", { name: "$1", exact: true }).click();
    await page.getByRole("button", { name: "Get quote", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Pay $1 and browse", exact: true })
    ).toBeVisible();
    expect(signatures).toBe(0);
    expect(purchases).toBe(0);
    await page
      .getByRole("button", { name: "Pay $1 and browse", exact: true })
      .click();
    await expect(
      page.getByText(
        uncertain ? "Checking what happened" : "Waiting for a browser",
        {
          exact: true,
        }
      )
    ).toBeVisible();
    expect(signatures).toBe(1);
    expect(purchases).toBe(uncertain ? 0 : 1);
    await expect(
      page.getByRole("button", { name: "Pay $1 and browse", exact: true })
    ).toHaveCount(0);
    expect(errors).toEqual([]);
    if (!uncertain) {
      await page
        .getByRole("button", { name: "Watch live", exact: true })
        .click();
      await expect(page.locator('[data-slot="driving-ring"]')).toBeVisible();
      finished = true;
      await expect(
        page.getByText("Legacy browsing completed.", { exact: true })
      ).toBeVisible();
    }
  });
}

test("a quote can be walked away from and re-priced at another budget", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const quoted: number[] = [];
  const taskId = TaskId.generate();
  await page.route("**/api/tasks", async (route) => {
    // SAFETY: this fixture asserts the request emitted by the budget form.
    const body = route.request().postDataJSON() as {
      budgetUsd: number;
      instruction: string;
      idempotencyKey: string;
    };
    quoted.push(body.budgetUsd);
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
            amount: String(body.budgetUsd * 100),
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
  // Raise the per-payment cap first, so a second budget is on offer at all.
  await page.goto("/settings");
  await expect(page.getByText(/Your agent may pay up to/u)).toBeVisible({
    timeout: 20_000,
  });
  await page.getByRole("button", { name: "Change these" }).click();
  await page.getByLabel("Most in one payment").fill("5");
  await page.getByRole("button", { name: "Save these rules" }).click();
  await expect(
    page.getByText("Saved. Your agent is held to these from now on.")
  ).toBeVisible({ timeout: 20_000 });
  await offer(page);
  await expect(
    page.getByRole("button", { name: "$5", exact: true })
  ).toBeEnabled();
  await expect(
    page.getByText(/Budgets over your .* per-payment cap are off\./u)
  ).toHaveCount(0);
  await page.getByRole("button", { name: "$1", exact: true }).click();
  await page.getByRole("button", { name: "Get quote", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Pay $1 and browse", exact: true })
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Choose another budget", exact: true })
    .click();
  await page.getByRole("button", { name: "$5", exact: true }).click();
  await page.getByRole("button", { name: "Get quote", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Pay $5 and browse", exact: true })
  ).toBeVisible();
  // Same card, same key, two prices asked for in turn.
  expect(quoted).toEqual([1, 5]);
});
