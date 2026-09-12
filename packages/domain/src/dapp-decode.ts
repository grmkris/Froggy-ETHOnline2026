/**
 * What a dapp request would do, in words a person can judge.
 *
 * A page hands the wallet calldata, a byte string or an EIP-712 document. The
 * card cannot show any of those raw and call it consent, so this decodes the
 * handful of shapes that carry money — ERC-20 transfer and approve, Permit,
 * Permit2, `setApprovalForAll`, Sign-In with Ethereum — into plain lines, and
 * names the ones it will not sign at all.
 *
 * Two rules are enforced here rather than left to the card:
 *
 *   - **No unlimited allowance.** An approval for "all of it, forever" is the
 *     shape every drainer asks for, and no gift card needs it. It is refused,
 *     not warned about.
 *   - **A sign-in must name the site that asked.** A SIWE message whose domain
 *     is not the requesting origin is a phishing template, whatever it says.
 *
 * Everything else that cannot be decoded is shown as what it is — an opaque
 * call to a named contract — and left to the person. Pure, no I/O, no viem:
 * the domain package may use nothing but Effect, and the four ABI shapes below
 * are short enough to decode by hand.
 */

import { Result, Schema } from "effect";

import { formatAmount } from "./money";
import type {
  WalletMessagePayload,
  WalletTransactionPayload,
  WalletTypedDataPayload,
} from "./wallet-request";

/** The reading of one request. `refusals` non-empty means it must not be signed. */
export interface DappAssessment {
  /** One line for the card's headline: "Send 0.01 ETH", "Sign in to app.uniswap.org". */
  readonly title: string;
  /** What the person is agreeing to, one fact a line. */
  readonly lines: readonly string[];
  /** Things worth a second look that are still the person's call. */
  readonly warnings: readonly string[];
  /** Reasons the wallet refuses regardless of the person's answer. */
  readonly refusals: readonly string[];
}

interface Reading {
  title: string;
  readonly lines: string[];
  readonly warnings: string[];
  readonly refusals: string[];
}

interface Context {
  readonly account: string;
  readonly chainId: number;
}

/** Anything this large is "all of it": half the uint256 range, or Permit2's full width. */
const UNLIMITED = 2n ** 128n;
const MAX_UINT160 = 2n ** 160n - 1n;
const WORD = 64;
const WEI = 10n ** 18n;

const short = (address: string): string =>
  `${address.slice(0, 6)}…${address.slice(-4)}`;

const isUnlimited = (amount: bigint): boolean =>
  amount >= UNLIMITED || amount === MAX_UINT160;

const formatEther = (wei: bigint): string => {
  const whole = wei / WEI;
  const fraction = (wei % WEI).toString().padStart(18, "0").replace(/0+$/u, "");
  return fraction === "" ? `${whole} ETH` : `${whole}.${fraction} ETH`;
};

const tokenAmount = (units: bigint, token: string, chainId: number): string =>
  formatAmount(units.toString(), token, `eip155:${chainId}`);

const finish = (reading: Reading): DappAssessment => reading;

// ---------------------------------------------------------------------------
// eth_sendTransaction
// ---------------------------------------------------------------------------

/** The ABI words after the selector, read positionally. Null when a word is missing or malformed. */
class Calldata {
  private readonly hex: string;

  constructor(hex: string) {
    this.hex = hex;
  }

  get selector(): string {
    return this.hex.slice(0, 8);
  }

  get byteLength(): number {
    return this.hex.length / 2;
  }

  address(index: number): string | null {
    const chunk = this.word(index);
    if (chunk === null || !/^0{24}[0-9a-f]{40}$/u.test(chunk)) {
      return null;
    }
    return `0x${chunk.slice(24)}`;
  }

  uint(index: number): bigint | null {
    const chunk = this.word(index);
    return chunk === null ? null : BigInt(`0x${chunk}`);
  }

  private word(index: number): string | null {
    const start = 8 + index * WORD;
    const chunk = this.hex.slice(start, start + WORD);
    return chunk.length === WORD ? chunk : null;
  }
}

type CallReader = (
  data: Calldata,
  to: string,
  context: Context,
  reading: Reading
) => boolean;

