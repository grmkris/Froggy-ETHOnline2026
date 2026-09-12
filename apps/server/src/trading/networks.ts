/**
 * Network identifiers this folder names, and nothing else.
 *
 * A leaf on purpose: `pons.ts` imports `evm-chain.ts`, so the Robinhood
 * identifier cannot live in either file without a cycle. Nothing here may
 * import.
 */

export const PONS_NETWORK = "eip155:4663";
export const SOLANA_MAINNET = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";

/**
 * The CAIP-2 `eip155:` suffix as a chain id, or null when it is not one.
 *
 * `Number(network.slice(7))` is not a parse: a Solana id, a truncated
 * string, or a value past `MAX_SAFE_INTEGER` all become a number, and only
 * the `eip155:` prefix plus `isSafeInteger` keep that number a chain id.
 */
export const chainIdOf = (network: string): number | null => {
  if (!network.startsWith("eip155:")) {
    return null;
  }
  const chainId = Number(network.slice(7));
  return Number.isSafeInteger(chainId) ? chainId : null;
};
