import { expect, test } from "@playwright/test";

for (const reducedMotion of ["no-preference", "reduce"] as const) {
  test(`appearance keeps its hit targets still with ${reducedMotion} motion`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/settings");
    const appearance = page.getByRole("group", {
      name: "Appearance",
      exact: true,
    });
    await appearance.scrollIntoViewIfNeeded();
    const choices = appearance.getByRole("button");
    const before = await choices.evaluateAll((nodes) =>
      nodes.map((node) => {
        const { x, y, width, height } = node.getBoundingClientRect();
        return { x, y, width, height };
      })
    );
    await appearance.getByRole("button", { name: "Lilypad" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "lilypad");
    const after = await choices.evaluateAll((nodes) =>
      nodes.map((node) => {
        const { x, y, width, height } = node.getBoundingClientRect();
        return { x, y, width, height };
      })
    );
    expect(after).toEqual(before);
    await appearance.getByRole("button", { name: "Passbook" }).click();
    await expect(page.locator("html")).toHaveAttribute(
      "data-theme",
      "passbook"
    );
    await appearance.getByRole("button", { name: "Lilypad" }).focus();
    await page.keyboard.press("Space");
    await expect(appearance.getByRole("button", { name: "Lilypad" })).toHaveCSS(
      "outline-style",
      "solid"
    );
    await expect(appearance.getByRole("button", { name: "Lilypad" })).toHaveCSS(
      "outline-width",
      "2px"
    );
    await expect(
      appearance.getByRole("button", { name: "Lilypad" })
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator('[data-slot="appearance-indicator"]')).toHaveCSS(
      "transform",
      /matrix\(1, 0, 0, 1,/u
    );
  });
}

test("reduced-motion dialogs stay centred and return keyboard focus", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/wallet");
  const add = page.getByRole("button", { name: "Add funds", exact: true });
  await add.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Add funds" });
  await expect(dialog).toBeVisible();
  expect(
    await dialog.evaluate((node) => getComputedStyle(node).transitionDuration)
  ).toBe("0s");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(add).toBeFocused();
});
