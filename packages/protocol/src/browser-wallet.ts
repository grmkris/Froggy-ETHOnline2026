/**
 * The wire between a page, the injected wallet and the server, and the shapes
 * the web app sees of a dapp request.
 *
 * Like `browser-payments.ts` this lives in the protocol package because the
 * browser carries it and the wallet decides on it, and those two may not import
 * each other. Every field is decoded before use; every string is capped, since
 * all of it is written by a page.
 */

import {
  ApprovalId,
  TabId,
  WALLET_REQUEST_PARAMS_LIMIT,
  WALLET_REQUEST_RESULT_LIMIT,
  WalletConnectionId,
  WalletRequestDelivery,
  WalletRequestId,
  WalletRequestInitiator,
  WalletRequestKind,
  WalletRequestStatus,
} from "@froggy/domain";
import { Schema } from "effect";

/**
 * One in-flight page request per tab. A second request while the first waits
 * is answered `-32002` (already processing), which is what MetaMask does and
 * what every dapp already handles.
 */
export const BROWSER_WALLET_PENDING_PER_TAB = 1;

/** The bridge's name inside the page. The provider calls `window[BINDING](json)`. */
export const BROWSER_WALLET_BINDING = "__froggyWalletBridge";

const PageId = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(64)
);

/**
 * The EIP-1193 methods the provider forwards. Anything else is answered in the
 * page with `4200` and never crosses the bridge.
 */
export const WalletRpcMethod = Schema.Literals([
  "eth_requestAccounts",
  "eth_accounts",
  "eth_chainId",
  "net_version",
  "wallet_requestPermissions",
  "wallet_getPermissions",
  "wallet_revokePermissions",
  "wallet_switchEthereumChain",
  "wallet_addEthereumChain",
  "eth_sendTransaction",
  "personal_sign",
  "eth_signTypedData_v4",
  "eth_getBalance",
  "eth_blockNumber",
  "eth_call",
  "eth_estimateGas",
  "eth_gasPrice",
  "eth_getTransactionByHash",
  "eth_getTransactionReceipt",
  "eth_getTransactionCount",
  "eth_getCode",
  "eth_getBlockByNumber",
  "eth_feeHistory",
  "eth_maxPriorityFeePerGas",
]);
export type WalletRpcMethod = typeof WalletRpcMethod.Type;

/** What the page's provider posts through the binding. */
export const BrowserWalletCall = Schema.Struct({
  v: Schema.Literal(1),
  id: PageId,
  method: WalletRpcMethod,
  params: Schema.Array(Schema.Unknown).check(Schema.isMaxLength(8)),
});
export type BrowserWalletCall = typeof BrowserWalletCall.Type;

/** The bridge refuses a binding payload longer than this before decoding it. */
export const BROWSER_WALLET_CALL_LIMIT = WALLET_REQUEST_PARAMS_LIMIT + 512;

export const WalletRpcError = Schema.Struct({
  code: Schema.Int,
  message: Schema.String.check(Schema.isMaxLength(500)),
});
export type WalletRpcError = typeof WalletRpcError.Type;

/** What the server evaluates back into the page for one call. */
export const BrowserWalletReply = Schema.Union([
  Schema.Struct({
    v: Schema.Literal(1),
    id: PageId,
    ok: Schema.Literal(true),
    /** Serialised by the server, capped, so a node answer cannot flood the page. */
    result: Schema.String.check(
      Schema.isMaxLength(WALLET_REQUEST_RESULT_LIMIT)
    ),
  }),
  Schema.Struct({
    v: Schema.Literal(1),
    id: PageId,
    ok: Schema.Literal(false),
    error: WalletRpcError,
  }),
]);
export type BrowserWalletReply = typeof BrowserWalletReply.Type;

/** An EIP-1193 event the server raises in every context of a tab. */
export const BrowserWalletEvent = Schema.Struct({
  v: Schema.Literal(1),
  event: Schema.Literals([
    "connect",
    "disconnect",
    "accountsChanged",
    "chainChanged",
  ]),
  /** Serialised argument, capped like a reply. */
  data: Schema.String.check(Schema.isMaxLength(2048)),
});
export type BrowserWalletEvent = typeof BrowserWalletEvent.Type;

