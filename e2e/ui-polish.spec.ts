import { expect, test } from "@playwright/test";

import { SessionId } from "../packages/domain/src/id";
import {
  decodeAppServerMessage,
  encodeAppServerMessage,
} from "../packages/protocol/src/app";
import { captureScreen } from "./capture";

interface SessionController {
  change?: () => void;
}

for (const width of [320, 390, 1440]) {
  test(`Home makes room for an active conversation at ${width}px`, async ({
    page,
  }, testInfo) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") {
        errors.push(message.text());
      }
    });
    page.on("pageerror", (error) => {
      errors.push(error.message);
    });
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "What’s the move?" })
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Your money", exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole("complementary", { name: "Watchlist pane" })
    ).toHaveCount(0);
    await captureScreen(page, testInfo, `home-${width}`);
    const composer = page.getByRole("textbox", { name: "Message" });
    await composer.fill("Help me plan a weekend away.");
    if (width < 768) {
      await expect(
        page.getByRole("navigation", { name: "Primary" })
      ).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Send", exact: true })
      ).toBeInViewport();
    }
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.getByRole("log")).toHaveAttribute("aria-busy", "false", {
      timeout: 20_000,
    });
    await expect(
      page.getByRole("heading", { name: "What’s the move?" })
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Your money", exact: true })
    ).toHaveCount(0);
    await page.getByRole("log").click();
    await captureScreen(page, testInfo, `chat-${width}`);
    await page.getByRole("button", { name: "Workspace menu" }).click();
    await expect(
      page.getByRole("link", { name: "Your money", exact: true })
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Conversation options" }).click();
    await page.getByRole("switch", { name: "Search my other chats" }).check();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", { name: "Conversation options" })
    ).toContainText("Other chats on");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true);
    expect(errors).toEqual([]);
  });
}

test("a new session removes cached reminders before the next response arrives", async ({
  page,
  request,
}) => {
  const controller: SessionController = {};
  await page.routeWebSocket("**/ws/app", (socket) => {
    const server = socket.connectToServer();
    server.onMessage((message) => {
      socket.send(message);
      const decoded = decodeAppServerMessage(message);
      if (
        decoded._tag === "Success" &&
        decoded.success.type === "session.welcome"
      ) {
        const welcome = decoded.success;
        controller.change = () => {
          socket.send(
            encodeAppServerMessage({
              ...welcome,
              sessionId: SessionId.generate(),
            })
          );
        };
      }
    });
  });
  await page.goto("/watchlist");
  await expect(
    page.getByText("Nothing scheduled.", { exact: true })
  ).toBeVisible();
  const token = await page.evaluate(() =>
    localStorage.getItem("froggy.local-identity")
  );
  const response = await request.post("/api/schedules", {
    headers: { authorization: `Bearer ${token}` },
    data: {
      v: 1,
      label: "First owner's private reminder",
      action: { _tag: "remind", text: "First owner's private reminder" },
      timezone: "UTC",
      when: { _tag: "in", minutes: 60 },
    },
  });
  expect(response.ok()).toBe(true);
  await page.reload();
  await expect(
    page.getByText("First owner's private reminder", { exact: true }).first()
  ).toBeVisible();
  const release = Promise.withResolvers<null>();
  await page.route("**/api/schedules", async (route) => {
    await release.promise;
    await route.continue();
  });
  try {
    await page.evaluate(() => {
      localStorage.setItem("froggy.local-identity", crypto.randomUUID());
    });
    controller.change?.();
    await expect(
      page.getByText("First owner's private reminder", { exact: true })
    ).toHaveCount(0);
    await expect(page.getByLabel("Loading schedules")).toBeVisible();
    release.resolve(null);
    await expect(
      page.getByText("Nothing scheduled.", { exact: true })
    ).toBeVisible();
  } finally {
    release.resolve(null);
  }
});

test("keyboard button activation has no press transform", async ({ page }) => {
  await page.goto("/watchlist");
  const button = page.getByRole("button", { name: "Add item", exact: true });
  await button.focus();
  await page.keyboard.down("Space");
  await expect(button).toHaveCSS("transform", "none");
  await page.keyboard.up("Space");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(button).toBeFocused();
  await expect(button).toHaveCSS("transform", "none");
});

test("Watchlist stays closed until requested and preserves its choice across navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const pane = page.getByRole("complementary", { name: "Watchlist pane" });
  await expect(pane).toHaveCount(0);
  await page.getByRole("button", { name: "Toggle watchlist pane" }).click();
  await expect(pane).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Primary" });
  await nav.getByRole("link", { name: "Watchlist", exact: true }).click();
  await nav.getByRole("link", { name: "Home", exact: true }).click();
  await expect(pane).toBeVisible();
  await page.reload();
  await expect(pane).toHaveCount(0);
});

test("opening discovery is free and new listings are an explicit request", async ({
  page,
}) => {
  let requests = 0;
  await page.route("**/api/services/run", async (route) => {
    requests += 1;
    await route.continue();
  });
  await page.goto("/");
  await page.getByRole("link", { name: "Find tokens", exact: true }).click();
  await expect(page).toHaveURL(/discover=true/u);
  const discovery = page.getByRole("region", { name: "Discover tokens" });
  await expect(discovery).toBeVisible();
  expect(requests).toBe(0);
  await discovery
    .getByRole("button", { name: "New listings", exact: true })
    .click();
  await discovery
    .getByLabel("Chain", { exact: true })
    .selectOption("eip155:8453");
  expect(requests).toBe(0);
  await discovery.getByRole("button", { name: "Load new listings" }).click();
  await expect(
    discovery.getByRole("region", { name: "Token results" })
  ).toBeVisible();
  expect(requests).toBe(1);
});
