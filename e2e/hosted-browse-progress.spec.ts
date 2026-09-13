import { expect, test } from "@playwright/test";

import { TaskId, RunId } from "../packages/domain/src/id";
import type { ApprovalRequest } from "../packages/protocol/src/app";
import type { BrowseTaskView } from "../packages/protocol/src/browse";

interface ProgressDriver {
  approval?: (open: boolean) => void;
  publish?: (task: BrowseTaskView) => void;
  reads: number;
}

for (const width of [390, 1440]) {
  test(`hosted task remains visible through stop acknowledgement at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on("pageerror", (error) => {
      errors.push(error.message);
    });
    const task: BrowseTaskView = {
      id: TaskId.generate(),
      kind: "browse",
      status: "running",
      input: { instruction: "Find the green shoes" },
      priceUsdMicros: 1_000_000,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      error: null,
      result: null,
      browse: {
        executor: "hosted",
        revision: 1,
        phase: "working",
        conversationId: null,
        startedAt: Date.now(),
        finishedAt: null,
        refreshedAt: Date.now(),
        activeMs: 2100,
        activity: [
          {
            id: "step1",
            at: Date.now(),
            label: "Checking sizes",
            status: "working",
          },
        ],
        controls: {
          stop: true,
          takeControl: true,
          continue: false,
          forceStop: false,
          watch: true,
        },
        stubbed: true,
      },
    };
    let stopped = false;
    await page.route("**/api/browse-tasks", async (route) => {
      await route.fulfill({ json: { v: 1, tasks: [task] } });
    });
    await page.route("**/api/tasks?*", async (route) => {
      await route.fulfill({ json: { v: 1, tasks: [task] } });
    });
    await page.route(`**/api/tasks/${task.id}/control`, async (route) => {
      expect(route.request().postDataJSON()).toEqual({ v: 1, action: "stop" });
      stopped = true;
      await route.fulfill({
        json: {
          v: 1,
          task: {
            ...task,
            browse: {
              ...task.browse,
              revision: 2,
              phase: "stopping",
              controls: {
                stop: false,
                takeControl: false,
                continue: false,
                forceStop: false,
                watch: true,
              },
            },
          },
        },
      });
    });
    await page.route("**/api/chat", async (route) => {
      const chunks = [
        { type: "start", messageId: "hosted-progress" },
        { type: "start-step" },
        {
          type: "tool-input-available",
          toolCallId: "hosted-offer",
          toolName: "browse_task",
          input: { prompt: "Find the green shoes" },
        },
        {
          type: "tool-output-available",
          toolCallId: "hosted-offer",
          output: "Choose a browsing budget.",
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
      .fill("Find green shoes");
    await page.keyboard.press("Enter");
    const card = page.getByRole("region", {
      name: "Browsing task",
      exact: true,
    });
    await expect(card.getByText("Checking sizes")).toBeVisible();
    await expect(page.getByText("done", { exact: true })).toHaveCount(0);
    await expect(
      page.getByRole("complementary", { name: "Active browsing task" })
    ).toBeHidden();
    await expect(card.getByText("$1.00 approved")).toBeVisible();
    await expect(page.locator("iframe")).toHaveCount(0);
    await page.screenshot({
      path: testInfo.outputPath(`hosted-task-${width}.png`),
      animations: "disabled",
    });
    await card
      .getByRole("button", { name: "Stop browsing", exact: true })
      .click();
    expect(stopped).toBe(true);
    await expect(
      card.getByText("Stopping the browser agent", { exact: true })
    ).toBeVisible();
    await expect(
      card.getByText("Browsing stopped", { exact: true })
    ).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "Message" })).toBeEnabled();
    expect(errors).toEqual([]);
  });
}

test("320px task history preserves reading position and recovery controls stay usable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const id = TaskId.generate();
  let current: BrowseTaskView = {
    id,
    kind: "browse",
    status: "running",
    input: { instruction: "Find the green shoes" },
    priceUsdMicros: 1_000_000,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    error: null,
    result: null,
    browse: {
      executor: "hosted",
      revision: 1,
      phase: "working",
      conversationId: null,
      startedAt: Date.now(),
      finishedAt: null,
      refreshedAt: Date.now(),
      activeMs: 2100,
      activity: Array.from({ length: 12 }, (_, index) => ({
        id: `step${index}`,
        at: Date.now(),
        label: `Checking shop ${index + 1} for green shoes in the requested size`,
        status: index === 3 ? "error" : "done",
      })),
      controls: {
        stop: true,
        takeControl: true,
        continue: false,
        forceStop: false,
        watch: true,
      },
      stubbed: true,
    },
  };
  const driver: ProgressDriver = {
    reads: 0,
  };
  await page.routeWebSocket("**/ws/app", (socket) => {
    socket.connectToServer();
    driver.approval = (open) => {
      const request: ApprovalRequest = {
        id: "mobile-browser-approval",
        runId: RunId.generate(),
        title: "Review browsing request",
        detail: "A website wants permission.",
        amountLabel: "$0.10",
        expiresAt: Date.now() + 60_000,
        options: [{ id: "deny", kind: "deny", label: "Decline" }],
        payeeLabel: "Example website",
        purpose: "Browser approval fixture",
      };
      socket.send(
        JSON.stringify(
          open
            ? { v: 1, type: "approval.request", request }
            : { v: 1, type: "approval.resolved", requestId: request.id }
        )
      );
    };
    driver.publish = (task) => {
      current = task;
      socket.send(JSON.stringify({ v: 1, type: "browse.task.updated", task }));
    };
  });
  await page.route("**/api/browse-tasks", async (route) => {
    driver.reads += 1;
    current = {
      ...current,
      browse:
        current.browse === null
          ? null
          : { ...current.browse, refreshedAt: Date.now() },
    };
    await route.fulfill(
      driver.reads === 1
        ? { status: 503, json: { error: "Temporarily unavailable" } }
        : { json: { v: 1, tasks: [current] } }
    );
  });
  await page.route(`**/api/tasks/${id}/control`, async (route) => {
    const body: unknown = route.request().postDataJSON();
    const action = JSON.stringify(body);
    const phase = action.includes("take_control") ? "handing_over" : "starting";
    current = {
      ...current,
      updatedAt: Date.now(),
      browse:
        current.browse === null
          ? null
          : {
              ...current.browse,
              revision: current.browse.revision + 1,
              phase,
              controls: {
                stop: true,
                takeControl: false,
                continue: false,
                forceStop: false,
                watch: true,
              },
            },
    };
    await route.fulfill({ json: { v: 1, task: current } });
  });
  await page.goto("/watchlist");
  await expect(
    page.getByText(/Browsing task updates could not be restored/u)
  ).toBeVisible();
  await expect.poll(() => driver.reads, { timeout: 9000 }).toBe(2);
  await page
    .getByRole("button", { name: /Froggy is browsing · View task/u })
    .click();
  const sheet = page.getByRole("dialog", {
    name: "Browsing task",
    exact: true,
  });
  const card = sheet.getByRole("region", {
    name: "Browsing task",
    exact: true,
  });
  await expect(card).toBeVisible();
  await expect(card.locator(".browse-task-working")).toHaveCSS(
    "animation-name",
    "none"
  );
  await card
    .getByRole("button", { name: "All 12 updates", exact: true })
    .click();
  await expect(card.getByText(/Issue: Checking shop 4/u)).toBeVisible();
  const activity = card.locator("ul").locator("..");
  await activity.evaluate((node) => {
    node.scrollTop = 0;
    node.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
  const progress = current.browse;
  if (progress === null) {
    throw new Error("Fixture progress missing");
  }
  driver.publish?.({
    ...current,
    updatedAt: Date.now(),
    browse: {
      ...progress,
      revision: progress.revision + 1,
      activity: [
        ...progress.activity,
        {
          id: "new-step",
          at: Date.now(),
          label: "Found a fresh size listing",
          status: "done",
        },
      ],
    },
  });
  await expect(
    card.getByRole("button", { name: "New activity", exact: true })
  ).toBeVisible();
  expect(await activity.evaluate((node) => node.scrollTop)).toBe(0);
  await card.getByRole("button", { name: "New activity", exact: true }).click();
  await expect(
    card.getByText("Found a fresh size listing", { exact: true })
  ).toBeVisible();
  await card
    .getByRole("button", { name: "Recent activity", exact: true })
    .click();
  await card
    .getByRole("button", { name: "All 13 updates", exact: true })
    .click();
  expect(
    await card
      .getByText("Found a fresh size listing", { exact: true })
      .evaluate((node) => node.parentElement?.getAnimations().length)
  ).toBe(0);
  await card.getByRole("button", { name: "Take control", exact: true }).click();
  await expect(
    card.getByText("Getting the page ready for you", { exact: true })
  ).toBeVisible();
  await expect(
    card.getByRole("button", { name: "Continue", exact: true })
  ).toHaveCount(0);
  const handing = current.browse;
  if (handing === null) {
    throw new Error("Fixture progress missing");
  }
  driver.publish?.({
    ...current,
    updatedAt: Date.now(),
    status: "paused",
    browse: {
      ...handing,
      revision: handing.revision + 1,
      phase: "human",
      refreshedAt: null,
      controls: { ...handing.controls, continue: true },
    },
  });
  await card.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    card.getByText("Opening your browser", { exact: true })
  ).toBeVisible();
  const resumed = current.browse;
  if (resumed === null) {
    throw new Error("Fixture progress missing");
  }
  driver.publish?.({
    ...current,
    updatedAt: Date.now(),
    status: "running",
    browse: {
      ...resumed,
      revision: resumed.revision + 1,
      phase: "working",
      refreshedAt: Date.now() - 20_000,
    },
  });
  await expect(card.getByText(/Updates are reconnecting/u)).toBeVisible();
  await expect(card.locator(".browse-task-working")).toHaveCount(0);
  const stale = current.browse;
  if (stale === null) {
    throw new Error("Fixture progress missing");
  }
  driver.publish?.({
    ...current,
    browse: { ...stale, revision: stale.revision + 1, refreshedAt: Date.now() },
  });
  await expect(card.getByText(/Updates are reconnecting/u)).toHaveCount(0);
  const beforeExpiry = current.browse;
  if (beforeExpiry === null) {
    throw new Error("Fixture progress missing");
  }
  driver.publish?.({
    ...current,
    status: "paused",
    browse: {
      ...beforeExpiry,
      revision: beforeExpiry.revision + 1,
      phase: "expired",
      refreshedAt: null,
      controls: {
        stop: true,
        takeControl: false,
        continue: false,
        forceStop: false,
        watch: false,
        reconnect: true,
      },
    },
  });
  await expect(
    card.getByText("Browser session ended", { exact: true })
  ).toBeVisible();
  await expect(
    card.getByRole("button", { name: "Continue", exact: true })
  ).toHaveCount(0);
  await expect(card.locator(".browse-task-working")).toHaveCount(0);
  await card
    .getByRole("button", { name: "Reconnect browser", exact: true })
    .click();
  await expect(
    card.getByText("Opening your browser", { exact: true })
  ).toBeVisible();
  await expect(card.getByText("$1.00 approved", { exact: true })).toBeVisible();
  const reconnected = current.browse;
  if (reconnected === null) {
    throw new Error("Fixture progress missing");
  }
  driver.publish?.({
    ...current,
    status: "running",
    browse: {
      ...reconnected,
      revision: reconnected.revision + 1,
      phase: "working",
      refreshedAt: Date.now(),
    },
  });
  await card.getByRole("button", { name: "Watch live", exact: true }).click();
  await expect(page).toHaveURL(/\/chat$/u);
  const viewer = page.getByRole("dialog", { name: "Watch live", exact: true });
  await expect(viewer).toBeVisible();
  driver.approval?.(true);
  await viewer
    .getByRole("button", { name: "Review approval", exact: true })
    .click();
  await expect(viewer).toBeHidden();
  await expect(
    page
      .getByLabel("Review browsing request")
      .getByRole("button", { name: "Not this time", exact: true })
  ).toBeEnabled();
  driver.approval?.(false);
  await page
    .getByRole("button", { name: /Froggy is browsing · View task/u })
    .click();
  const finishing = current.browse;
  if (finishing === null) {
    throw new Error("Fixture progress missing");
  }
  const done: BrowseTaskView = {
    ...current,
    status: "done",
    browse: {
      ...finishing,
      revision: finishing.revision + 1,
      phase: "done",
      finishedAt: Date.now(),
      controls: {
        stop: false,
        takeControl: false,
        continue: false,
        forceStop: false,
        watch: false,
      },
    },
    result: { text: "The requested shoes are available." },
  };
  driver.publish?.(done);
  await expect(sheet).toBeVisible();
  await expect(
    card.getByText("The requested shoes are available.")
  ).toBeVisible();
  driver.publish?.(done);
  await expect(
    page.locator("output").filter({ hasText: "Finished browsing" })
  ).toHaveCount(1);
});