const allowance = (
  reading: Reading,
  context: Context,
  parts: {
    readonly token: string;
    readonly spender: string;
    readonly amount: bigint;
    readonly via: string;
  }
): void => {
  const { amount, spender, token, via } = parts;
  if (isUnlimited(amount)) {
    reading.refusals.push(
      `The page asked for an unlimited ${via}allowance on ${short(token)} for ${spender}. Froggy signs exact amounts only.`
    );
    reading.title = `Unlimited ${via}allowance`;
    return;
  }
  const shown = tokenAmount(amount, token, context.chainId);
  reading.title = `Allow ${shown}`;
  reading.lines.push(
    `Let ${spender} spend up to ${shown} from your wallet${via === "" ? "" : ` through ${via.trim()}`}.`
  );
  reading.warnings.push(
    "An allowance lets that contract move the tokens later without asking again."
  );
};

const CALL_READERS: ReadonlyMap<string, CallReader> = new Map<
  string,
  CallReader
>([
  [
    // transfer(address,uint256)
    "a9059cbb",
    (data, to, context, reading) => {
      const recipient = data.address(0);
      const amount = data.uint(1);
      if (recipient === null || amount === null) {
        return false;
      }
      const shown = tokenAmount(amount, to, context.chainId);
      reading.title = `Send ${shown}`;
      reading.lines.push(`Send ${shown} to ${recipient}.`);
      return true;
    },
  ],
  [
    // transferFrom(address,address,uint256)
    "23b872dd",
    (data, to, context, reading) => {
      const owner = data.address(0);
      const recipient = data.address(1);
      const amount = data.uint(2);
      if (owner === null || recipient === null || amount === null) {
        return false;
      }
      const shown = tokenAmount(amount, to, context.chainId);
      reading.title = `Move ${shown}`;
      reading.lines.push(`Move ${shown} from ${owner} to ${recipient}.`);
      return true;
    },
  ],
  [
    // approve(address,uint256)
    "095ea7b3",
    (data, to, context, reading) => {
      const spender = data.address(0);
      const amount = data.uint(1);
      if (spender === null || amount === null) {
        return false;
      }
      allowance(reading, context, { amount, spender, token: to, via: "" });
      return true;
    },
  ],
  [
    // Permit2 approve(address token,address spender,uint160 amount,uint48 expiration)
    "87517c45",
    (data, _to, context, reading) => {
      const token = data.address(0);
      const spender = data.address(1);
      const amount = data.uint(2);
      if (token === null || spender === null || amount === null) {
        return false;
      }
      allowance(reading, context, { amount, spender, token, via: "Permit2 " });
      return true;
    },
  ],
  [
    // ERC-2612 permit(address owner,address spender,uint256 value,uint256 deadline,uint8 v,bytes32 r,bytes32 s)
    "d505accf",
    (data, to, context, reading) => {
      const spender = data.address(1);
      const amount = data.uint(2);
      if (spender === null || amount === null) {
        return false;
      }
      allowance(reading, context, {
        amount,
        spender,
        token: to,
        via: "permit ",
      });
      return true;
    },
  ],
  [
    // setApprovalForAll(address operator,bool approved)
    "a22cb465",
    (data, to, _context, reading) => {
      const operator = data.address(0);
      const approved = data.uint(1);
      if (operator === null || approved === null) {
        return false;
      }
      if (approved === 0n) {
        reading.title = "Revoke collection approval";
        reading.lines.push(`Stop ${operator} moving tokens from ${short(to)}.`);
      } else {
        reading.title = "Approve all tokens";
        reading.refusals.push(
          `The page asked to let ${operator} move every token in the collection ${short(to)}.`
        );
      }
      return true;
    },
  ],
]);

/**
 * Read one `eth_sendTransaction`.
 *
 * `from` must be the wallet's own address: a page asking us to sign for
 * someone else is confused or hostile, and either way the answer is no.
 */
