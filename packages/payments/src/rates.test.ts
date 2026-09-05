/**
 * The rate that every cap is computed from.
 *
 * Until this existed the code valued one HBAR at one dollar — out by more than
 * a factor of ten against the network's own published rate — which made every
 * limit in the mandate a statement about the wrong quantity. These tests are
 * about the two ways that can go wrong again: a rate that is silently absent,
 * and a rate that is silently old.
 */

import { afterEach, describe, expect, it } from "bun:test";

import { liveHbarRates } from "./rates";

const NOW = 1_788_620_460_000;
const HOUR_S = 3600;

/** The mirror node's real shape, with today's real numbers. */
const body = (expiresAtSeconds: number) => ({
  current_rate: {
    cent_equivalent: 241_018,
    expiration_time: expiresAtSeconds,
    hbar_equivalent: 30_000,
  },
  next_rate: {
    cent_equivalent: 242_443,
    expiration_time: expiresAtSeconds + HOUR_S,
    hbar_equivalent: 30_000,
  },
});

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

const answering = (respond: () => Response): void => {
  const stub = async (
    _input: string | URL | Request,
    _init?: RequestInit
  ): Promise<Response> => await Promise.resolve(respond());
  // SAFETY: `liveHbarRates` calls `fetch(url)` and nothing else, so this stub
  // covers its whole use of the API; the assertion narrows to that one shape.
  globalThis.fetch = stub as typeof globalThis.fetch;
};

const rates = () => liveHbarRates({ mirrorNodeUrl: "https://mirror.example" });

describe("liveHbarRates", () => {
  it("has no rate before it has fetched one", () => {
    // Fails closed. A default here would be a cap that was never applied.
    expect(rates().current(NOW)).toBeNull();
  });

  it("converts cents-per-N-hbar into usd micros per hbar", async () => {
    answering(() => Response.json(body(NOW / 1000 + HOUR_S)));
    const source = rates();

    expect(await source.refresh()).toBe(true);
    // 241018 cents per 30000 HBAR is 8.0339 cents, or 80339 usd micros.
    expect(source.current(NOW)?.usdMicrosPerHbar).toBeCloseTo(80_339.33, 1);
  });

  it("refuses a rate the network has long since replaced", async () => {
    answering(() => Response.json(body(NOW / 1000 - HOUR_S)));
    const source = rates();
    await source.refresh();

    // An hour past expiry is within the grace window; a day is not.
    expect(source.current(NOW + 24 * HOUR_S * 1000)).toBeNull();
  });

  it("keeps the last good rate when a refresh fails", async () => {
    answering(() => Response.json(body(NOW / 1000 + HOUR_S)));
    const source = rates();
    await source.refresh();

    answering(() => new Response("nope", { status: 503 }));

    // A blip should not stop payments. Ageing out should.
    expect(await source.refresh()).toBe(false);
    expect(source.current(NOW)).not.toBeNull();
  });

  it("refuses a body that does not carry a rate", async () => {
    answering(() =>
      Response.json({ current_rate: { cent_equivalent: "n/a" } })
    );
    const source = rates();

    expect(await source.refresh()).toBe(false);
    expect(source.current(NOW)).toBeNull();
  });

  it("refuses a rate that would divide by zero", async () => {
    answering(() =>
      Response.json({
        current_rate: {
          cent_equivalent: 1,
          expiration_time: NOW / 1000 + HOUR_S,
          hbar_equivalent: 0,
        },
      })
    );
    const source = rates();

    expect(await source.refresh()).toBe(false);
  });
});
