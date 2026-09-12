import { describe, expect, it } from "bun:test";

import { liveGoPlus, stubGoPlus } from "./goplus";

const ADDRESS = "0x1111111111111111111111111111111111111111";

describe("GoPlus screen", () => {
  it("reports not_indexed when the result omits the address", async () => {
    const fetchImpl: typeof fetch = Object.assign(
      () =>
        Promise.resolve(
          Response.json({
            code: 1,
            result: {},
          })
        ),
      { preconnect: (): void => undefined }
    );
    const fact = await liveGoPlus({
      baseUrl: "https://api.gopluslabs.io",
      outbound: { fetch: fetchImpl, allowPrivate: true },
    }).screen("eip155:4663", ADDRESS);
    expect(fact.status).toBe("not_indexed");
    expect(fact.isHoneypot).toBeNull();
  });

  it("reports observed flags for a full screen", async () => {
    const fetchImpl: typeof fetch = Object.assign(
      () =>
        Promise.resolve(
          Response.json({
            code: 1,
            result: {
              [ADDRESS.toLowerCase()]: {
                is_honeypot: "0",
                is_mintable: "0",
                is_proxy: "0",
                transfer_pausable: "0",
                is_blacklisted: "0",
                can_take_back_ownership: "0",
                owner_percent: "0",
              },
            },
          })
        ),
      { preconnect: (): void => undefined }
    );
    const fact = await liveGoPlus({
      baseUrl: "https://api.gopluslabs.io",
      outbound: { fetch: fetchImpl, allowPrivate: true },
    }).screen("eip155:8453", ADDRESS);
    expect(fact.status).toBe("observed");
    expect(fact.isHoneypot).toBe(false);
    expect(fact.isMintable).toBe(false);
  });

  it("reports unavailable on transport failure and on the stub", async () => {
    const fetchImpl: typeof fetch = Object.assign(
      () => Promise.reject(new Error("offline")),
      { preconnect: (): void => undefined }
    );
    const failed = await liveGoPlus({
      baseUrl: "https://api.gopluslabs.io",
      outbound: { fetch: fetchImpl, allowPrivate: true },
    }).screen("eip155:1", ADDRESS);
    expect(failed.status).toBe("unavailable");
    const stub = await stubGoPlus().screen("eip155:1", ADDRESS);
    expect(stub.status).toBe("unavailable");
    expect(stub.note).toContain("stub");
  });
});