export const assessTransaction = (
  payload: WalletTransactionPayload,
  context: Context
): DappAssessment => {
  const reading: Reading = { lines: [], refusals: [], title: "", warnings: [] };
  if (payload.from.toLowerCase() !== context.account.toLowerCase()) {
    reading.refusals.push(
      "The page asked to send from an address that is not yours."
    );
  }
  if (payload.to === null) {
    reading.title = "Deploy a contract";
    reading.refusals.push(
      "Deploying a contract from this wallet is not supported."
    );
    return finish(reading);
  }
  const to = payload.to.toLowerCase();
  const value = BigInt(payload.value);
  const data = new Calldata(payload.data.slice(2).toLowerCase());

  if (data.byteLength === 0) {
    reading.title = `Send ${formatEther(value)}`;
    reading.lines.push(`Send ${formatEther(value)} to ${to}.`);
    return finish(reading);
  }
  if (value > 0n) {
    reading.lines.push(`Attach ${formatEther(value)} to the call.`);
  }
  const reader = CALL_READERS.get(data.selector);
  if (reader?.(data, to, context, reading) === true) {
    return finish(reading);
  }
  reading.title = `Call ${short(to)}`;
  reading.lines.push(
    `Call contract ${to} with ${data.byteLength} bytes of data (selector 0x${data.selector}).`
  );
  reading.warnings.push(
    "Froggy cannot read what this call does. Only continue if the site told you."
  );
  return finish(reading);
};

// ---------------------------------------------------------------------------
// personal_sign
// ---------------------------------------------------------------------------

const decodeUtf8 = (hex: string): string | null => {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
};

const SIWE_HEADER =
  /^(?<domain>[^\n]+) wants you to sign in with your Ethereum account:\n(?<address>0x[0-9a-fA-F]{40})\n/u;

export interface SiweMessage {
  readonly domain: string;
  readonly address: string;
  readonly statement: string | null;
  readonly uri: string | null;
  readonly chainId: number | null;
  readonly nonce: string | null;
  readonly expirationTime: string | null;
}

/** Read an EIP-4361 message, or null when the text is not one. */
export const parseSiwe = (text: string): SiweMessage | null => {
  const header = SIWE_HEADER.exec(text);
  if (header?.groups === undefined) {
    return null;
  }
  const rest = text.slice(header[0].length);
  const field = (name: string): string | null => {
    const match = new RegExp(`^${name}: (?<value>[^\\n]*)$`, "mu").exec(rest);
    return match?.groups?.["value"] ?? null;
  };
  const chainId = field("Chain ID");
  const statementMatch = /^\n(?<statement>[^\n]+)\n\nURI:/u.exec(rest);
  return {
    address: header.groups["address"] ?? "",
    chainId:
      chainId !== null && /^\d+$/u.test(chainId) ? Number(chainId) : null,
    domain: header.groups["domain"] ?? "",
    expirationTime: field("Expiration Time"),
    nonce: field("Nonce"),
    statement: statementMatch?.groups?.["statement"] ?? null,
    uri: field("URI"),
  };
};

const hostOf = (origin: string): string | null => {
  try {
    return new URL(origin).host;
  } catch {
    return null;
  }
};

const readSiwe = (
  siwe: SiweMessage,
  context: Context & { readonly origin: string },
  reading: Reading
): void => {
  const host = hostOf(context.origin);
  reading.title = `Sign in to ${siwe.domain}`;
  reading.lines.push(`Prove you own ${short(siwe.address)} to ${siwe.domain}.`);
  if (siwe.statement !== null) {
    reading.lines.push(siwe.statement);
  }
  if (host === null || siwe.domain !== host) {
    reading.refusals.push(
      `The sign-in message names ${siwe.domain} but the page asking is ${host ?? context.origin}.`
    );
  }
  if (siwe.address.toLowerCase() !== context.account.toLowerCase()) {
    reading.refusals.push(
      "The sign-in message names an address that is not yours."
    );
  }
  if (siwe.chainId !== null && siwe.chainId !== context.chainId) {
    reading.warnings.push(
      `The sign-in is for chain ${siwe.chainId}, not the current one.`
    );
  }
};

/**
 * Read one `personal_sign`.
 *
 * Only the SIWE shape is understood. Any other text is shown verbatim (capped)
 * with a warning: a plain signature proves nothing on its own, but a message
 * that happens to be a hash is how some drainers get a Permit signed blind, so
 * bytes that are not text are refused.
 */
