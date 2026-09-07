import { expect, test } from "@playwright/test";

/**
 * What is scheduled shows on the settings page and can be cancelled there.
 * The rows come from the API; the test serves two and takes one away.
 */
test("scheduled reminders are listed and can be cancelled", async ({
  page,
}) => {
  let cancelled = 0;
  const rows = [
    {
      action: { _tag: "remind", text: "check the oven" },
      cadence: { _tag: "once", at: Date.now() + 600_000 },
      createdAt: Date.now(),
      id: "sch_01k4nwq2v9f8x1bjv3p5r7d9ea",
      label: "oven",
      lastRunAt: null,
      nextRunAt: Date.now() + 600_000,
      status: "active",
      timezone: "Europe/Berlin",
    },
    {
      action: { _tag: "prompt", text: "check the USDC borrow rate" },
      cadence: { _tag: "daily", time: "07:30" },
      createdAt: Date.now(),
      id: "sch_01k4nwq2v9f8x1bjv3p5r7d9eb",
      label: "morning rates",
      lastRunAt: null,
      nextRunAt: Date.now() + 3_600_000,
      status: "active",
      timezone: "Europe/Berlin",
    },
  ];
  await page.route("**/api/schedules", async (route) => {
    await route.fulfill({
      json: { schedules: cancelled === 0 ? rows : rows.slice(1), v: 1 },
    });
  });
  await page.route("**/api/schedules/*", async (route) => {
    cancelled += 1;
    await route.fulfill({ json: { cancelled: true, v: 1 } });
  });
  await page.goto("/settings");
  const scheduled = page.getByRole("region", { name: "Scheduled" });
  await expect(scheduled.getByText("oven", { exact: true })).toBeVisible();
  await expect(scheduled.getByText("Every day at 07:30")).toBeVisible();
  await expect(scheduled.getByText("Remind: check the oven")).toBeVisible();
  await scheduled.getByRole("button", { name: "Cancel oven" }).click();
  await expect(scheduled.getByText("oven", { exact: true })).toHaveCount(0);
  await expect(
    scheduled.getByText("morning rates", { exact: true })
  ).toBeVisible();
  expect(cancelled).toBe(1);
});
