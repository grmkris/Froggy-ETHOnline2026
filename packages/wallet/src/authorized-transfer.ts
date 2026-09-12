/**
 * A USDC transfer the person authorizes and somebody else pays the gas for.
 *
 * The plain `transfer` in `transfer.ts` needs ETH in the person's wallet for
 * gas, and the whole funding story hands them USDC on Base and nothing else —
 * so their first conversion met `gas required exceeds allowance (0)` and no
 * receipt could tell them what to do about it. EIP-3009 is the way out that
 * x402 already uses on this chain: the person signs a
 * `TransferWithAuthorization` under their policy (typed data, the same rule
 * shape as a service payment), and a relayer that does hold ETH submits it
 * with `transferWithAuthorization`. The token checks the signature, so the
 * relayer can move the person's USDC only to the `to` they signed, in the
 * amount they signed, and nothing else.
 *
 * Two signatures, two leashes. The person's is judged by their Privy policy
 * (recipient pinned to the treasury, amount capped); the relayer's is judged
 * by the treasury policy (calldata decoded, the same recipient pinned, value
 * zero). Neither signer's refusal is softened: Privy's words reach the
 * receipt, prefixed with which of the two said no.
 *
 * The gas limit is fixed, as in `transfer.ts`, for the same reason: an
 * estimate would make Privy's decision depend on balances. Settling an
 * authorization costs roughly eighty thousand gas; a hundred and twenty
 * leaves room.
 */

import { keccak_256 } from "@noble/hashes/sha3";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";

import { isEvmAddress } from "./erc20";
import type { EvmRpc } from "./evm-rpc";
import { EvmRpcError } from "./evm-rpc";
import type { AgentEvmSigner, AgentTypedDataSigner } from "./evm-signer";
import { PrivySignerRefusedError } from "./evm-signer";
import type { Erc20TransferOutcome } from "./transfer";

/** The EIP-3009 authorization, in the shape the committed Privy rules decode. */
const TRANSFER_WITH_AUTHORIZATION_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

/**
 * `transferWithAuthorization(address,address,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32)`,
 * as the treasury policy decodes it: `transferWithAuthorization.to` is the
 * field its condition pins.
 */
