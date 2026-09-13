import { expect, test } from "@playwright/test";

/**
 * Delete my data means the receipts too: a paid task leaves one in the
 * wallet's activity, and after the deletion the activity is empty again.
 */
test("deleting my data wipes the receipts and starts over", async ({
  page,
}) => {
  await page.goto("/chat");
  await page
    .getByRole("textbox", { name: "Message" })
    .fill("Send 0.004 USDC to 0x0000000000000000000000000000000000000001");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  const approval = page.getByLabel(/^Approve .* to /u);
  await expect(approval).toBeVisible();
  await approval.getByRole("button", { name: "Not this time" }).click();
  await expect(page.getByLabel(/^Refused:/u).first()).toBeVisible();
  await page.goto("/wallet");
  const activity = page.getByRole("region", { name: "Activity", exact: true });
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
      .getByRole("region", { name: "Activity", exact: true })
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

test("digest controls and scheduled work stay synchronized", async ({
  page,
}) => {
  await page.goto("/settings");
  const hour = page.getByLabel("Daily digest hour");
  await expect(hour).toHaveValue("off");
  await hour.selectOption("9");
  const cancel = page.getByRole("button", {
    name: "Cancel Daily digest",
    exact: true,
  });
  await expect(cancel).toBeVisible();
  await cancel.click();
  await expect(cancel).toHaveCount(0);
  await expect(hour).toHaveValue("off");
});

test("Send a test now asks first, then runs a digest and says where it went", async ({
  page,
}) => {
  let posted = 0;
  await page.route("**/api/digest/test", async (route) => {
    posted += 1;
    await route.continue();
  });
  await page.goto("/settings");
  await page.getByRole("button", { name: "Send a test now" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("runs for real");
  await expect(dialog).toContainText("may spend within your rules");
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
  expect(posted).toBe(0);
  await page.getByRole("button", { name: "Send a test now" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Send a test now" })
    .click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: /Sent\.|Not sent|Stopped early/u })
  ).toContainText(/Sent\.|Not sent|Stopped early/u, {
    timeout: 60_000,
  });
  expect(posted).toBe(1);
});
