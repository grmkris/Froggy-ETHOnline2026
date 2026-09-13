import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { Schema } from "effect";

import { WatchlistItem } from "../packages/domain/src/watchlist";
import { ServiceCatalog } from "../packages/protocol/src/services";
import {
  WatchlistCaptured,
  WatchlistDetails,
} from "../packages/protocol/src/watchlist";
import { captureScreen } from "./capture";
import { fundCredits } from "./fund-credits";

const ownerHeaders = async (page: Page) => {
  await expect
    .poll(
      async () =>
        await page.evaluate(() => localStorage.getItem("froggy.local-identity"))
    )
    .not.toBeNull();
  const token = await page.evaluate(() =>
    localStorage.getItem("froggy.local-identity")
  );
  return { authorization: `Bearer ${token}` };
};

for (const width of [1440, 390]) {
  test(`paste tracks an address at once without a purchase at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on("pageerror", (error) => {
      errors.push(error.message);
    });
    let tracks = 0;
    let purchases = 0;
    page.on("request", (request) => {
      if (request.method() !== "POST") {
        return;
      }
      const path = new URL(request.url()).pathname;
      if (path === "/api/watchlist/track") {
        tracks += 1;
      }
      if (path === "/api/services/run" || path === "/api/tasks") {
        purchases += 1;
      }
    });
    await page.goto("/watchlist");
    const input = page.getByRole("textbox", {
      name: "Address, link or token name",
    });
    await input.focus();
    await input.evaluate((element) => {
      const clipboardData = new DataTransfer();
      clipboardData.setData(
        "text",
        "0x1111111111111111111111111111111111111111"
      );
      element.dispatchEvent(
        new ClipboardEvent("paste", { bubbles: true, clipboardData })
      );
    });
    await expect(input).toHaveValue("");
    await expect(input).toBeFocused();
    const items = page.getByRole("region", { name: "Saved items" });
    await expect(items.getByRole("link")).toHaveCount(1);
    await expect(items).toContainText("Not seen on any chain we checked", {
      timeout: 20_000,
    });
    await expect(
      items.getByRole("button", { name: "Check again" })
    ).toBeVisible();
    await expect(items).toContainText("Simulated");
    await expect(
      items.getByRole("switch", { name: "Notify me" })
    ).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(tracks).toBe(1);
    expect(purchases).toBe(0);
    await captureScreen(page, testInfo, `paste-tracked-${width}`);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true);
    expect(errors).toEqual([]);
  });
}

test("typing filters saved items for free and Enter searches tokens", async ({
  page,
}) => {
  await page.goto("/watchlist");
  await fundCredits(page);
  let purchases = 0;
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      request.url().endsWith("/api/services/run")
    ) {
      purchases += 1;
    }
  });
  const input = page.getByRole("textbox", {
    name: "Address, link or token name",
  });
  await input.fill("froggy");
  await expect(page.getByRole("region", { name: "Saved items" })).toContainText(
    "Nothing matches yet"
  );
  expect(purchases).toBe(0);
  await input.press("Enter");
  await expect(
    page.getByRole("region", { name: "Token results" })
  ).toBeVisible();
  expect(purchases).toBe(1);
});

test("a changed enrichment price saves the item without buying work", async ({
  page,
}) => {
  await page.goto("/watchlist");
  const headers = await ownerHeaders(page);
  const response = await page.request.post("/api/watchlist/capture", {
    headers,
    data: {
      v: 2,
      title: "A trip to keep",
      notes: "Berlin to Lisbon",
      source: { _tag: "flight", url: "https://example.com/trip" },
      enrich: true,
      acceptedPrice: 0,
    },
  });
  expect(response.status()).toBe(201);
  const result = Schema.decodeUnknownSync(WatchlistCaptured)(
    await response.json()
  );
  expect(result.item.title).toBe("A trip to keep");
  expect(result.data.enrichment?.status).toBe("failed");
  expect(result.data.enrichment?.taskId).toBeNull();
  await page.reload();
  await expect(
    page.getByRole("link", { name: "A trip to keep" })
  ).toBeVisible();
});

test("historical charts and comparison use stored snapshots without purchasing", async ({
  page,
}, testInfo) => {
  await page.goto("/watchlist");
  const headers = await ownerHeaders(page);
  const items = await Promise.all(
    ["Token Alpha", "Token Beta"].map(async (title, index) => {
      const response = await page.request.post("/api/watchlist", {
        headers,
        data: {
          v: 1,
          title,
          notes: "Research fixture",
          source: {
            _tag: "token",
            network: "eip155:8453",
            address: `0x${String(index + 1).repeat(40)}`,
          },
        },
      });
      return Schema.decodeUnknownSync(WatchlistItem)(await response.json());
    })
  );
  const observedAt = Date.now();
  const points = [1, 2, 3, 4].map((close, index) => ({
    at: observedAt - (4 - index) * 3_600_000,
    close,
  }));
  await page.route("**/api/watchlist/*/details", async (route) => {
    const item = items.find((entry) =>
      route.request().url().includes(entry.id)
    );
    if (!item || item.source._tag !== "token") {
      await route.continue();
      return;
    }
    const latest = {
      at: observedAt,
      source: "Birdeye fixture",
      sourceUrl: null,
      price: 4,
      currency: "USD",
      basis: "Fixture",
      stubbed: true,
      facts: [{ label: "Liquidity", value: "1000 USD" }],
    };
    await route.fulfill({
      json: {
        v: 1,
        item,
        data: {
          v: 1,
          itemId: item.id,
          latest,
          observations: [latest],
          snapshotTaskId: null,
          enrichment: null,
        },
        snapshot: {
          v: 1,
          operation: "token_snapshot",
          provider: "birdeye",
          network: "eip155:8453",
          address: item.source.address,
          token: null,
          stubbed: true,
          observedAt,
          freshness: "provider_snapshot",
          limitations: ["Simulated historical data for UI verification."],
          series: [
            { window: "24h", interval: "15m", status: "observed", points },
            { window: "7d", interval: "1H", status: "observed", points },
          ],
        },
      },
    });
  });
  let purchases = 0;
  page.on("request", (request) => {
    if (request.method() === "POST") {
      purchases += 1;
    }
  });
  await page.reload();
  await page.getByRole("button", { name: "Compare", exact: true }).click();
  await page.getByRole("checkbox", { name: "Compare Token Alpha" }).check();
  await page.getByRole("checkbox", { name: "Compare Token Beta" }).check();
  await expect(
    page.getByRole("region", { name: "Token performance comparison" })
  ).toBeVisible();
  await captureScreen(page, testInfo, "token-comparison");
  await page.getByRole("link", { name: "Token Alpha", exact: true }).click();
  const history = page.getByRole("region", {
    name: "Price history",
    exact: true,
  });
  await expect(history).toBeVisible();
  await history.getByRole("button", { name: "7d", exact: true }).click();
  await captureScreen(page, testInfo, "stored-token-history");
  expect(purchases).toBe(0);
});

test("duplicate enrichment requests cannot purchase a token absent on supported chains", async ({
  page,
}) => {
  await page.goto("/watchlist");
  const headers = await ownerHeaders(page);
  await fundCredits(page);
  const catalogResponse = await page.request.get("/api/services", { headers });
  const catalog = Schema.decodeUnknownSync(ServiceCatalog)(
    await catalogResponse.json()
  );
  const card = catalog.services.find(
    (service) => service.name === "token_snapshot"
  );
  expect(card).toBeDefined();
  if (!card) {
    return;
  }
  const price = card.priceUsdMicros;
  const input = {
    v: 2,
    title: "Enrichment fixture",
    notes: "",
    source: {
      _tag: "token",
      network: "eip155:8453",
      address: "0x1111111111111111111111111111111111111111",
    },
    enrich: true,
    acceptedPrice: price,
  };
  const responses = await Promise.all(
    [0, 1].map(
      async () =>
        await page.request.post("/api/watchlist/capture", {
          headers,
          data: input,
        })
    )
  );
  const captures = await Promise.all(
    responses.map(async (response) =>
      Schema.decodeUnknownSync(WatchlistCaptured)(await response.json())
    )
  );
  const item = captures[0]?.item;
  expect(item).toBeDefined();
  if (!item) {
    return;
  }
  expect(captures[1]?.item.id).toBe(item.id);
  const details = async () => {
    const response = await page.request.get(
      `/api/watchlist/${item.id}/details`,
      { headers }
    );
    return Schema.decodeUnknownSync(WatchlistDetails)(await response.json());
  };
  const status = async () => {
    const result = await details();
    return result.data.enrichment?.status;
  };
  await expect.poll(status).toBe("failed");
  const tasks = async () => {
    const response = await page.request.get("/api/tasks", { headers });
    const result = Schema.decodeUnknownSync(
      Schema.Struct({
        v: Schema.Literal(1),
        tasks: Schema.Array(
          Schema.Struct({
            kind: Schema.String,
            input: Schema.Record(Schema.String, Schema.Json),
          })
        ),
      })
    )(await response.json());
    return result.tasks.filter(
      (task) =>
        task.kind === "service" && task.input["service"] === "token_snapshot"
    );
  };
  expect(await tasks()).toHaveLength(0);
  const refresh = {
    v: 1,
    revision: item.revision,
    acceptedPrice: price,
    idempotencyKey: "same-refresh",
  };
  const refreshed = await Promise.all(
    [0, 1].map(
      async () =>
        await page.request.post(`/api/watchlist/${item.id}/enrich`, {
          headers,
          data: refresh,
        })
    )
  );
  expect(refreshed.map((response) => response.status())).toEqual([409, 409]);
  await expect.poll(status).toBe("failed");
  expect(await tasks()).toHaveLength(0);
});

test("an unavailable token stays saved and enrichment is not retried automatically", async ({
  page,
}) => {
  await page.goto("/watchlist");
  const headers = await ownerHeaders(page);
  const catalogResponse = await page.request.get("/api/services", { headers });
  const catalog = Schema.decodeUnknownSync(ServiceCatalog)(
    await catalogResponse.json()
  );
  const card = catalog.services.find(
    (entry) => entry.name === "token_snapshot"
  );
  expect(card).toBeDefined();
  if (!card) {
    return;
  }
  const input = {
    v: 2,
    title: "Saved without credits",
    notes: "",
    source: {
      _tag: "token",
      network: "eip155:8453",
      address: "0x1111111111111111111111111111111111111111",
    },
    enrich: true,
    acceptedPrice: card.priceUsdMicros,
  };
  const response = await page.request.post("/api/watchlist/capture", {
    headers,
    data: input,
  });
  const saved = Schema.decodeUnknownSync(WatchlistCaptured)(
    await response.json()
  );
  const status = async () => {
    const detail = await page.request.get(
      `/api/watchlist/${saved.item.id}/details`,
      { headers }
    );
    return Schema.decodeUnknownSync(WatchlistDetails)(await detail.json()).data
      .enrichment;
  };
  await expect
    .poll(async () => {
      const intent = await status();
      return intent?.status;
    })
    .toBe("failed");
  const initial = await status();
  const repeated = await page.request.post("/api/watchlist/capture", {
    headers,
    data: input,
  });
  const again = Schema.decodeUnknownSync(WatchlistCaptured)(
    await repeated.json()
  );
  expect(again.item.id).toBe(saved.item.id);
  expect(again.data.enrichment).toEqual(initial);
  await page.reload();
  await expect(
    page.getByRole("link", { name: "Saved without credits" })
  ).toBeVisible();
});

test("check again repeats free discovery without a purchase", async ({
  page,
}) => {
  await page.goto("/watchlist");
  const input = page.getByRole("textbox", {
    name: "Address, link or token name",
  });
  await input.fill("0x1111111111111111111111111111111111111111");
  await input.press("Enter");
  const items = page.getByRole("region", { name: "Saved items" });
  await expect(items).toContainText("Not seen on any chain we checked");
  let purchases = 0;
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      request.url().endsWith("/api/services/run")
    ) {
      purchases += 1;
    }
  });
  const checked = page.waitForResponse(
    (response) =>
      response.url().endsWith("/discover") &&
      response.request().method() === "POST"
  );
  await items.getByRole("button", { name: "Check again" }).click();
  const response = await checked;
  expect(response.ok()).toBe(true);
  await expect(items).toContainText("Not seen on any chain we checked");
  expect(purchases).toBe(0);
});

test("chat address lookup offers one Track this action", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("textbox", { name: "Message" })
    .fill("0x1111111111111111111111111111111111111111");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  const log = page.getByRole("log");
  await expect(
    log.getByRole("button", { name: "Track this", exact: true })
  ).toHaveCount(1);
  await log.getByRole("button", { name: "Track this", exact: true }).click();
  await expect(log.getByRole("link", { name: "Tracked · Open" })).toBeVisible();
});
