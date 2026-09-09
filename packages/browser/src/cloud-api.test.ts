import { describe, expect, it } from "bun:test";

import { CloudApiError, cloudApi } from "./cloud-api";

const PROFILE = "6f19ba70-e37c-4c63-913c-62bbc94f1740";
const OTHER = "ad041f9b-4102-4909-b3b9-65114f43f73c";
const browser = {
  id: PROFILE,
  status: "active",
  cdpUrl: "wss://connect.browser-use.com/cdp?secret=private",
  liveUrl: "https://live.browser-use.com/watch?secret=private",
  timeoutAt: "2026-09-10T10:00:00Z",
};

const fixture = (responses: Response[]) => {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const api = cloudApi({
    apiKey: "private-api-key",
    country: "us",
    fetch: Object.assign(
      async (input: string | URL | Request, init?: RequestInit) => {
        calls.push({
          url: input instanceof Request ? input.url : String(input),
          init,
        });
        const response = responses.shift();
        if (!response) {
          throw new Error("Unexpected provider request");
        }
        return await Promise.resolve(response);
      },
      { preconnect: fetch.preconnect }
    ),
  });
  return { api, calls };
};

describe("Cloud provider boundary", () => {
  it("matches the complete user key instead of taking a search neighbour", async () => {
    const { api, calls } = fixture([
      Response.json({
        items: [
          { id: OTHER, userId: "person-12" },
          { id: PROFILE, userId: "person-1" },
        ],
      }),
    ]);
    expect(await api.profile("person-1")).toBe(PROFILE);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.init?.redirect).toBe("error");
  });

  it("creates a separate profile when only a partial match exists", async () => {
    const { api, calls } = fixture([
      Response.json({ items: [{ id: OTHER, userId: "person-12" }] }),
      Response.json({ id: PROFILE, userId: "person-1" }),
    ]);
    expect(await api.profile("person-1")).toBe(PROFILE);
    expect(calls[1]?.init?.method).toBe("POST");
    expect(calls[1]?.init?.body).toBe(
      JSON.stringify({ name: "person-1", userId: "person-1" })
    );
  });

  it("rejects viewer and CDP credentials pointing outside the provider", async () => {
    await Promise.all(
      [
        {
          ...browser,
          liveUrl: "https://live.browser-use.com.evil.example/private",
        },
        { ...browser, cdpUrl: "ws://connect.browser-use.com/private" },
        { ...browser, cdpUrl: "wss://evil.example/private" },
        { ...browser, timeoutAt: "not-a-date" },
      ].map(async (metadata) => {
        const { api } = fixture([Response.json(metadata)]);
        const failure = await api.get(PROFILE).catch((error: unknown) => error);
        expect(failure).toBeInstanceOf(CloudApiError);
      })
    );
  });

  it("caps provider output and never includes secret response bodies in errors", async () => {
    await Promise.all(
      [
        new Response("private-secret", { status: 403 }),
        new Response(`"${"private-secret".repeat(30_000)}"`),
        Response.json({ secret: "private-secret" }),
      ].map(async (response) => {
        const { api } = fixture([response]);
        let message = "";
        try {
          await api.get(PROFILE);
        } catch (error) {
          message = String(error);
        }
        expect(message).toContain("Browser Use");
        expect(message).not.toContain("private-secret");
      })
    );
  });

  it("stops the exact browser and accepts an empty delete acknowledgement", async () => {
    const { api, calls } = fixture([
      Response.json({}),
      new Response(null, { status: 204 }),
    ]);
    await api.stop(PROFILE);
    await api.deleteProfile(PROFILE);
    expect(calls[0]?.url).toEndWith(`/browsers/${PROFILE}`);
    expect(calls[0]?.init?.method).toBe("PATCH");
    expect(calls[0]?.init?.body).toBe('{"action":"stop"}');
    expect(calls[1]?.init?.method).toBe("DELETE");
  });
});
