/** A chain by the name a person uses. */

const NETWORK_WORDS: ReadonlyMap<string, string> = new Map([
  ["eip155:1", "Ethereum"],
  ["eip155:4663", "Robinhood"],
  ["eip155:11155111", "Sepolia"],
  ["solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp", "Solana"],
  ["solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1", "Solana devnet"],
  ["eip155:8453", "Base"],
  ["eip155:84532", "Base Sepolia"],
  ["hedera:mainnet", "Hedera"],
  ["hedera:testnet", "Hedera testnet"],
]);

/** A chain by the name a person uses, or its id when we have no name. */
export const networkWords = (network: string): string =>
  NETWORK_WORDS.get(network) ?? network;
