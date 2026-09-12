/**
 * A dapp's request of the wallet Froggy injects into the shared Chrome.
 *
 * A page that finds a wallet asks it for an address, a signature or a
 * transaction. Everything the page supplies is `page` provenance — the same
 * untrusted content a prompt-injected model would read — so no request runs on
 * the page's word. What lifts one request is the person's answer to the exact
 * card built from it, bound to a fingerprint of the exact payload, and the
 * signature is produced under a Privy rule pinned to that same payload.
 *
 * This is a record, not a payment: a dapp transaction moves arbitrary tokens
 * that the USD ledger cannot price, and a signature moves nothing directly. It
 * therefore has its own status machine (`advanceWalletRequest`) rather than
 * borrowing a purchase's or a trade's, and it reuses everything around it —
 * approvals, receipts, the provenance rule and the store.
 *
 * Nothing here knows about CDP, sockets or Privy. `packages/domain` is a leaf.
 */

import { Schema } from "effect";

import { EvmAddress } from "./address";
import {
  ApprovalId,
  ReceiptId,
  RunId,
  TabId,
  WalletConnectionId,
  WalletRequestId,
} from "./id";
import { UserId } from "./identity";

/** The most a page may hand us as parameters, and the most we hand back. */
export const WALLET_REQUEST_PARAMS_LIMIT = 16 * 1024;
export const WALLET_REQUEST_RESULT_LIMIT = 16 * 1024;
/** A card about a dapp request waits this long for the person. */
export const WALLET_REQUEST_TTL_MS = 5 * 60 * 1000;
/** A one-shot Privy rule minted for one approval lives this long. */
export const WALLET_RULE_TTL_MS = 10 * 60 * 1000;

const Origin = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(2048)
);
const HexBytes = Schema.String.check(
  Schema.isPattern(/^0x(?:[0-9a-fA-F]{2})*$/u, {
    message: "Expected 0x-prefixed hexadecimal bytes",
  }),
  Schema.isMaxLength(WALLET_REQUEST_PARAMS_LIMIT)
);
const HexQuantity = Schema.String.check(
  Schema.isPattern(/^0x[0-9a-fA-F]{1,64}$/u, {
    message: "Expected a 0x-prefixed hexadecimal quantity",
  })
);

export const WalletRequestKind = Schema.Literals([
  /** `eth_requestAccounts` / `wallet_requestPermissions`: may this origin see the address? */
  "connect",
  /** `eth_sendTransaction`: sign and broadcast one transaction. */
  "send_transaction",
  /** `personal_sign`: sign one EIP-191 message. */
  "personal_sign",
  /** `eth_signTypedData_v4`: sign one EIP-712 document. */
  "sign_typed_data_v4",
]);
export type WalletRequestKind = typeof WalletRequestKind.Type;

/**
 * The exact thing the page asked for. Gas fields are deliberately absent: the
 * server re-estimates them and assigns the nonce, so a page cannot pick either.
 */
export const WalletTransactionPayload = Schema.Struct({
  kind: Schema.Literal("send_transaction"),
  from: EvmAddress,
  /** Null is contract creation, which the wallet refuses. */
  to: Schema.NullOr(EvmAddress),
  value: HexQuantity,
  data: HexBytes,
});
export type WalletTransactionPayload = typeof WalletTransactionPayload.Type;
export const WalletMessagePayload = Schema.Struct({
  kind: Schema.Literal("personal_sign"),
  address: EvmAddress,
  /** The message as bytes, as EIP-191 signs it. Decoded for display, never trusted. */
  message: HexBytes,
});
export type WalletMessagePayload = typeof WalletMessagePayload.Type;
export const WalletTypedDataPayload = Schema.Struct({
  kind: Schema.Literal("sign_typed_data_v4"),
  address: EvmAddress,
  /** The EIP-712 document as the page serialised it. Parsed for display and for the rule. */
  typedData: Schema.String.check(
    Schema.isMinLength(2),
    Schema.isMaxLength(WALLET_REQUEST_PARAMS_LIMIT)
  ),
});
export type WalletTypedDataPayload = typeof WalletTypedDataPayload.Type;
export const WalletConnectPayload = Schema.Struct({
  kind: Schema.Literal("connect"),
});
export type WalletConnectPayload = typeof WalletConnectPayload.Type;
export const WalletRequestPayload = Schema.Union([
  WalletConnectPayload,
  WalletTransactionPayload,
  WalletMessagePayload,
  WalletTypedDataPayload,
]);
export type WalletRequestPayload = typeof WalletRequestPayload.Type;