export const TRANSFER_WITH_AUTHORIZATION_ABI = [
  {
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
      { name: "v", type: "uint8" },
      { name: "r", type: "bytes32" },
      { name: "s", type: "bytes32" },
    ],
    name: "transferWithAuthorization",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

/** The first four bytes of keccak256 of the signature above. */
export const TRANSFER_WITH_AUTHORIZATION_SELECTOR = "0xe3ee160e";
/** `name()` and `version()`: the EIP-712 domain, read from the token itself. */
const NAME_SELECTOR = "0x06fdde03";
const VERSION_SELECTOR = "0x54fd4d50";

const SETTLE_GAS_LIMIT = 120_000n;
/** A floor for the tip, in wei; some public nodes answer zero. */
const MIN_PRIORITY_FEE = 1_000_000n;
/** How long the signed authorization stays valid. Long enough to be mined, short enough to die if it is not. */
const AUTHORIZATION_TTL_SECONDS = 3600;

const word = (hex: string): string => hex.padStart(64, "0");

const HEX = /^[\da-f]+$/iu;

/**
 * One ABI-encoded `string` return value, or null when the answer is not one.
 * Offset word, length word, then the bytes padded to a word.
 */
export const decodeString = (hex: string): string | null => {
  const body = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (body.length < 128 || !HEX.test(body)) {
    return null;
  }
  const offset = Number.parseInt(body.slice(0, 64), 16) * 2;
  const length = Number.parseInt(body.slice(offset, offset + 64), 16) * 2;
  const start = offset + 64;
  if (Number.isNaN(length) || body.length < start + length) {
    return null;
  }
  return new TextDecoder().decode(
    hexToBytes(body.slice(start, start + length))
  );
};

export interface TokenDomain {
  readonly name: string;
  readonly version: string;
}

/**
 * The token's EIP-712 domain, asked of the token rather than remembered:
 * Base USDC calls itself "USD Coin" and Base Sepolia's calls itself "USDC",
 * and a domain guessed wrong produces a signature the token rejects after
 * the person has already signed it.
 */
export const readTokenDomain = async (
  rpc: EvmRpc,
  token: string
): Promise<TokenDomain> => {
  const [name, version] = await Promise.all([
    rpc.call(token, NAME_SELECTOR),
    rpc.call(token, VERSION_SELECTOR),
  ]);
  const decodedName = decodeString(name);
  const decodedVersion = decodeString(version);
  if (decodedName === null || decodedVersion === null) {
    throw new EvmRpcError(
      `${token} did not answer name() and version(); no EIP-712 domain to sign under`
    );
  }
  return { name: decodedName, version: decodedVersion };
};

export interface Authorization {
  readonly from: string;
  readonly to: string;
  readonly value: bigint;
  readonly validAfter: bigint;
  readonly validBefore: bigint;
  /** 32 random bytes as hex; the token remembers each one it has settled. */
  readonly nonce: string;
}

/** The calldata that settles a signed authorization. */
export const encodeTransferWithAuthorization = (
  authorization: Authorization,
  signature: string
): string => {
  const { from, to } = authorization;
  if (!(isEvmAddress(from) && isEvmAddress(to))) {
    throw new Error(`Not an EVM address: ${isEvmAddress(from) ? to : from}`);
  }
  const raw = signature.startsWith("0x") ? signature.slice(2) : signature;
  if (raw.length !== 130 || !HEX.test(raw)) {
    throw new Error("The authorization signature is not 65 bytes of hex.");
  }
  const r = raw.slice(0, 64);
  const s = raw.slice(64, 128);
  let v = Number.parseInt(raw.slice(128), 16);
  // Some signers answer with the recovery id (0/1) rather than 27/28; the
  // token takes only the latter.
  if (v < 27) {
    v += 27;
  }
  const nonce = authorization.nonce.startsWith("0x")
    ? authorization.nonce.slice(2)
    : authorization.nonce;
  if (nonce.length !== 64 || !HEX.test(nonce)) {
    throw new Error("The authorization nonce is not 32 bytes of hex.");
  }
  return [
    TRANSFER_WITH_AUTHORIZATION_SELECTOR,
    word(from.slice(2).toLowerCase()),
    word(to.slice(2).toLowerCase()),
    word(authorization.value.toString(16)),
    word(authorization.validAfter.toString(16)),
    word(authorization.validBefore.toString(16)),
    nonce.toLowerCase(),
    word(v.toString(16)),
    r.toLowerCase(),
    s.toLowerCase(),
  ].join("");
};

export interface AuthorizedTransferInput {
  /** In the token's smallest unit. */
  readonly amount: bigint;
  /** Persist the hash before any signed bytes leave the process. */
  readonly beforeBroadcast?: ((hash: string) => Promise<void>) | undefined;
  readonly chainId: number;
  /** The token's EIP-712 domain; read with `readTokenDomain` when not known. */
  readonly domain?: TokenDomain | undefined;
  /** The person's wallet, signing the authorization under their policy. */
  readonly from: AgentTypedDataSigner;
  /** Seconds since the epoch; injected so a test can pin the window. */
  readonly now?: (() => number) | undefined;
  /** Who pays the gas: signs the settlement under its own policy. */
  readonly relayer: Pick<AgentEvmSigner, "address" | "signTransaction">;
  readonly rpc: EvmRpc;
  readonly to: string;
  /** The token contract. */
  readonly token: string;
}

const randomNonce = (): string =>
  `0x${bytesToHex(crypto.getRandomValues(new Uint8Array(32)))}`;

const nowSeconds = (): number => Math.floor(Date.now() / 1000);

/**
 * Sign the authorization as the person, then settle it as the relayer.
 *
 * Nothing here is idempotent on its own: the caller's `beforeBroadcast`
 * persists the settlement hash so a retry reconciles rather than repeats, as
 * `conversion.ts` does for the plain transfer.
 */
export const sendAuthorizedTransfer = async (
  input: AuthorizedTransferInput
): Promise<Erc20TransferOutcome> => {
  const { from, relayer, rpc } = input;
  if (!isEvmAddress(input.to)) {
    throw new Error(`Not an EVM address: ${input.to}`);
  }
  if (input.amount < 0n) {
    throw new Error("A transfer amount cannot be negative.");
  }
  const domain = input.domain ?? (await readTokenDomain(rpc, input.token));
  const at = (input.now ?? nowSeconds)();
  const authorization: Authorization = {
    from: from.address,
    to: input.to,
    value: input.amount,
    validAfter: 0n,
    validBefore: BigInt(at + AUTHORIZATION_TTL_SECONDS),
    nonce: randomNonce(),
  };
  let signature: string;
  try {
    signature = await from.signTypedData({
      domain: {
        name: domain.name,
        version: domain.version,
        chainId: input.chainId,
        verifyingContract: input.token,
      },
      message: { ...authorization },
      primaryType: "TransferWithAuthorization",
      types: TRANSFER_WITH_AUTHORIZATION_TYPES,
    });
  } catch (error) {
    if (error instanceof PrivySignerRefusedError) {
      throw new PrivySignerRefusedError(
        `${error.message} If your rules predate the gas-free conversion, save them again in Settings so your policy allows it.`
      );
    }
    throw error;
  }
  const data = encodeTransferWithAuthorization(authorization, signature);
  const [nonce, gasPrice, tip] = await Promise.all([
    rpc.transactionCount(relayer.address),
    rpc.gasPrice(),
    rpc.maxPriorityFeePerGas().catch(() => MIN_PRIORITY_FEE),
  ]);
  const maxPriorityFeePerGas = tip > MIN_PRIORITY_FEE ? tip : MIN_PRIORITY_FEE;
  let signed: string;
  try {
    signed = await relayer.signTransaction({
      chainId: input.chainId,
      data,
      gasLimit: SETTLE_GAS_LIMIT,
      maxFeePerGas: gasPrice * 2n + maxPriorityFeePerGas,
      maxPriorityFeePerGas,
      nonce,
      to: input.token,
      value: 0n,
    });
  } catch (error) {
    if (error instanceof PrivySignerRefusedError) {
      throw new PrivySignerRefusedError(
        `The gas relayer ${relayer.address} could not sign the settlement: ${error.message}`
      );
    }
    throw error;
  }
  const expectedHash = `0x${bytesToHex(keccak_256(hexToBytes(signed.slice(2))))}`;
  await input.beforeBroadcast?.(expectedHash);
  let hash: string;
  try {
    hash = await rpc.sendRawTransaction(signed);
  } catch (error) {
    // The node refused the relayer's bytes: most often the relayer is out of
    // ETH, which is the operator's to fix, not the person's.
    if (error instanceof EvmRpcError) {
      throw new EvmRpcError(
        `the gas relayer ${relayer.address} could not broadcast the settlement: ${error.message}`,
        error.refused
      );
    }
    throw error;
  }
  const receipt = await rpc.waitForReceipt(hash);
  return { hash, status: receipt.status };
};
