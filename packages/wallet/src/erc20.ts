/**
 * ERC-20 `transfer(address,uint256)`, encoded by hand.
 *
 * Sixty-eight bytes of ABI is not worth a dependency, and this is the one
 * place the calldata shape is decided. The committed Privy policy decodes
 * the same calldata with `ERC20_TRANSFER_ABI` below — `transfer.to` and
 * `transfer.amount` are the field names its conditions reference — so the
 * encoder and the policy cannot drift apart without this file changing.
 */

export const ERC20_TRANSFER_ABI = [
  {
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    name: "transfer",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

/** The first four bytes of keccak256("transfer(address,uint256)"). */
export const TRANSFER_SELECTOR = "0xa9059cbb";

const ADDRESS = /^0x[\da-f]{40}$/iu;

export const isEvmAddress = (value: string): boolean => ADDRESS.test(value);

/** One 32-byte ABI word, from hex without a prefix. */
const word = (hex: string): string => hex.padStart(64, "0");

export const encodeTransfer = (to: string, amount: bigint): string => {
  if (!isEvmAddress(to)) {
    throw new Error(`Not an EVM address: ${to}`);
  }
  if (amount < 0n) {
    throw new Error("A transfer amount cannot be negative.");
  }
  return `${TRANSFER_SELECTOR}${word(to.slice(2).toLowerCase())}${word(amount.toString(16))}`;
};