export const WalletRequestStatus = Schema.Literals([
  /** Received; not yet judged. */
  "pending",
  /** A card is in front of the person. */
  "awaiting_approval",
  /** The person said yes, or a standing connection covered it. Nothing signed yet. */
  "approved",
  /** A signature exists. For a transaction its hash is known before broadcast. */
  "signed",
  /** Handed to the network. Absence of a receipt is not evidence of failure. */
  "sent",
  /** Delivered to the page (signature, connection) or mined (transaction). */
  "confirmed",
  /** Proven not to have happened: refused by the signer, rejected by the node, reverted. */
  "failed",
  /** Refused by a rule before anyone was asked. */
  "refused",
  /** The person said no. */
  "declined",
  /** Nobody answered in time. */
  "expired",
  /** Withdrawn: the tab closed, the run was stopped, the connection was revoked. */
  "cancelled",
  /** Sent, and the network has not yet said which way. Terminal until reconciled. */
  "uncertain",
]);
export type WalletRequestStatus = typeof WalletRequestStatus.Type;

/**
 * Whether the page ever heard the outcome. Separate from `status` on purpose:
 * a transaction that was broadcast is broadcast whether or not the document
 * that asked for it still exists to receive the hash.
 */
export const WalletRequestDelivery = Schema.Literals([
  "pending",
  "delivered",
  "undeliverable",
]);
export type WalletRequestDelivery = typeof WalletRequestDelivery.Type;

/** Who held the shared Chrome when the page asked. Shown on the card; never trusted for authority. */
export const WalletRequestInitiator = Schema.Literals([
  "agent",
  "human",
  "idle",
]);
export type WalletRequestInitiator = typeof WalletRequestInitiator.Type;

export const WalletRequest = Schema.Struct({
  id: WalletRequestId,
  createdAt: Schema.Int,
  updatedAt: Schema.Int,
  userId: UserId,
  /** The tab and the exact execution context that asked, as the CDP session saw them. */
  tabId: TabId,
  contextId: Schema.String.check(Schema.isMaxLength(128)),
  /** The page's own id for the request; replies are matched on it, never trusted for identity. */
  pageRequestId: Schema.String.check(Schema.isMaxLength(128)),
  origin: Origin,
  /** The top document's origin. Equal to `origin` for a top-frame request. */
  topOrigin: Origin,
  chainId: Schema.Int,
  kind: WalletRequestKind,
  payload: WalletRequestPayload,
  /** sha-256 of `canonicalWalletRequest`; the approval, the rule and the signer all bind to it. */
  fingerprint: Schema.String,
  initiatedDuring: WalletRequestInitiator,
  runId: Schema.NullOr(RunId),
  status: WalletRequestStatus,
  delivery: WalletRequestDelivery,
  approvalId: Schema.NullOr(ApprovalId),
  /** Assigned by the server at approval, never by the page. */
  nonce: Schema.NullOr(Schema.Int),
  /** The signature or the raw signed transaction is never stored; its hash is. */
  signedHash: Schema.NullOr(Schema.String),
  transactionHash: Schema.NullOr(Schema.String),
  /** Human-readable lines the card showed, so the receipt can repeat them. */
  summary: Schema.Array(Schema.String.check(Schema.isMaxLength(300))).check(
    Schema.isMaxLength(12)
  ),
  receiptId: Schema.NullOr(ReceiptId),
  error: Schema.NullOr(Schema.String.check(Schema.isMaxLength(1500))),
  expiresAt: Schema.Int,
  stubbed: Schema.Boolean,
});
export type WalletRequest = typeof WalletRequest.Type;

