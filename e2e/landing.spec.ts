import { expect, test } from "@playwright/test";

import { landingIdentity, changeLandingIdentity } from "./landing-identity";

// Page interactions must finish in order; parallel clicks race the same UI.
const visit = async <T>(
  items: readonly T[],
  action: (item: T) => Promise<void>
): Promise<void> => {
  const [first, ...rest] = items;
  if (first === undefined) {
    return;
  }
  await action(first);
  await visit(rest, action);
};

for (const width of [320, 390, 768, 1024, 1440]) {
  test(`the landing is public and responsive at ${width}px`, async ({
    page,
  }, info) => {
    const errors: string[] = [];
    const privateRequests: string[] = [];
    const brokenAssets: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") {
        errors.push(message.text());
      }
    });
    page.on("request", (request) => {
      if (new URL(request.url()).pathname.startsWith("/api/")) {
        privateRequests.push(request.url());
      }
    });
    page.on("response", (response) => {
      if (
        response.url().includes("/froggy/landing/") &&
        response.status() >= 400
      ) {
        brokenAssets.push(response.url());
      }
    });
    page.on("websocket", (socket) => {
      if (new URL(socket.url()).pathname.startsWith("/ws/")) {
        privateRequests.push(socket.url());
      }
    });
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/landing");
    await expect(
      page.getByRole("heading", { name: "A home for your agents." })
    ).toBeVisible();
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("video")).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Primary" })).toHaveCount(
      0
    );
    await expect(
      page.getByText("Local identity · development preview").first()
    ).toBeVisible();
    await visit(
      ["watch", "possibilities", "connect", "money", "setup"],
      async (id) => {
        await page.locator(`#${id}`).scrollIntoViewIfNeeded();
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth)
        ).toBeLessThanOrEqual(width);
      }
    );
    await visit(["Shopping", "Travel", "Tickets & games"], async (name) => {
      await page.getByRole("tab", { name, exact: true }).click();
      const art = page.getByRole("tabpanel").locator("img");
      await art.scrollIntoViewIfNeeded();
      await art.evaluate(async (image: HTMLImageElement) => {
        await image.decode();
      });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth)
      ).toBeLessThanOrEqual(width);
    });
    await page.getByRole("tab", { name: "Shopping", exact: true }).click();
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    await page.evaluate(() => {
      window.scrollTo(0, 0);
    });
    await page.screenshot({
      path: info.outputPath(`landing-${width}.png`),
      fullPage: true,
      animations: "disabled",
    });
    await expect(page.locator(".landing-steps li")).toHaveCount(3);
    expect(privateRequests).toEqual([]);
    expect(brokenAssets).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test("walkthrough, scenario review and keep watching stay local", async ({
  page,
}) => {
  const actions: string[] = [];
  page.on("request", (request) => {
    if (request.method() !== "GET") {
      actions.push(request.url());
    }
  });
  await page.goto("/landing");
  await visit(
    [
      "Put the browser to work.",
      "A draft, ready for your eyes.",
      "Something you can use.",
    ],
    async (title) => {
      await page.getByRole("button", { name: "Next step" }).click();
      await expect(page.getByRole("heading", { name: title })).toBeVisible();
    }
  );
  await page.getByRole("button", { name: "Start again" }).click();
  await expect(
    page.getByRole("heading", { name: "A little less searching." })
  ).toBeVisible();
  await visit(
    [
      ["Shopping", "Preview a match"],
      ["Travel", "Preview a trip"],
      ["Tickets & games", "Preview an alert"],
    ] as const,
    async ([tab, action]) => {
      await page.getByRole("tab", { name: tab, exact: true }).click();
      await page.getByRole("button", { name: action }).click();
      await page
        .getByRole("button", { name: "Review example", exact: true })
        .click();
      await expect(page.locator(".landing-example-status")).toContainText(
        /review|check/iu
      );
      await page.getByRole("button", { name: "Show example again" }).click();
      await page.getByRole("button", { name: "Keep watching" }).click();
      await expect(page.locator(".landing-example-status")).toContainText(
        "No live monitor was created."
      );
    }
  );
  expect(actions).toEqual([]);
});

test("navigation, keyboard tabs, FAQs and reduced motion work", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/landing");
  await expect(
    page.getByRole("heading", { name: "A home for your agents." })
  ).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" })
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#landing-main$/u);
  await visit(
    [
      ["What it can do", "possibilities"],
      ["See it in action", "watch"],
      ["Bring your agent", "connect"],
    ] as const,
    async ([name, id]) => {
      await page
        .getByRole("navigation", { name: "Page navigation" })
        .getByRole("link", { name, exact: true })
        .click();
      await expect(page).toHaveURL(new RegExp(`#${id}$`, "u"));
    }
  );
  await page.getByRole("tab", { name: "Shopping", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("tab", { name: "Travel", exact: true })
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("tab", { name: "Travel", exact: true })
  ).toHaveAttribute("aria-selected", "true");
  const questions = page.locator(".landing-faq summary");
  await visit(await questions.all(), async (question) => {
    await question.focus();
    await page.keyboard.press("Enter");
    await expect(question.locator("..")).toHaveAttribute("open", "");
    await page.keyboard.press("Enter");
    await expect(question.locator("..")).not.toHaveAttribute("open");
  });
  await expect(page.locator(".landing-example-status")).toHaveCSS(
    "animation-name",
    "none"
  );
});

