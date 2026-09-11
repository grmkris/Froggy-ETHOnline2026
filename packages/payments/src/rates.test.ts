/**
 * The rate that every cap is computed from.
 *
 * Until this existed the code valued one HBAR at one dollar — out by more than
 * a factor of ten against the network's own published rate — which made every
 * limit in the mandate a statement about the wrong quantity. These tests are
 * about the three ways that can go wrong again: a rate that is silently
 * absent, a rate that is silently old, and a rate that nobody re-read after
 * the network replaced it.
 */

import { describe, expect, it } from "bun:test";

import type { MirrorFetch } from "./mirror";
import { liveHbarRates } from "./rates";

const NOW = 1_788_620_460_000;
const HOUR_S = 3600;
/**
 * What rates.ts promises past the network's own expiry. Stated here rather
 * than imported so a change there is a change here.
 */
const GRACE_MS = 15 * 60 * 1000;

/** The mirror node's real shape, with today's real numbers. */
const body = (expiresAtSeconds: number, centEquivalent = 241_018) => ({
  current_rate: {
    cent_equivalent: centEquivalent,
    expiration_time: expiresAtSeconds,
    hbar_equivalent: 30_000,
  },
  next_rate: {
    cent_equivalent: 242_443,
    expiration_time: expiresAtSeconds + HOUR_S,
    hbar_equivalent: 30_000,
  },
});

/** A mirror node that answers however `respond` says. */
const answering =
  (respond: () => Response): MirrorFetch =>
  async () => {
    await Promise.resolve();
    return respond();
  };

const rates = (mirror: MirrorFetch) =>
  liveHbarRates({ fetch: mirror, mirrorNodeUrl: "https://mirror.example" });

describe("liveHbarRates", () => {
  it("has no rate before it has fetched one", () => {
    // Fails closed. A default here would be a cap that was never applied.
    expect(
      rates(answering(() => Response.json(body(NOW / 1000)))).current(NOW)
    ).toBeNull();
  });

  it("converts cents-per-N-hbar into usd micros per hbar", async () => {
    const source = rates(
      answering(() => Response.json(body(NOW / 1000 + HOUR_S)))
    );

    expect(await source.refresh()).toBe(true);
    // 241018 cents per 30000 HBAR is 8.0339 cents, or 80339 usd micros.
    expect(source.current(NOW)?.usdMicrosPerHbar).toBeCloseTo(80_339.33, 1);
  });

  it("refuses a rate the network has long since replaced", async () => {
    const source = rates(
      answering(() => Response.json(body(NOW / 1000 - HOUR_S)))
    );
    await source.refresh();

    // An hour past expiry is within the grace window; a day is not.
    expect(source.current(NOW + 24 * HOUR_S * 1000)).toBeNull();
  });

  it("keeps the last good rate when a refresh fails", async () => {
    let answer = () => Response.json(body(NOW / 1000 + HOUR_S));
    const source = rates(answering(() => answer()));
    await source.refresh();

    answer = () => new Response("nope", { status: 503 });

    // A blip should not stop payments. Ageing out should.
    expect(await source.refresh()).toBe(false);
    expect(source.current(NOW)).not.toBeNull();
  });

  it("refuses a body that does not carry a rate", async () => {
    const source = rates(
      answering(() =>
        Response.json({ current_rate: { cent_equivalent: "n/a" } })
      )
    );

    expect(await source.refresh()).toBe(false);
    expect(source.current(NOW)).toBeNull();
  });

  it("refuses a rate that would divide by zero", async () => {
    const source = rates(
      answering(() =>
        Response.json({
          current_rate: {
            cent_equivalent: 1,
            expiration_time: NOW / 1000 + HOUR_S,
            hbar_equivalent: 0,
          },
        })
      )
    );

    expect(await source.refresh()).toBe(false);
  });

  it("serves the replacement rate once a refresh has crossed the hour", async () => {
    // The network replaces its rate on the hour. A source that was read once
    // and never again holds the old one until the grace runs out, and then
    // refuses every spend — which is what production did until a redeploy.
    let answer = () => Response.json(body(NOW / 1000));
    const source = rates(answering(() => answer()));
    await source.refresh();

    expect(source.current(NOW + GRACE_MS)).not.toBeNull();
    expect(source.current(NOW + GRACE_MS + 1)).toBeNull();

    answer = () => Response.json(body(NOW / 1000 + HOUR_S, 250_000));

    expect(await source.refresh()).toBe(true);
    const replaced = source.current(NOW + GRACE_MS + 1);
    expect(replaced?.expiresAt).toBe(NOW / 1000 + HOUR_S);
    expect(replaced?.usdMicrosPerHbar).toBeCloseTo(83_333.33, 1);
  });

  it("fails closed once the grace has passed without a good refresh", async () => {
    let answer = () => Response.json(body(NOW / 1000));
    const source = rates(answering(() => answer()));
    await source.refresh();

    answer = () => new Response("nope", { status: 503 });

    // The blip keeps the rate to the end of the grace, and not a step past.
    expect(await source.refresh()).toBe(false);
    expect(source.current(NOW + GRACE_MS)).not.toBeNull();
    expect(source.current(NOW + GRACE_MS + 1)).toBeNull();
  });

  it("shares one request between overlapping refreshes", async () => {
    const gate = Promise.withResolvers<null>();
    let calls = 0;
    const source = rates(async () => {
      calls += 1;
      await gate.promise;
      return Response.json(body(NOW / 1000 + HOUR_S));
    });

    // Two ticks land while the mirror node is slow.
    const first = source.refresh();
    const second = source.refresh();
    gate.resolve(null);

    expect(await Promise.all([first, second])).toEqual([true, true]);
    expect(calls).toBe(1);

    // Once it has answered, the next ask is a new request.
    expect(await source.refresh()).toBe(true);
    expect(calls).toBe(2);
  });

  it("keeps the held rate when the mirror node times out", async () => {
    let answer = async (): Promise<Response> =>
      await Promise.resolve(Response.json(body(NOW / 1000 + HOUR_S)));
    const source = rates(async () => await answer());
    await source.refresh();

    // What `AbortSignal.timeout` throws when the deadline passes.
    answer = async () => {
      await Promise.resolve();
      throw new DOMException("", "TimeoutError");
    };

    expect(await source.refresh()).toBe(false);
    expect(source.current(NOW)).not.toBeNull();
  });
});
