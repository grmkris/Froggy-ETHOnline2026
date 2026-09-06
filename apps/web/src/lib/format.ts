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

/**
 * Where to look a transaction up, for the networks this wallet pays on.
 * Null for anything else: a wrong explorer is worse than none.
 */
export const explorerUrl = (
  network: string,
  transactionId: string
): string | null => {
  const id = encodeURIComponent(transactionId);
  switch (network) {
    case "hedera:testnet": {
      return `https://hashscan.io/testnet/transaction/${id}`;
    }
    case "eip155:84532": {
      return `https://sepolia.basescan.org/tx/${id}`;
    }
    case "eip155:8453": {
      return `https://basescan.org/tx/${id}`;
    }
    default: {
      return null;
    }
  }
};

const COMPACT_USD = new Intl.NumberFormat("en", {
  currency: "USD",
  maximumFractionDigits: 1,
  notation: "compact",
  style: "currency",
});

/** "$96M", "$1.2B", "$412K": a market's size at a glance. */
export const compactUsd = (usd: number): string => COMPACT_USD.format(usd);

/** The HCS note itself, on HashScan, by topic and sequence number. */
export const hcsMessageUrl = (topicId: string, sequence: number): string =>
  `https://hashscan.io/testnet/topic/${encodeURIComponent(topicId)}/message/${sequence}`;