test("connection copy uses this deployment and handles denied clipboard", async ({
  page,
  context,
  baseURL,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/landing");
  await page
    .getByRole("button", { name: "Copy connection instructions" })
    .click();
  await expect(page.locator(".landing-copy-status")).toHaveText(
    "Connection instructions copied."
  );
  const instructions = await page.evaluate(
    async () => await navigator.clipboard.readText()
  );
  expect(instructions).toContain(`${baseURL}/skill.md`);
  expect(instructions).toContain(`${baseURL}/mcp`);
  expect(instructions).not.toContain("fgy_");
  const guide = await page.request.get("/skill.md");
  expect(guide.ok()).toBe(true);
  expect(await guide.text()).toContain(`${baseURL}/mcp`);
  await page.evaluate(() => {
    Object.defineProperty(navigator.clipboard, "writeText", {
      value: async () => {
        await Promise.reject(new Error("Denied"));
      },
    });
  });
  await page
    .getByRole("button", { name: "Copy connection instructions" })
    .click();
  await expect(page.locator(".landing-copy-status")).toContainText(
    "Copy wasn’t available."
  );
});

test("art failure leaves the story and primary actions usable", async ({
  page,
}) => {
  await page.route("**/froggy/landing/*.webp", async (route) => {
    await route.abort();
  });
  await page.goto("/landing");
  await expect(
    page.getByRole("heading", { name: "A home for your agents." })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open workspace" }).first()
  ).toBeEnabled();
  await page.getByRole("button", { name: "Preview a match" }).click();
  await expect(
    page.getByRole("button", { name: "Review example" })
  ).toBeVisible();
});

test("the approved preview URL stays public", async ({ page }) => {
  await landingIdentity(page, "signed-out");
  await page.goto("/landing/playground");
  await expect(
    page.getByRole("heading", { name: "A home for your agents." })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }).first()
  ).toBeVisible();
});
test("local sign-in from the landing opens Home", async ({ page }) => {
  await page.goto("/landing");
  await page.getByRole("button", { name: "Open workspace" }).first().click();
  await expect(page).toHaveURL(/\/$/u);
  await expect(
    page.getByRole("heading", { name: "What can I help with?" })
  ).toBeVisible();
});

test("a cancelled sign-in stays on the landing, then a completed sign-in reaches onboarding", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await landingIdentity(page, "signed-out");
  await page.route("**/api/setup", async (route) => {
    await route.fulfill({ json: { v: 1, seenAt: null } });
  });
  await page.goto("/landing");
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }).first()
  ).toBeEnabled();
  await page.evaluate(() => {
    window.addEventListener("landing-test-login", () => {
      document.body.dataset["loginInvoked"] = "yes";
    });
  });
  await page
    .getByRole("button", { name: "Sign in", exact: true })
    .first()
    .click();
  await expect(page.locator("body")).toHaveAttribute(
    "data-login-invoked",
    "yes"
  );
  await changeLandingIdentity(page, "signed-out");
  await expect(page).toHaveURL(/\/landing$/u);
  await page
    .getByRole("button", { name: "Sign in", exact: true })
    .first()
    .click();
  await changeLandingIdentity(page, "signed-in");
  await expect(page).toHaveURL(/\/welcome$/u);
  await expect(
    page.getByRole("heading", { name: "Welcome to Froggy." })
  ).toBeVisible();
});

test("an existing signed-in visitor can read the landing without a redirect", async ({
  page,
}) => {
  await landingIdentity(page, "signed-in");
  await page.goto("/landing");
  await expect(
    page.getByRole("button", { name: "Open workspace" }).first()
  ).toBeVisible();
  await expect(page).toHaveURL(/\/landing$/u);
});

test("loading and failed sign-in leave the public page usable with a retry", async ({
  page,
}) => {
  await landingIdentity(page, "loading");
  await page.goto("/landing");
  await expect(
    page.getByRole("button", { name: "Preparing sign-in" }).first()
  ).toBeDisabled();
  await expect(
    page.getByRole("heading", { name: "A home for your agents." })
  ).toBeVisible();
  await changeLandingIdentity(page, "failed");
  await expect(
    page.getByRole("button", { name: "Retry sign-in" }).first()
  ).toBeEnabled();
  await changeLandingIdentity(page, "signed-out");
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }).first()
  ).toBeEnabled();
});

test("a signed-out workspace URL still shows the original sign-in gate", async ({
  page,
}) => {
  await landingIdentity(page, "signed-out");
  await page.goto("/wallet");
  await expect(page.locator(".landing")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Primary" })).toHaveCount(
    0
  );
  await expect(
    page.getByRole("button", { name: /Sign in/u }).first()
  ).toBeVisible();
});

test("every sign-in CTA and in-page link has a working destination", async ({
  page,
}) => {
  await landingIdentity(page, "signed-out");
  await page.goto("/landing");
  await expect(
    page.getByRole("heading", { name: "A home for your agents." })
  ).toBeVisible();
  await page.evaluate(() => {
    document.body.dataset["loginCount"] = "0";
    window.addEventListener("landing-test-login", () => {
      document.body.dataset["loginCount"] = String(
        Number(document.body.dataset["loginCount"]) + 1
      );
    });
  });
  const buttons = await page
    .getByRole("button", { name: "Sign in", exact: true })
    .all();
  expect(buttons).toHaveLength(3);
  await visit(buttons, async (button) => {
    await button.click();
  });
  await expect(page.locator("body")).toHaveAttribute("data-login-count", "3");
  await expect(page).toHaveURL(/\/landing$/u);
  await visit(
    await page.locator('.landing a[href^="#"]').all(),
    async (link) => {
      const href = await link.getAttribute("href");
      if (href === null) {
        throw new Error("Missing anchor destination");
      }
      await expect(page.locator(href)).toHaveCount(1);
      await link.focus();
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(new RegExp(`${href}$`, "u"));
    }
  );
  await expect(page.locator('meta[name="description"]')).toHaveCount(1);
});