/**
 * Where a call came from, as the CDP session saw it. The page supplies none of
 * this; the bridge records it from `Runtime.executionContextCreated`.
 */
export const BrowserWalletContext = Schema.Struct({
  tabId: TabId,
  /** `ExecutionContextDescription.uniqueId`; replies are evaluated in exactly this context. */
  contextId: Schema.String.check(Schema.isMaxLength(128)),
  origin: Schema.String.check(Schema.isMaxLength(2048)),
  topOrigin: Schema.String.check(Schema.isMaxLength(2048)),
  frameId: Schema.String.check(Schema.isMaxLength(128)),
  isTop: Schema.Boolean,
});
export type BrowserWalletContext = typeof BrowserWalletContext.Type;

/** A call with the context it arrived in: what the browser hands the server. */
export const BrowserWalletObservation = Schema.Struct({
  call: BrowserWalletCall,
  context: BrowserWalletContext,
  observedAt: Schema.Int,
});
export type BrowserWalletObservation = typeof BrowserWalletObservation.Type;

// ---------------------------------------------------------------------------
// What the web app sees
// ---------------------------------------------------------------------------

/** A dapp request as the app shows it: the record minus the payload, plus its reading. */
export const WalletRequestView = Schema.Struct({
  id: WalletRequestId,
  createdAt: Schema.Int,
  updatedAt: Schema.Int,
  origin: Schema.String,
  chainId: Schema.Int,
  kind: WalletRequestKind,
  status: WalletRequestStatus,
  delivery: WalletRequestDelivery,
  initiatedDuring: WalletRequestInitiator,
  title: Schema.String,
  summary: Schema.Array(Schema.String),
  approvalId: Schema.NullOr(ApprovalId),
  transactionHash: Schema.NullOr(Schema.String),
  error: Schema.NullOr(Schema.String),
  expiresAt: Schema.Int,
  stubbed: Schema.Boolean,
});
export type WalletRequestView = typeof WalletRequestView.Type;

export const WalletConnectionView = Schema.Struct({
  id: WalletConnectionId,
  origin: Schema.String,
  address: Schema.String,
  chainId: Schema.Int,
  grantedAt: Schema.Int,
});
export type WalletConnectionView = typeof WalletConnectionView.Type;

export const WalletConnectionList = Schema.Struct({
  connections: Schema.Array(WalletConnectionView),
});
export type WalletConnectionList = typeof WalletConnectionList.Type;

/**
 * The exact request Privy will receive for a one-shot rule, as `prepare` hands
 * it to the browser to sign. The same shape the allowance change uses, so one
 * signing helper serves both.
 */
export const SignedPrivyRequest = Schema.Struct({
  body: Schema.Unknown,
  headers: Schema.Struct({
    "privy-app-id": Schema.String,
    "privy-request-expiry": Schema.String,
  }),
  method: Schema.String,
  url: Schema.String,
  version: Schema.Number,
});
export type SignedPrivyRequest = typeof SignedPrivyRequest.Type;

export const WalletRequestPrepared = Schema.Struct({
  expiry: Schema.Int,
  needsSignature: Schema.Boolean,
  payload: SignedPrivyRequest,
});
export type WalletRequestPrepared = typeof WalletRequestPrepared.Type;

export const WalletRequestCommit = Schema.Struct({
  expiry: Schema.Int,
  /** Null where the app secret still owns the policy and Privy needs none. */
  signature: Schema.NullOr(Schema.String),
});
export type WalletRequestCommit = typeof WalletRequestCommit.Type;

/** What `commit` answers: the record as it stands once the answer reached the page. */
export const WalletRequestCommitted = Schema.Struct({
  ok: Schema.Literal(true),
  request: WalletRequestView,
});
export type WalletRequestCommitted = typeof WalletRequestCommitted.Type;