/** A person's permission for one origin to learn their address. Revocable as a unit. */
export const WalletConnection = Schema.Struct({
  id: WalletConnectionId,
  userId: UserId,
  origin: Origin,
  address: EvmAddress,
  chainId: Schema.Int,
  grantedAt: Schema.Int,
  approvalId: ApprovalId,
  revokedAt: Schema.NullOr(Schema.Int),
});
export type WalletConnection = typeof WalletConnection.Type;

export const walletRequestFinished = (status: WalletRequestStatus): boolean =>
  status !== "pending" &&
  status !== "awaiting_approval" &&
  status !== "approved" &&
  status !== "signed" &&
  status !== "sent";

/** What happened, in the vocabulary the status machine understands. */
export const WalletRequestEvent = Schema.Literals([
  "card_shown",
  "approved",
  "refused",
  "declined",
  "expired",
  "cancelled",
  "signed",
  "sent",
  "confirmed",
  "failed",
  "uncertain",
  "reconciled_confirmed",
  "reconciled_failed",
]);
export type WalletRequestEvent = typeof WalletRequestEvent.Type;

const TRANSITIONS: Readonly<
  Record<
    WalletRequestStatus,
    Partial<Record<WalletRequestEvent, WalletRequestStatus>>
  >
> = {
  pending: {
    approved: "approved",
    cancelled: "cancelled",
    card_shown: "awaiting_approval",
    expired: "expired",
    refused: "refused",
  },
  awaiting_approval: {
    approved: "approved",
    cancelled: "cancelled",
    declined: "declined",
    expired: "expired",
  },
  approved: {
    cancelled: "cancelled",
    // A connection has nothing to sign: it is confirmed the moment it is granted.
    confirmed: "confirmed",
    failed: "failed",
    signed: "signed",
  },
  signed: {
    // A signature is confirmed by delivering it; a transaction by sending it.
    confirmed: "confirmed",
    failed: "failed",
    sent: "sent",
    uncertain: "uncertain",
  },
  sent: {
    confirmed: "confirmed",
    failed: "failed",
    uncertain: "uncertain",
  },
  uncertain: {
    reconciled_confirmed: "confirmed",
    reconciled_failed: "failed",
  },
  confirmed: {},
  failed: {},
  refused: {},
  declined: {},
  expired: {},
  cancelled: {},
};

/**
 * The next status, or null when the move is illegal.
 *
 * Total and pure so the store can refuse an illegal write and a test can walk
 * every edge. The shape encodes the two invariants that matter: nothing that
 * has been signed can go back to being unsigned, and `uncertain` leaves only
 * through reconciliation — never through a retry that signs again.
 */
export const advanceWalletRequest = (
  status: WalletRequestStatus,
  event: WalletRequestEvent
): WalletRequestStatus | null => TRANSITIONS[status][event] ?? null;

/**
 * The exact text the fingerprint is taken over. Field order is fixed here so
 * two servers, or one server before and after a restart, hash the same bytes.
 * Hashing itself happens where `node:crypto` is allowed.
 */
export const canonicalWalletRequest = (input: {
  readonly chainId: number;
  readonly origin: string;
  readonly payload: WalletRequestPayload;
}): string => {
  const { payload } = input;
  const head = `${input.chainId}|${input.origin}|${payload.kind}`;
  switch (payload.kind) {
    case "connect": {
      return head;
    }
    case "send_transaction": {
      return `${head}|${payload.from.toLowerCase()}|${payload.to?.toLowerCase() ?? "create"}|${payload.value.toLowerCase()}|${payload.data.toLowerCase()}`;
    }
    case "personal_sign": {
      return `${head}|${payload.address.toLowerCase()}|${payload.message.toLowerCase()}`;
    }
    case "sign_typed_data_v4": {
      return `${head}|${payload.address.toLowerCase()}|${payload.typedData}`;
    }
  }
  return head;
};
