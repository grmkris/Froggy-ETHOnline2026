import { expect, test } from "@playwright/test";

import { decodeBrowserClientMessage } from "../packages/protocol/src/browser";
import type { BrowserState } from "../packages/protocol/src/browser";

interface DriverFixture {
  finishTakeover?: () => void;
  extensions: number;
}

test("Cloud viewer stays inert until takeover finishes and keeps the same page on Resume", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
  const driver: DriverFixture = { extensions: 0 };
  await page.route("**/api/browser/viewer", async (route) => {
    expect(route.request().headers()["authorization"]).toMatch(/^Bearer /u);
    await route.fulfill({
      json: { v: 1, url: "https://live.browser-use.com/froggy-fixture" },
    });
  });
  await page.route(
    "https://live.browser-use.com/froggy-fixture",
    async (route) => {
      await route.fulfill({
        contentType: "text/html",
        body: '<label>Website login<input aria-label="Website login"></label>',
      });
    }
  );
  await page.routeWebSocket("**/ws/browser", (socket) => {
    let deadline = Date.now() + 600_000;
    const expiresAt = Date.now() + 3_600_000;
    const publish = (control: "agent" | "stopping" | "human"): void => {
      const state: BrowserState = {
        activeTabId: null,
        error: null,
        interaction: control === "human" ? "human" : "agent",
        queue: null,
        status: "running",
        tabs: [],
        viewport: { width: 1280, height: 800 },
        cloud: {
          control,
          viewerReady: true,
          expiresAt,
          idleExpiresAt: deadline,
          stubbed: true,
        },
      };
      socket.send(JSON.stringify({ v: 1, type: "browser.state", state }));
    };
    socket.onMessage((raw) => {
      const decoded = decodeBrowserClientMessage(raw.toString());
      if (decoded._tag === "Failure") {
        return;
      }
      const message = decoded.success;
      if (message.type === "browser.take") {
        publish("stopping");
        driver.finishTakeover = () => {
          publish("human");
        };
      }
      if (message.type === "browser.resume") {
        publish("agent");
      }
      if (message.type === "browser.start") {
        driver.extensions += 1;
        deadline += 600_000;
        publish("human");
      }
      if (message.type === "ping") {
        socket.send(
          JSON.stringify({ v: 1, type: "pong", sentAt: message.sentAt })
        );
      }
    });
    publish("agent");
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Show the browser", exact: true })
    .click();
  const frame = page.locator(
    'iframe[src="https://live.browser-use.com/froggy-fixture"]'
  );
  await expect(frame).toHaveAttribute("inert", "");
  await expect(frame).not.toHaveAttribute("sandbox", /allow-same-origin/u);
  await page
    .getByRole("button", { name: "Take the page", exact: true })
    .click();
  await expect(page.getByText("Stopping…", { exact: true })).toBeVisible();
  await expect(frame).toHaveAttribute("inert", "");
  expect(driver.finishTakeover).toBeDefined();
  driver.finishTakeover?.();
  await expect(frame).not.toHaveAttribute("inert", "");
  const login = page
    .frameLocator('iframe[src="https://live.browser-use.com/froggy-fixture"]')
    .getByRole("textbox", { name: "Website login" });
  await login.fill("owner fixture");
  await expect(page.getByText(/Browser closes at/u)).toBeVisible();
  await page.getByRole("button", { name: "Keep open", exact: true }).click();
  await expect.poll(() => driver.extensions).toBe(1);
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await expect(frame).toHaveAttribute("inert", "");
  await expect(login).toHaveValue("owner fixture");
  expect(errors).toEqual([]);
});
