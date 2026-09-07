import { expect, test } from "@playwright/test";

/**
 * Delete my data means the receipts too: a paid task leaves one in the
 * wallet's activity, and after the deletion the activity is empty again.
 */
test("deleting my data wipes the receipts and starts over", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByText("Buy the lending snapshot").click();
  await page.goto("/wallet");
  const activity = page.getByRole("region", { name: "Activity" });
  await expect(activity.getByText("Nothing spent or refused yet.")).toHaveCount(
    0,
    { timeout: 20_000 }
  );

  await page.goto("/settings");
  await page.getByRole("button", { name: "Delete my data" }).click();
  // Confirming wipes the account and reloads the page; wait for that load.
  await Promise.all([
    page.waitForEvent("load"),
    page.getByRole("button", { name: "Delete", exact: true }).click(),
  ]);

  await page.goto("/wallet");
  await expect(
    page
      .getByRole("region", { name: "Activity" })
      .getByText("Nothing spent or refused yet.")
  ).toBeVisible();
});

for (const failure of ["server", "network"] as const) {
  test(`failed data deletion stays open and can be retried after a ${failure} error`, async ({
    page,
  }) => {
    let attempts = 0;
    let loads = 0;
    await page.route("**/api/me", async (route) => {
      if (route.request().method() !== "DELETE") {
        await route.continue();
        return;
      }
      attempts += 1;
      if (attempts > 1) {
        await route.continue();
      } else if (failure === "network") {
        await route.abort("failed");
      } else {
        await route.fulfill({ status: 503, json: { error: "unavailable" } });
      }
    });
    await page.goto("/settings");
    page.on("load", () => {
      loads += 1;
    });
    await page.getByRole("button", { name: "Delete my data" }).click();
    const dialog = page.getByRole("alertdialog");
    await dialog.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText(
      "Couldn’t confirm deletion"
    );
    await expect(
      dialog.getByRole("button", { name: "Delete", exact: true })
    ).toBeEnabled();
    expect(loads).toBe(0);
    await Promise.all([
      page.waitForEvent("load"),
      dialog.getByRole("button", { name: "Delete", exact: true }).click(),
    ]);
    expect(attempts).toBe(2);
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
  });
}

test("enabling a digest reports a failed save even when it was off", async ({
  page,
}) => {
  let attempts = 0;
  await page.route("**/api/digest", async (route) => {
    if (route.request().method() === "PUT") {
      attempts += 1;
      if (attempts === 1) {
        await route.fulfill({ status: 503, json: { error: "unavailable" } });
        return;
      }
    }
    await route.continue();
  });
  await page.goto("/settings");
  const hour = page.getByRole("combobox", { name: "Daily digest hour" });
  await expect(hour).toHaveValue("off");
  await hour.selectOption("7");
  await expect(page.getByRole("alert")).toContainText(
    "Couldn’t save your daily digest"
  );
  await expect(hour).toHaveValue("off");
  await hour.selectOption("7");
  await expect(hour).toHaveValue("7");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.reload();
  await expect(hour).toHaveValue("7");
  expect(attempts).toBe(2);
});

test("an unavailable digest is not presented as off and can be reloaded", async ({
  page,
}) => {
  let attempts = 0;
  await page.route("**/api/digest", async (route) => {
    attempts += 1;
    if (attempts === 1) {
      await route.fulfill({ status: 503, json: { error: "unavailable" } });
      return;
    }
    await route.continue();
  });
  await page.goto("/settings");
  const hour = page.getByRole("combobox", { name: "Daily digest hour" });
  await expect(page.getByRole("alert")).toContainText(
    "Couldn’t load your daily digest"
  );
  await expect(hour).toHaveValue("unknown");
  await expect(hour).toBeDisabled();
  await page.getByRole("button", { name: "Retry loading digest" }).click();
  await expect(hour).toHaveValue("off");
  await expect(hour).toBeEnabled();
});
