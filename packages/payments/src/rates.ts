/**
 * What an HBAR is worth, from Hedera itself.
 *
 * Until now the code valued one HBAR at one dollar. That is not a rounding
 * error, it is off by more than a factor of ten — the network's own published
 * rate today is about eight cents — and it makes every cap in the mandate a
 * statement about the wrong quantity. A "$2 per transaction" limit priced this
 * way is really a 2 HBAR limit, which is roughly sixteen cents. On testnet
 * that is merely wrong. On mainnet it is a cap that does not mean what the
 * person setting it thought it meant, in either direction.
 *
 * The rate comes from the mirror node's `/network/exchangerate`, which is the
 * same rate consensus nodes charge fees at — not a market feed, and
 * deliberately so: the question here is "what does the network say this is
 * worth", and using a third-party price would introduce a second answer.
 *
 * It **fails closed**. An unknown rate is not an excuse to fall back to a
 * guess; a spend priced against a guess is a cap that was never applied. The
 * quote is null, and the session refuses.
 *
 * And it has to be **re-read**. The network replaces its rate on the hour, so
 * a source that was read once at boot held a rate that aged out at the next
 * boundary and refused every HBAR spend from then until a redeploy. The
 * server drives `refresh` on its clock; this module makes that safe to do.
 */

import { Result, Schema } from "effect";

import type { MirrorFetch } from "./mirror";

/**
 * The mirror node's shape: cents per `hbar_equivalent` HBAR.
 *
 * Decoded rather than read: this is the number every cap is computed from, and
 * a body that has drifted must fail here rather than produce a rate of `NaN`
 * that silently prices everything at zero.
 */
const Rate = Schema.Struct({
  cent_equivalent: Schema.Finite,
  expiration_time: Schema.Finite,
  hbar_equivalent: Schema.Finite,
});

const ExchangeRateResponse = Schema.Struct({ current_rate: Rate });
const decodeExchangeRate = Schema.decodeUnknownResult(ExchangeRateResponse);

const MICROS_PER_CENT = 10_000;
const MS_PER_SECOND = 1000;

/**
 * How long a fetched rate is trusted past its own expiry.
 *
 * The network publishes a new rate roughly hourly and stamps each one with an
 * expiry. A little grace stops a single slow refresh from halting payments;
 * much more than this and we would be pricing mainnet money against a rate the
 * network has already replaced.
 */
const GRACE_MS = 15 * 60 * 1000;

/**
 * How long one read may take. The refresh runs on a clock and overlapping
 * runs share a request, so a mirror node that hangs rather than fails would
 * otherwise pin every later refresh to it while the held rate aged out with
 * nothing able to replace it.
 */
const FETCH_TIMEOUT_MS = 8000;

export interface HbarRate {
  /** Unix seconds. After this plus the grace, the rate is refused. */
  readonly expiresAt: number;
  readonly usdMicrosPerHbar: number;
}

export interface RateSource {
  /** The current rate, or null when there isn't a usable one. */
  readonly current: (now: number) => HbarRate | null;
  readonly mode: "live" | "stub";
  /** Fetch a fresh rate. Returns false when it could not, keeping whatever it held. */
  readonly refresh: () => Promise<boolean>;
}

export interface LiveRateOptions {
  /** The mirror node's shape of `fetch`, so a test can hand in a plain function. */
  readonly fetch?: MirrorFetch;
  readonly mirrorNodeUrl: string;
}

export const liveHbarRates = (options: LiveRateOptions): RateSource => {
  const fetchImpl: MirrorFetch = options.fetch ?? fetch;
  let rate: HbarRate | null = null;
  let inFlight: Promise<boolean> | null = null;

  const read = async (): Promise<boolean> => {
    try {
      const response = await fetchImpl(
        `${options.mirrorNodeUrl}/api/v1/network/exchangerate`,
        { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }
      );
      if (!response.ok) {
        return false;
      }
      const decoded = decodeExchangeRate(await response.json());
      if (Result.isFailure(decoded)) {
        return false;
      }
      const { current_rate: fetched } = decoded.success;
      if (fetched.hbar_equivalent === 0) {
        return false;
      }
      rate = {
        expiresAt: fetched.expiration_time,
        usdMicrosPerHbar:
          (fetched.cent_equivalent * MICROS_PER_CENT) / fetched.hbar_equivalent,
      };
      return true;
    } catch {
      // A network blip keeps the previous rate until it ages out, which is
      // the right trade: an hour-old rate is far better than no payments,
      // and a day-old one is refused by `current`.
      return false;
    }
  };

  const run = async (): Promise<boolean> => {
    try {
      return await read();
    } finally {
      inFlight = null;
    }
  };

  return {
    current: (now) => {
      if (rate === null) {
        return null;
      }
      return now > rate.expiresAt * MS_PER_SECOND + GRACE_MS ? null : rate;
    },

    mode: "live",

    // Driven on the server's clock, so two ticks that land while the mirror
    // node is slow share one request rather than each opening their own.
    refresh: async () => {
      inFlight ??= run();
      return await inFlight;
    },
  };
};

/**
 * The stub.
 *
 * Returns a fixed, obviously-round rate and says it never expires — and
 * because every receipt carries the quote's `source`, a spend priced by this
 * is greppable rather than indistinguishable from a real one.
 */
export const STUB_USD_MICROS_PER_HBAR = 80_000;

export const stubHbarRates = (): RateSource => ({
  current: () => ({
    expiresAt: Number.MAX_SAFE_INTEGER,
    usdMicrosPerHbar: STUB_USD_MICROS_PER_HBAR,
  }),
  mode: "stub",
  refresh: async () => await Promise.resolve(true),
});
