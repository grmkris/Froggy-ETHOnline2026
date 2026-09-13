import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { Schema } from "effect";

import { AgentToken } from "../packages/domain/src/agent-token";
import { UpdateId } from "../packages/domain/src/id";
import { UpdatesPage } from "../packages/domain/src/update";
import type { Update } from "../packages/domain/src/update";

const updatesFixture = async (page: Page) => {
  const rows: Update[] = Array.from({ length: 32 }, (_, index): Update => ({
    v: 1,
    id: UpdateId.generate(),
    itemId: null,
    kind: "notice",
    key: `fixture:${index}`,
    title: `Recorded update ${index + 1}`,
    body: `An explicitly simulated notification, number ${index + 1}.`,
    at: Date.now() + index,
    readAt: null,
    stubbed: true,
  })).toReversed();
  const unread = () => rows.filter((row) => row.readAt === null).length;
  await page.route("**/api/updates**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/updates") {
      const before = url.searchParams.get("before");
      const start =
        before !== null && before !== ""
          ? rows.findIndex((row) => row.id === before) + 1
          : 0;
      const updates = rows.slice(start, start + 30);
      await route.fulfill({
        json: {
          v: 1,
          updates,
          unread: unread(),
          next: start + 30 < rows.length ? updates.at(-1)?.id : null,
        },
      });
      return;
    }
    if (url.pathname === "/api/updates/read-all") {
      for (const [index, row] of rows.entries()) {
        rows[index] = { ...row, readAt: row.readAt ?? Date.now() };
      }
      await route.fulfill({ json: { v: 1, unread: 0 } });
      return;
    }
    const id = url.pathname.split("/").at(3);
    const index = rows.findIndex((row) => row.id === id);
    const update = rows[index];
    if (!update) {
      await route.fulfill({
        status: 404,
        json: { v: 1, error: "Update not found." },
      });
      return;
    }
    if (request.method() === "POST") {
      rows[index] = { ...update, readAt: update.readAt ?? Date.now() };
      await route.fulfill({ json: { v: 1, unread: unread() } });
      return;
    }
    await route.fulfill({ json: { v: 1, update, activity: null } });
  });
  return rows;
};

for (const width of [1440, 390, 320]) {
  test(`Updates works without an email account and preserves read state at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on("pageerror", (error) => {
      errors.push(error.message);
    });
    const rows = await updatesFixture(page);
    const [first] = rows;
    if (!first) {
      throw new Error("Missing fixture update");
    }
    await page.goto("/inbox?feed=updates");
    const primary = page.getByRole("navigation", {
      name: "Primary",
      exact: true,
    });
    await expect(
      primary.getByRole("link", {
        name: "Inbox, 32 updates unread",
        exact: true,
      })
    ).toBeVisible();
    await expect(page.getByRole("tab", { name: "Updates" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    await expect(page.getByLabel("Choose your permanent address")).toHaveCount(
      0
    );
    const list = page.getByRole("region", {
      name: "Updates list",
      exact: true,
    });
    await expect(list.getByRole("link")).toHaveCount(30);
    await page.getByRole("button", { name: "Older updates" }).click();
    await expect(list.getByRole("link")).toHaveCount(2);
    await page.getByRole("button", { name: "Newer updates" }).click();
    await list.getByRole("link").first().click();
    const reader = page.getByRole("region", {
      name: "Update reader",
      exact: true,
    });
    await expect(
      reader.getByRole("heading", { name: first.title, exact: true })
    ).toBeVisible();
    await expect(reader.getByText("Simulated", { exact: true })).toBeVisible();
    await expect(
      primary.getByRole("link", {
        name: "Inbox, 31 updates unread",
        exact: true,
      })
    ).toBeVisible();
    if (width < 1024) {
      await reader.getByRole("link", { name: "Updates", exact: true }).click();
    }
    await page.getByRole("button", { name: "Mark all read" }).click();
    await expect(
      primary.getByRole("link", { name: "Inbox", exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Mark all read" })
    ).toBeDisabled();
    await page.reload();
    await expect(
      primary.getByRole("link", { name: "Inbox", exact: true })
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    ).toBe(true);
    expect(errors).toEqual([]);
  });
}

test("Updates supports a direct link with reduced motion and a missing record", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const rows = await updatesFixture(page);
  const [first] = rows;
  if (!first) {
    throw new Error("Missing fixture update");
  }
  await page.goto(`/inbox?feed=updates&update=${first.id}`);
  await expect(
    page
      .getByRole("region", { name: "Update reader", exact: true })
      .getByRole("heading", { name: first.title })
  ).toBeVisible();
  await page.goto(`/inbox?feed=updates&update=${UpdateId.generate()}`);
  await expect(
    page
      .getByRole("region", { name: "Update reader", exact: true })
      .getByText("Update not found.")
  ).toBeVisible();
});

test("an MCP notice reaches the real Updates feed and agents cannot mark it read", async ({
  page,
}) => {
  await page.goto("/inbox?feed=updates");
  await expect(
    page.getByRole("heading", { name: "All quiet for now" })
  ).toBeVisible();
  const ownerToken = await page.evaluate(() =>
    localStorage.getItem("froggy.local-identity")
  );
  const owner = { authorization: `Bearer ${ownerToken}` };
  const response = await page.request.post("/api/agents", {
    headers: owner,
    data: { label: "Updates integration" },
  });
  const minted = Schema.decodeUnknownSync(
    Schema.Struct({ secret: Schema.String, token: AgentToken })
  )(await response.json());
  const agent = {
    authorization: `Bearer ${minted.secret}`,
    accept: "application/json, text/event-stream",
  };
  const result = await page.request.post("/mcp", {
    headers: agent,
    data: {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "froggy_notify",
        arguments: { text: "The integration check finished." },
      },
    },
  });
  expect(result.ok()).toBe(true);
  await expect(
    page
      .getByRole("navigation", { name: "Primary", exact: true })
      .getByRole("link", { name: "Inbox, 1 updates unread", exact: true })
  ).toBeVisible();
  const listResponse = await page.request.get("/api/updates", {
    headers: owner,
  });
  const updates = Schema.decodeUnknownSync(UpdatesPage)(
    await listResponse.json()
  );
  const [update] = updates.updates;
  if (!update) {
    throw new Error("Notice was not filed");
  }
  const denied = await page.request.post(`/api/updates/${update.id}/read`, {
    headers: agent,
    data: { v: 1 },
  });
  expect(denied.status()).toBe(403);
  await page
    .getByRole("region", { name: "Updates list", exact: true })
    .getByRole("link")
    .first()
    .click();
  await expect(
    page
      .getByRole("region", { name: "Update reader", exact: true })
      .getByText("The integration check finished.", { exact: true })
  ).toBeVisible();
  await expect(
    page
      .getByRole("navigation", { name: "Primary", exact: true })
      .getByRole("link", { name: "Inbox", exact: true })
  ).toBeVisible();
});