export const assessMessage = (
  payload: WalletMessagePayload,
  context: Context & { readonly origin: string }
): DappAssessment => {
  const reading: Reading = { lines: [], refusals: [], title: "", warnings: [] };
  if (payload.address.toLowerCase() !== context.account.toLowerCase()) {
    reading.refusals.push(
      "The page asked for a signature from an address that is not yours."
    );
  }
  const text = decodeUtf8(payload.message.slice(2));
  if (text === null) {
    reading.title = "Sign unreadable bytes";
    reading.refusals.push(
      "The page asked you to sign raw bytes that are not text. Froggy only signs messages a person can read."
    );
    return finish(reading);
  }
  const siwe = parseSiwe(text);
  if (siwe !== null) {
    readSiwe(siwe, context, reading);
    return finish(reading);
  }
  const shown = text.length > 600 ? `${text.slice(0, 600)}…` : text;
  reading.title = "Sign a message";
  reading.lines.push(`Sign this message: "${shown}"`);
  reading.warnings.push(
    "A signed message can be used by the site however it likes. Only sign text you understand."
  );
  return finish(reading);
};

// ---------------------------------------------------------------------------
// eth_signTypedData_v4
// ---------------------------------------------------------------------------

/** An EIP-712 integer as pages send them: a decimal or hex string, or a JSON number. */
const Uint = Schema.Union([
  Schema.String.check(Schema.isPattern(/^(?:0x[0-9a-fA-F]+|\d+)$/u)),
  Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
]);
const uint = (value: typeof Uint.Type): bigint => BigInt(String(value));

const TypedDataDomain = Schema.Struct({
  chainId: Schema.optional(Uint),
  name: Schema.optional(Schema.String),
  verifyingContract: Schema.optional(Schema.String),
});

/** The envelope of any EIP-712 document. `message` is read again per primary type. */
export const TypedDataDocument = Schema.Struct({
  domain: TypedDataDomain,
  message: Schema.Record(Schema.String, Schema.Unknown),
  primaryType: Schema.String,
  types: Schema.Record(Schema.String, Schema.Unknown),
});
export type TypedDataDocument = typeof TypedDataDocument.Type;

const decodeDocument = Schema.decodeUnknownResult(
  Schema.fromJsonString(TypedDataDocument)
);

/** Parse an EIP-712 document, or null when the JSON is not one. */
export const parseTypedData = (raw: string): TypedDataDocument | null => {
  const decoded = decodeDocument(raw);
  return Result.isSuccess(decoded) ? decoded.success : null;
};

const TokenAmount = Schema.Struct({ amount: Uint, token: Schema.String });
const PermitMessage = Schema.Struct({ spender: Schema.String, value: Uint });
const PermitSingleMessage = Schema.Struct({
  details: TokenAmount,
  spender: Schema.String,
});
const PermitBatchMessage = Schema.Struct({
  details: Schema.Array(TokenAmount).check(Schema.isMinLength(1)),
  spender: Schema.String,
});
const PermitTransferFromMessage = Schema.Struct({
  permitted: TokenAmount,
  spender: Schema.String,
});
const TransferWithAuthorizationMessage = Schema.Struct({
  to: Schema.String,
  value: Uint,
});

const isPermit = Schema.is(PermitMessage);
const isPermitSingle = Schema.is(PermitSingleMessage);
const isPermitBatch = Schema.is(PermitBatchMessage);
const isPermitTransferFrom = Schema.is(PermitTransferFromMessage);
const isTransferWithAuthorization = Schema.is(TransferWithAuthorizationMessage);

interface TypedContext extends Context {
  readonly contract: string | null;
}

const offchainAllowance = (
  reading: Reading,
  context: TypedContext,
  amount: bigint,
  token: string | null,
  spender: string
): void => {
  const tokenAddress = token ?? context.contract;
  if (isUnlimited(amount)) {
    reading.refusals.push(
      `The page asked for an unlimited permit${tokenAddress === null ? "" : ` on ${short(tokenAddress)}`} for ${spender}. Froggy signs exact amounts only.`
    );
    return;
  }
  const shown =
    tokenAddress === null
      ? `${amount} units`
      : tokenAmount(amount, tokenAddress, context.chainId);
  reading.lines.push(
    `Let ${spender} spend up to ${shown} from your wallet, off-chain.`
  );
};

type TypedReader = (
  message: TypedDataDocument["message"],
  context: TypedContext,
  reading: Reading
) => boolean;

