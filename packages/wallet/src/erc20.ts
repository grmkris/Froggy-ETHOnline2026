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
/** `balanceOf(address)`. */
const BALANCE_OF_SELECTOR = "0x70a08231";

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

/** Calldata for `balanceOf(address)`; the answer is one uint256 word. */
export const encodeBalanceOf = (address: string): string => {
  if (!isEvmAddress(address)) {
    throw new Error(`Not an EVM address: ${address}`);
  }
  return `${BALANCE_OF_SELECTOR}${address.slice(2).toLowerCase().padStart(64, "0")}`;
};

/** The uint256 an `eth_call` answered with, or null when the answer is not one word. */
export const decodeUint256 = (hex: string): bigint | null => {
  const body = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (body.length !== 64 || !/^[\da-f]+$/iu.test(body)) {
    return null;
  }
  return BigInt(`0x${body}`);
};
