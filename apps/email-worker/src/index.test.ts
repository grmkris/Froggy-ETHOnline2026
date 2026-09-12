import { afterAll, afterEach, expect, spyOn, test } from "bun:test";

import { gateway } from "./index";

const env = {
  EMAIL_WEBHOOK_SECRET: "test-webhook-secret",
  GATEWAY_URL: "https://froggy.example",
};
const fetchSpy = spyOn(globalThis, "fetch");
afterEach(() => {
  fetchSpy.mockReset();
});
afterAll(() => {
  fetchSpy.mockRestore();
});

test("queue callbacks use the redirect mode supported by Workers", async () => {
  fetchSpy.mockImplementation(
    Object.assign(
      async (...[, init]: Parameters<typeof fetch>) => {
        if (init?.redirect !== "manual") {
          throw new TypeError("Workers requires manual or follow redirects");
        }
        return await Promise.resolve(Response.json({ v: 1, accepted: true }));
      },
      {
        preconnect: () => {
          /* No network preconnect in this test. */
        },
      }
    )
  );
  const response = await gateway(env, "/webhooks/email/inbound", { v: 1 });
  expect(response.status).toBe(200);
  expect(fetchSpy).toHaveBeenCalledTimes(1);
});

test("queue callbacks reject redirects without forwarding email or credentials", async () => {
  fetchSpy.mockResolvedValue(
    new Response(null, {
      status: 302,
      headers: { location: "https://other.example" },
    })
  );
  let failure: Error | null = null;
  try {
    await gateway(env, "/webhooks/email/delivery", { v: 1 });
  } catch (error) {
    if (error instanceof Error) {
      failure = error;
    }
  }
  expect(failure?.message).toBe("Gateway HTTP 302");
  expect(fetchSpy).toHaveBeenCalledTimes(1);
  expect(fetchSpy.mock.calls[0]?.[1]?.redirect).toBe("manual");
});
