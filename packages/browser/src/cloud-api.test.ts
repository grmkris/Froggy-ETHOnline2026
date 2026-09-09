import { describe, expect, it } from "bun:test";

import { CloudApiError, cloudApi } from "./cloud-api";

const PROFILE = "6f19ba70-e37c-4c63-913c-62bbc94f1740";
const OTHER = "ad041f9b-4102-4909-b3b9-65114f43f73c";
const CDP_HOST = `${PROFILE}.cdp.browser-use.com`;
/**
 * The provider's real shapes, recorded from a live browser on 9 Sep 2026.
 *
 * `cdpUrl` is `https:`, not a WebSocket URL, and the viewer URL carries it as a
 * query parameter. An earlier fixture invented a `wss://connect.browser-use.com`
 * form; every real browser was rejected as an invalid CDP origin and no local
 * test could see it, which is the reason this comment exists.
 */
const browser = {
  id: PROFILE,
  status: "active",
  cdpUrl: `https://${CDP_HOST}`,
  liveUrl: `https://live.browser-use.com?wss=https%3A%2F%2F${CDP_HOST}`,
  timeoutAt: "2026-09-10T10:00:00Z",
  browserCost: "0.0016",
  proxyCost: "0",
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

describe("Browser Use provider boundary", () => {
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
    expect(calls[0]?.url).toStartWith(
      "https://api.browser-use.com/api/v3/profiles"
    );
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

  it("accepts the provider's own browser metadata", async () => {
    const { api } = fixture([Response.json(browser)]);
    const info = await api.get(PROFILE);
    expect(info.cdpUrl).toBe(`https://${CDP_HOST}`);
    expect(info.browserCost).toBe("0.0016");
  });

  it("rejects viewer and CDP credentials pointing outside the provider", async () => {
    await Promise.all(
      [
        {
          ...browser,
          liveUrl: "https://live.browser-use.com.evil.example/private",
        },
        { ...browser, cdpUrl: "http://evil.example/private" },
        { ...browser, cdpUrl: `https://${PROFILE}.cdp.evil.example` },
        { ...browser, timeoutAt: "not-a-date" },
      ].map(async (metadata) => {
        const { api } = fixture([Response.json(metadata)]);
        const failure = await api.get(PROFILE).catch((error: unknown) => error);
        expect(failure).toBeInstanceOf(CloudApiError);
      })
    );
  });

  it("resolves the DevTools socket without sending the API key to the browser host", async () => {
    const { api, calls } = fixture([
      Response.json({
        webSocketDebuggerUrl: `wss://${CDP_HOST}/devtools/browser/5232ee4e`,
      }),
    ]);
    expect(await api.socket(`https://${CDP_HOST}`)).toBe(
      `wss://${CDP_HOST}/devtools/browser/5232ee4e`
    );
    expect(calls[0]?.url).toBe(`https://${CDP_HOST}/json/version`);
    expect(calls[0]?.init?.headers).toBeUndefined();
  });

  it("refuses a DevTools socket that leaves the browser's own host or drops TLS", async () => {
    await Promise.all(
      [
        `ws://${CDP_HOST}/devtools/browser/5232ee4e`,
        "wss://evil.example/devtools/browser/5232ee4e",
      ].map(async (webSocketDebuggerUrl) => {
        const { api } = fixture([Response.json({ webSocketDebuggerUrl })]);
        const failure = await api
          .socket(`https://${CDP_HOST}`)
          .catch((error: unknown) => error);
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

  it("stops the exact browser, keeps its final cost, and accepts an empty delete acknowledgement", async () => {
    const { api, calls } = fixture([
      Response.json({ ...browser, status: "stopped", browserCost: "0.0033" }),
      new Response(null, { status: 204 }),
    ]);
    const stopped = await api.stop(PROFILE);
    expect(stopped?.browserCost).toBe("0.0033");
    await api.deleteProfile(PROFILE);
    expect(calls[0]?.url).toEndWith(`/browsers/${PROFILE}`);
    expect(calls[0]?.init?.method).toBe("PATCH");
    expect(calls[0]?.init?.body).toBe('{"action":"stop"}');
    expect(calls[1]?.init?.method).toBe("DELETE");
  });

  it("survives a stop reply that carries no browser record", async () => {
    const { api } = fixture([Response.json({})]);
    expect(await api.stop(PROFILE)).toBeNull();
  });
});
