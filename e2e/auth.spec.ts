/**
 * The open-box regression.
 *
 * The deployed instance was, for a while, drivable by anyone: every route and
 * both sockets answered a request with no credentials at all, because a
 * missing `Origin` header was treated as a trustworthy non-browser client.
 * `curl` could read the mandate, unfreeze the wallet, or type into the shared
 * Chrome.
 *
 * These are the assertions that make that a test failure rather than a thing
 * someone notices later. They are deliberately written from *outside* the app —
 * a raw request and a raw upgrade, no page, no token — because that is the
 * shape the attack actually had.
 */

import { expect, test } from "@playwright/test";

const PROTECTED = ["/api/wallet", "/api/receipts"] as const;

for (const path of PROTECTED) {
  test(`refuses ${path} without a token`, async ({ request }) => {
    const response = await request.get(path);
    expect(response.status()).toBe(401);
  });
}

test("refuses a chat turn without a token", async ({ request }) => {
  const response = await request.post("/api/chat", {
    data: { messages: [] },
  });
  expect(response.status()).toBe(401);
});

test("refuses to stop someone else's run without a token", async ({
  request,
}) => {
  const response = await request.post("/api/chat/stop");
  expect(response.status()).toBe(401);
});

test("answers the same route once a token is presented", async ({
  request,
}) => {
  // The counterweight to every refusal above. Without it, a route that was
  // simply broken would pass this whole file.
  const response = await request.get("/api/wallet", {
    headers: { authorization: "Bearer e2e-local-identity" },
  });
  expect(response.status()).toBe(200);
});

for (const socket of ["/ws/app", "/ws/browser"]) {
  test(`refuses the ${socket} upgrade without a token`, async ({ request }) => {
    // A real WebSocket client is not needed: the upgrade is an HTTP request,
    // and the server has to refuse it before any framing happens.
    const response = await request.fetch(socket, {
      headers: {
        connection: "Upgrade",
        origin: "http://127.0.0.1:3100",
        "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==",
        "sec-websocket-version": "13",
        upgrade: "websocket",
      },
      method: "GET",
    });
    expect(response.status()).toBe(401);
  });

  test(`refuses the ${socket} upgrade with no Origin`, async ({ request }) => {
    // The original hole. A script simply omits the header, so "absent means
    // not-a-browser means safe" had the threat model backwards.
    const response = await request.fetch(socket, {
      headers: {
        connection: "Upgrade",
        "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==",
        "sec-websocket-protocol": "froggy.v1, bearer.anything",
        "sec-websocket-version": "13",
        upgrade: "websocket",
      },
      method: "GET",
    });
    expect(response.status()).toBe(403);
  });
}
