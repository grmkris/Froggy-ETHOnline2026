/** Small formatters the cards share. Pure, so they are trivially testable. */

export const shortAddress = (address: string | null): string =>
  address === null || address.length < 12
    ? (address ?? "—")
    : `${address.slice(0, 6)}…${address.slice(-4)}`;

export const shortId = (id: string, keep = 10): string =>
  id.length <= keep + 2 ? id : `${id.slice(0, keep)}…`;

export const clockTime = (at: number): string =>
  new Date(at).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

/** The host of a URL, or the string itself when it is not one. */
export const hostOf = (url: string): string => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

/** Seconds left on a deadline, never negative. */
export const secondsLeft = (expiresAt: number, now = Date.now()): number =>
  Math.max(0, Math.ceil((expiresAt - now) / 1000));