const TYPED_READERS: ReadonlyMap<string, TypedReader> = new Map<
  string,
  TypedReader
>([
  [
    "Permit",
    (message, context, reading) => {
      if (!isPermit(message)) {
        return false;
      }
      reading.title = "Permit an allowance";
      offchainAllowance(
        reading,
        context,
        uint(message.value),
        null,
        message.spender
      );
      return true;
    },
  ],
  [
    "PermitSingle",
    (message, context, reading) => {
      if (!isPermitSingle(message)) {
        return false;
      }
      reading.title = "Permit2 allowance";
      offchainAllowance(
        reading,
        context,
        uint(message.details.amount),
        message.details.token,
        message.spender
      );
      return true;
    },
  ],
  [
    "PermitBatch",
    (message, context, reading) => {
      if (!isPermitBatch(message)) {
        return false;
      }
      reading.title = "Permit2 batch allowance";
      for (const entry of message.details) {
        offchainAllowance(
          reading,
          context,
          uint(entry.amount),
          entry.token,
          message.spender
        );
      }
      return true;
    },
  ],
  [
    "PermitTransferFrom",
    (message, context, reading) => {
      if (!isPermitTransferFrom(message)) {
        return false;
      }
      reading.title = "Permit2 transfer";
      reading.lines.push(
        `Let ${message.spender} take ${tokenAmount(uint(message.permitted.amount), message.permitted.token, context.chainId)} once, through Permit2.`
      );
      return true;
    },
  ],
  [
    "TransferWithAuthorization",
    (message, context, reading) => {
      if (!isTransferWithAuthorization(message) || context.contract === null) {
        return false;
      }
      reading.title = "Authorise a transfer";
      reading.lines.push(
        `Authorise ${tokenAmount(uint(message.value), context.contract, context.chainId)} to be pulled to ${message.to}.`
      );
      return true;
    },
  ],
]);

const shownValue = (value: TypedDataDocument["message"][string]): string => {
  const json = JSON.stringify(value) ?? "undefined";
  const bare = json.startsWith('"') ? json.slice(1, -1) : json;
  return bare.length > 120 ? `${bare.slice(0, 120)}…` : bare;
};

/**
 * Read one `eth_signTypedData_v4`.
 *
 * Recognised: ERC-2612 `Permit`, Permit2 `PermitSingle` / `PermitBatch` /
 * `PermitTransferFrom`, and USDC's `TransferWithAuthorization`. Anything else
 * is shown as its primary type and verifying contract.
 */
export const assessTypedData = (
  payload: WalletTypedDataPayload,
  context: Context
): DappAssessment => {
  const reading: Reading = { lines: [], refusals: [], title: "", warnings: [] };
  if (payload.address.toLowerCase() !== context.account.toLowerCase()) {
    reading.refusals.push(
      "The page asked for a signature from an address that is not yours."
    );
  }
  const document = parseTypedData(payload.typedData);
  if (document === null) {
    reading.title = "Sign invalid typed data";
    reading.refusals.push(
      "The page sent typed data that is not a valid EIP-712 document."
    );
    return finish(reading);
  }
  const chainId =
    document.domain.chainId === undefined
      ? null
      : Number(uint(document.domain.chainId));
  if (chainId !== null && chainId !== context.chainId) {
    reading.refusals.push(
      `The document is for chain ${chainId}; the wallet is on ${context.chainId}.`
    );
  }
  const contract = document.domain.verifyingContract?.toLowerCase() ?? null;
  const name = document.domain.name ?? "an unnamed contract";
  const where = contract === null ? name : `${name} (${short(contract)})`;
  const typed: TypedContext = { ...context, contract };

  const reader = TYPED_READERS.get(document.primaryType);
  if (reader?.(document.message, typed, reading) === true) {
    return finish(reading);
  }
  reading.title = `Sign ${document.primaryType}`;
  reading.lines.push(`Sign a "${document.primaryType}" document for ${where}.`);
  for (const [key, value] of Object.entries(document.message).slice(0, 8)) {
    reading.lines.push(`${key}: ${shownValue(value)}`);
  }
  reading.warnings.push(
    "Froggy cannot read what signing this authorises. Only continue if the site told you."
  );
  return finish(reading);
};
