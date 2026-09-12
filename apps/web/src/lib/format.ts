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
    case "hedera:mainnet": {
      return `https://hashscan.io/mainnet/transaction/${id}`;
    }
    case "eip155:84532": {
      return `https://sepolia.basescan.org/tx/${id}`;
    }
    case "eip155:8453": {
      return `https://basescan.org/tx/${id}`;
    }
    case "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp": {
      return `https://solscan.io/tx/${id}`;
    }
    case "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1": {
      return `https://solscan.io/tx/${id}?cluster=devnet`;
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

/** HashScan's path segment for a Hedera network; null when it is not Hedera. */
const hashscanNetwork = (network: string): "mainnet" | "testnet" | null => {
  if (network === "hedera:mainnet") {
    return "mainnet";
  }
  if (network === "hedera:testnet") {
    return "testnet";
  }
  return null;
};

/** A person's own Hedera account on HashScan. */
export const hederaAccountUrl = (
  accountId: string,
  network: string
): string | null => {
  const segment = hashscanNetwork(network);
  return segment === null
    ? null
    : `https://hashscan.io/${segment}/account/${encodeURIComponent(accountId)}`;
};

/** An EVM address on the explorer of its Base. */
export const evmAddressUrl = (address: string, network: string): string =>
  network === "eip155:8453"
    ? `https://basescan.org/address/${encodeURIComponent(address)}`
    : `https://sepolia.basescan.org/address/${encodeURIComponent(address)}`;

/** The HCS note itself, on HashScan, by topic and sequence number. */
export const hcsMessageUrl = (
  topicId: string,
  sequence: number,
  network = "hedera:testnet"
): string => {
  const segment = hashscanNetwork(network) ?? "testnet";
  return `https://hashscan.io/${segment}/topic/${encodeURIComponent(topicId)}/message/${sequence}`;
};
