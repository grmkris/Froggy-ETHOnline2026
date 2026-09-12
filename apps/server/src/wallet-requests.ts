/**
 * One dapp call against the injected wallet.
 *
 * The page supplies a method and params; Chrome tells us which tab and which
 * origin they came from. Nothing the page said is trusted for identity or for
 * spending. A connect that the person has already granted is answered from
 * `walletConnections`. A signature or a transaction is decoded, refused if the
 * decoder says so, otherwise parked as a card. The person's Allow on a
 * signature is not this file signing — it is `commit` patching a one-shot
 * Privy rule and only then asking the agent key. Restarts never sign again.
 */

import type { BrowserHandle } from "@froggy/browser";
import {
  ApprovalId,
  EvmAddress,
  Network,
  RunId,
  WALLET_REQUEST_RESULT_LIMIT,
  WALLET_REQUEST_TTL_MS,
  WALLET_RULE_TTL_MS,
  WalletConnectionId,
  WalletRequestId,
  advanceWalletRequest,
  assessMessage,
  assessTransaction,
  assessTypedData,
  canonicalWalletRequest,
  parseTypedData,
  usdMicros,
  walletRequestFinished,
} from "@froggy/domain";
import type {
  DappAssessment,
  PolicyDecision,
  Receipt,
  SpendIntent,
  TypedDataDocument,
  UserId,
  WalletConnection,
  WalletRequest,
  WalletRequestEvent,
  WalletRequestInitiator,
  WalletRequestPayload,
  WalletRequestStatus,
} from "@froggy/domain";
import type {
  AppServerMessage,
  ApprovalRequest,
  BrowserWalletObservation,
  BrowserWalletReply,
  InteractionMode,
  WalletRequestView,
} from "@froggy/protocol";
import { BROWSER_WALLET_PENDING_PER_TAB } from "@froggy/protocol";
import type {
  AgentEvmSigner,
  DappRuleInput,
  EvmReads,
  EvmRpc,
  PersonPolicyRecord,
  PrivyServer,
  RpcJson,
  Store,
  WalletRequestPatch,
} from "@froggy/wallet";
import { dappRule } from "@froggy/wallet";
import { Result, Schema } from "effect";
import { keccak256 } from "viem";
import type { Hex } from "viem";

import { detached } from "./detached";
import type { ApprovalOutcome, InteractionRegistry } from "./interactions";
import type { AskInput, WorkspaceSession } from "./session";
import {
  WALLET_INTERNAL,
  WALLET_INVALID_PARAMS,
  WALLET_PENDING,
  WALLET_UNRECOGNIZED_CHAIN,
  WALLET_UNSUPPORTED,
  WALLET_USER_REJECTED,
  chainIdHex,
  classifyWalletCall,
} from "./wallet-call";
import type { ClassifiedWalletCall } from "./wallet-call";
import { walletRequestView } from "./wallet-view";

const MIN_PRIORITY_FEE = 1_000_000n;
const SIMPLE_GAS = 21_000n;
const CALL_GAS = 90_000n;
const TypeFields = Schema.Record(
  Schema.String,
  Schema.Array(Schema.Struct({ name: Schema.String, type: Schema.String }))
);
const decodeTypes = Schema.decodeUnknownResult(TypeFields);
const decodeAddress = Schema.decodeUnknownResult(EvmAddress);
const decodeNetwork = Schema.decodeUnknownSync(Network);

// SAFETY: signatures and raw transactions in this file are 0x-prefixed even
// hex produced by Privy or the stub; keccak256 needs that brand.
const asHex = (value: string): Hex => value as Hex;

export class WalletRequestError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "WalletRequestError";
    this.status = status;
  }
}

const OPTIONS: ApprovalRequest["options"] = [
  { id: "deny_stop", kind: "deny_stop", label: "Stop the agent" },
  { id: "deny", kind: "deny", label: "Not this time" },
  { id: "allow_once", kind: "allow_once", label: "Allow once" },
];

const fingerprintOf = (input: {
  readonly chainId: number;
  readonly origin: string;
  readonly payload: WalletRequestPayload;
}): string =>
  new Bun.CryptoHasher("sha256")
    .update(canonicalWalletRequest(input))
    .digest("hex");

const originHost = (origin: string): string => {
  try {
    return new URL(origin).host;
  } catch {
    return origin;
  }
};

const tabOrigin = (url: string): string | null => {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
};

const jsonResult = (id: string, value: RpcJson): BrowserWalletReply => {
  const result = JSON.stringify(value);
  if (result.length > WALLET_REQUEST_RESULT_LIMIT) {
    return {
      error: {
        code: WALLET_INVALID_PARAMS,
        message: "The node answer was larger than the wallet will return.",
      },
      id,
      ok: false,
      v: 1,
    };
  }
  return { id, ok: true, result, v: 1 };
};

const jsonError = (
  id: string,
  code: number,
  message: string
): BrowserWalletReply => ({
  error: { code, message: message.slice(0, 500) },
  id,
  ok: false,
  v: 1,
});

const asRpcParams = (
  params: BrowserWalletObservation["call"]["params"]
): readonly RpcJson[] =>
  // SAFETY: the bridge already decoded a capped JSON array; a structured clone
  // drops anything a node would not accept and matches `EvmReads.request`.
  structuredClone(params) as readonly RpcJson[];

const initiatorOf = (interaction: InteractionMode): WalletRequestInitiator =>
  interaction === "idle" ? "idle" : interaction;

type SignTypedFields = Parameters<AgentEvmSigner["signTypedData"]>[0];

// SAFETY: the EIP-712 document was decoded by Effect Schema; a structured
// clone drops `undefined` and matches the signer's structural domain/message.
const asTypedRecord = (
  source: TypedDataDocument["domain"] | TypedDataDocument["message"]
): SignTypedFields["domain"] =>
  structuredClone(source) as SignTypedFields["domain"];

const accountOf = (session: WorkspaceSession): EvmAddress | null => {
  const own = session.ownEvmAddresses()[0]?.address;
  if (own === undefined) {
    return null;
  }
  const decoded = decodeAddress(own);
  return Result.isSuccess(decoded) ? decoded.success : null;
};

const walletCard = (
  request: WalletRequest,
  reading: DappAssessment,
  needsSignature: boolean
): ApprovalRequest => {
  const host = originHost(request.origin);
  const draft: ApprovalRequest = {
    amountLabel: request.kind === "connect" ? "Connect" : "Sign",
    detail: [...reading.lines, ...reading.warnings].join(" ").slice(0, 500),
    expiresAt: request.expiresAt,
    id: request.approvalId ?? request.id,
    options: OPTIONS,
    payeeLabel: host,
    purpose: reading.title,
    title: reading.title,
    wallet: {
      chainId: request.chainId,
      initiatedDuring: request.initiatedDuring,
      kind: request.kind,
      lines: [...reading.lines].slice(0, 12),
      needsSignature,
      origin: request.origin,
      requestId: request.id,
      warnings: [...reading.warnings].slice(0, 6),
    },
  };
  return request.runId === null ? draft : { ...draft, runId: request.runId };
};

interface Denial {
  readonly error: string;
  readonly event: "cancelled" | "declined" | "expired";
}

const denialOf = (outcome: ApprovalOutcome): Denial => {
  if (outcome.kind === "deadline") {
    return { error: "Nobody answered in time.", event: "expired" };
  }
  if (outcome.kind === "aborted") {
    return { error: outcome.reason, event: "cancelled" };
  }
  return { error: "You declined this request.", event: "declined" };
};

const assess = (
  payload: WalletRequestPayload,
  account: string,
  chainId: number,
  origin: string
): DappAssessment => {
  switch (payload.kind) {
    case "connect": {
      return {
        lines: [`${originHost(origin)} wants to see your address.`],
        refusals: [],
        title: `Connect ${originHost(origin)}`,
        warnings: [],
      };
    }
    case "send_transaction": {
      return assessTransaction(payload, { account, chainId });
    }
    case "personal_sign": {
      return assessMessage(payload, { account, chainId, origin });
    }
    case "sign_typed_data_v4": {
      return assessTypedData(payload, { account, chainId });
    }
  }
};

const permissionValue = (accounts: readonly string[]): RpcJson =>
  accounts.length === 0
    ? []
    : [{ caveats: [], parentCapability: "eth_accounts" }];

const kindOf = (
  payload: WalletRequestPayload
): "dapp_signature" | "dapp_transaction" =>
  payload.kind === "send_transaction" ? "dapp_transaction" : "dapp_signature";

class AddressLock {
  private readonly chain = new Map<string, Promise<true>>();

  async run<T>(address: string, work: () => Promise<T>): Promise<T> {
    const key = address.toLowerCase();
    const previous = this.chain.get(key) ?? Promise.resolve(true);
    const { promise, resolve } = Promise.withResolvers<true>();
    this.chain.set(key, promise);
    try {
      await previous;
    } catch {
      // A failed previous job still has to release the address.
    }
    try {
      return await work();
    } finally {
      resolve(true);
    }
  }
}

export interface WalletRequestDeps {
  readonly appOrigin: string;
  readonly ask: (userId: UserId, input: AskInput) => Promise<ApprovalOutcome>;
  readonly chainId: number;
  readonly interactions: Pick<InteractionRegistry, "resolve">;
  readonly network: string;
  readonly now?: () => number;
  readonly onReceipt?: (userId: UserId, receipt: Receipt) => void;
  readonly policies: {
    readonly current: (userId: UserId) => Promise<PersonPolicyRecord | null>;
  } | null;
  readonly privy: Pick<PrivyServer, "mode" | "signerFor">;
  readonly publish: (userId: UserId, message: AppServerMessage) => void;
  readonly reads: EvmReads;
  readonly rpc: EvmRpc;
  readonly store: Store;
  readonly stubbed: boolean;
  readonly workspace: (userId: UserId) =>
    | {
        readonly browser: BrowserHandle;
        readonly session: WorkspaceSession;
      }
    | undefined;
}

export class WalletRequests {
  private readonly deps: WalletRequestDeps;
  private readonly locks = new AddressLock();
  private readonly signedBytes = new Map<WalletRequestId, string>();

  constructor(deps: WalletRequestDeps) {
    this.deps = deps;
  }

  private now(): number {
    return this.deps.now?.() ?? Date.now();
  }

  private publishView(userId: UserId, request: WalletRequest): void {
    this.deps.publish(userId, {
      request: walletRequestView(request),
      type: "wallet.request.state",
      v: 1,
    });
  }

  private async reply(
    userId: UserId,
    request: WalletRequest,
    reply: BrowserWalletReply
  ): Promise<WalletRequest> {
    const workspace = this.deps.workspace(userId);
    const delivered =
      workspace === undefined
        ? false
        : await workspace.browser.replyWalletCall(
            request.tabId,
            request.contextId,
            reply
          );
    const delivery = delivered ? "delivered" : "undeliverable";
    const next = await this.patch(userId, request, [request.status], {
      delivery,
    });
    return next ?? { ...request, delivery };
  }

  private async patch(
    userId: UserId,
    request: WalletRequest,
    expected: readonly WalletRequestStatus[],
    patch: Omit<WalletRequestPatch, "updatedAt">
  ): Promise<WalletRequest | null> {
    const updated = await this.deps.store.walletRequests.update(
      userId,
      request.id,
      expected,
      { ...patch, updatedAt: this.now() }
    );
    if (updated !== null) {
      this.publishView(userId, updated);
    }
    return updated;
  }

  private async advance(
    userId: UserId,
    request: WalletRequest,
    event: WalletRequestEvent,
    patch: Omit<WalletRequestPatch, "status" | "updatedAt"> = {}
  ): Promise<WalletRequest | null> {
    const status = advanceWalletRequest(request.status, event);
    if (status === null) {
      return null;
    }
    return await this.patch(userId, request, [request.status], {
      ...patch,
      status,
    });
  }

  async pendingFor(userId: UserId): Promise<WalletRequest | null> {
    const rows = await this.deps.store.walletRequests.list(userId, 20);
    return (
      rows.find(
        (row) => row.status === "awaiting_approval" || row.status === "pending"
      ) ?? null
    );
  }

  async list(
    userId: UserId,
    limit: number
  ): Promise<readonly WalletRequestView[]> {
    const rows = await this.deps.store.walletRequests.list(userId, limit);
    return rows.map((row) => walletRequestView(row));
  }

  async byId(
    userId: UserId,
    id: WalletRequestId
  ): Promise<WalletRequest | null> {
    return await this.deps.store.walletRequests.byId(userId, id);
  }

  async connections(userId: UserId) {
    return await this.deps.store.walletConnections.list(userId);
  }

  async revokeConnection(
    userId: UserId,
    id: WalletConnectionId
  ): Promise<boolean> {
    const listed = await this.deps.store.walletConnections.list(userId);
    const target = listed.find((row) => row.id === id);
    const revoked = await this.deps.store.walletConnections.revoke(
      userId,
      id,
      this.now()
    );
    if (!revoked || target === undefined) {
      return revoked;
    }
    const workspace = this.deps.workspace(userId);
    if (workspace !== undefined) {
      const event = {
        data: "[]",
        event: "accountsChanged" as const,
        v: 1 as const,
      };
      const disconnect = {
        data: "{}",
        event: "disconnect" as const,
        v: 1 as const,
      };
      const matching = workspace.browser
        .state()
        .tabs.filter((tab) => tabOrigin(tab.url) === target.origin);
      await Promise.all(
        matching.flatMap((tab) => [
          workspace.browser.emitWalletEvent(event, tab.id),
          workspace.browser.emitWalletEvent(disconnect, tab.id),
        ])
      );
    }
    return true;
  }

  async observe(
    userId: UserId,
    observation: BrowserWalletObservation
  ): Promise<void> {
    const workspace = this.deps.workspace(userId);
    if (workspace === undefined) {
      return;
    }
    const classified = classifyWalletCall(observation.call);
    if (classified.tag === "reject") {
      await workspace.browser.replyWalletCall(
        observation.context.tabId,
        observation.context.contextId,
        jsonError(observation.call.id, classified.code, classified.message)
      );
      return;
    }
    if (await this.replyImmediate(workspace.browser, observation, classified)) {
      return;
    }
    if (
      originHost(observation.context.origin) === originHost(this.deps.appOrigin)
    ) {
      await workspace.browser.replyWalletCall(
        observation.context.tabId,
        observation.context.contextId,
        jsonError(
          observation.call.id,
          WALLET_UNSUPPORTED,
          "Froggy's own origin cannot use the injected wallet."
        )
      );
      return;
    }
    if (classified.tag === "accounts" || classified.tag === "getPermissions") {
      await this.replyAccounts(
        userId,
        workspace.browser,
        observation,
        classified.tag
      );
      return;
    }
    if (classified.tag === "revoke") {
      await this.revokeOrigin(userId, workspace.browser, observation);
      return;
    }
    if (!observation.context.isTop) {
      await workspace.browser.replyWalletCall(
        observation.context.tabId,
        observation.context.contextId,
        jsonError(
          observation.call.id,
          WALLET_UNSUPPORTED,
          "This wallet answers connect and sign from the top frame only."
        )
      );
      return;
    }
    if (classified.tag === "connect") {
      await this.connect(userId, workspace, observation);
      return;
    }
    if (classified.tag !== "sign") {
      return;
    }
    await this.sign(userId, workspace, observation, classified.payload);
  }

  private async replyImmediate(
    browser: BrowserHandle,
    observation: BrowserWalletObservation,
    classified: ClassifiedWalletCall
  ): Promise<boolean> {
    if (classified.tag === "read") {
      await this.replyRead(browser, observation, classified);
      return true;
    }
    if (classified.tag === "chainId") {
      await browser.replyWalletCall(
        observation.context.tabId,
        observation.context.contextId,
        jsonResult(observation.call.id, chainIdHex(this.deps.chainId))
      );
      return true;
    }
    if (classified.tag === "netVersion") {
      await browser.replyWalletCall(
        observation.context.tabId,
        observation.context.contextId,
        jsonResult(observation.call.id, String(this.deps.chainId))
      );
      return true;
    }
    if (classified.tag === "switch") {
      await this.replySwitch(browser, observation, classified.chainIdHex);
      return true;
    }
    return false;
  }

  private async replyRead(
    browser: BrowserHandle,
    observation: BrowserWalletObservation,
    classified: Extract<ClassifiedWalletCall, { readonly tag: "read" }>
  ): Promise<void> {
    try {
      const value = await this.deps.reads.request(
        classified.method,
        asRpcParams(classified.params)
      );
      await browser.replyWalletCall(
        observation.context.tabId,
        observation.context.contextId,
        jsonResult(observation.call.id, value)
      );
    } catch (error) {
      await browser.replyWalletCall(
        observation.context.tabId,
        observation.context.contextId,
        jsonError(
          observation.call.id,
          WALLET_INTERNAL,
          error instanceof Error ? error.message : "The node did not answer."
        )
      );
    }
  }

  private async replySwitch(
    browser: BrowserHandle,
    observation: BrowserWalletObservation,
    requested: string
  ): Promise<void> {
    const expected = chainIdHex(this.deps.chainId);
    const ok =
      requested === expected || requested === String(this.deps.chainId);
    await browser.replyWalletCall(
      observation.context.tabId,
      observation.context.contextId,
      ok
        ? jsonResult(observation.call.id, null)
        : jsonError(
            observation.call.id,
            WALLET_UNRECOGNIZED_CHAIN,
            `This wallet is on ${expected} only.`
          )
    );
  }

  private async replyAccounts(
    userId: UserId,
    browser: BrowserHandle,
    observation: BrowserWalletObservation,
    tag: "accounts" | "getPermissions"
  ): Promise<void> {
    const connection = await this.deps.store.walletConnections.active(
      userId,
      observation.context.origin
    );
    const accounts = connection === null ? [] : [connection.address];
    const value = tag === "accounts" ? accounts : permissionValue(accounts);
    await browser.replyWalletCall(
      observation.context.tabId,
      observation.context.contextId,
      jsonResult(observation.call.id, value)
    );
  }

  private async revokeOrigin(
    userId: UserId,
    browser: BrowserHandle,
    observation: BrowserWalletObservation
  ): Promise<void> {
    const connection = await this.deps.store.walletConnections.active(
      userId,
      observation.context.origin
    );
    if (connection !== null) {
      await this.revokeConnection(userId, connection.id);
    }
    await browser.replyWalletCall(
      observation.context.tabId,
      observation.context.contextId,
      jsonResult(observation.call.id, null)
    );
  }

  private async connect(
    userId: UserId,
    workspace: {
      readonly browser: BrowserHandle;
      readonly session: WorkspaceSession;
    },
    observation: BrowserWalletObservation
  ): Promise<void> {
    const existing = await this.deps.store.walletConnections.active(
      userId,
      observation.context.origin
    );
    if (existing !== null) {
      await workspace.browser.replyWalletCall(
        observation.context.tabId,
        observation.context.contextId,
        jsonResult(observation.call.id, [existing.address])
      );
      return;
    }
    const account = accountOf(workspace.session);
    if (account === null) {
      await workspace.browser.replyWalletCall(
        observation.context.tabId,
        observation.context.contextId,
        jsonError(
          observation.call.id,
          WALLET_INTERNAL,
          "The wallet is not ready. Grant the agent a signature first."
        )
      );
      return;
    }
    const payload: WalletRequestPayload = { kind: "connect" };
    const request = await this.openRequest(
      userId,
      workspace,
      observation,
      payload,
      account
    );
    if (request === null) {
      return;
    }
    await this.askAndSettle(userId, workspace, request, account);
  }

  private async sign(
    userId: UserId,
    workspace: {
      readonly browser: BrowserHandle;
      readonly session: WorkspaceSession;
    },
    observation: BrowserWalletObservation,
    payload: WalletRequestPayload
  ): Promise<void> {
    const account = accountOf(workspace.session);
    if (account === null) {
      await workspace.browser.replyWalletCall(
        observation.context.tabId,
        observation.context.contextId,
        jsonError(
          observation.call.id,
          WALLET_INTERNAL,
          "The wallet is not ready. Grant the agent a signature first."
        )
      );
      return;
    }
    const request = await this.openRequest(
      userId,
      workspace,
      observation,
      payload,
      account
    );
    if (request === null) {
      return;
    }
    await this.askAndSettle(userId, workspace, request, account);
  }

  private async openRequest(
    userId: UserId,
    workspace: {
      readonly browser: BrowserHandle;
      readonly session: WorkspaceSession;
    },
    observation: BrowserWalletObservation,
    payload: WalletRequestPayload,
    account: EvmAddress
  ): Promise<WalletRequest | null> {
    const pending = await this.deps.store.walletRequests.list(userId, 20);
    const busy = pending.filter(
      (row) =>
        row.tabId === observation.context.tabId &&
        !walletRequestFinished(row.status) &&
        row.kind !== "connect"
    );
    if (
      payload.kind !== "connect" &&
      busy.length >= BROWSER_WALLET_PENDING_PER_TAB
    ) {
      await workspace.browser.replyWalletCall(
        observation.context.tabId,
        observation.context.contextId,
        jsonError(
          observation.call.id,
          WALLET_PENDING,
          "This tab already has a wallet request waiting."
        )
      );
      return null;
    }
    const reading = assess(
      payload,
      account,
      this.deps.chainId,
      observation.context.origin
    );
    const now = this.now();
    const created = await this.deps.store.walletRequests.create(userId, {
      approvalId: ApprovalId.generate(),
      chainId: this.deps.chainId,
      contextId: observation.context.contextId,
      createdAt: now,
      delivery: "pending",
      error: null,
      expiresAt: now + WALLET_REQUEST_TTL_MS,
      fingerprint: fingerprintOf({
        chainId: this.deps.chainId,
        origin: observation.context.origin,
        payload,
      }),
      id: WalletRequestId.generate(),
      initiatedDuring: initiatorOf(workspace.browser.state().interaction),
      kind: payload.kind,
      nonce: null,
      origin: observation.context.origin,
      pageRequestId: observation.call.id,
      payload,
      receiptId: null,
      runId: null,
      signedHash: null,
      status: "pending",
      stubbed: this.deps.stubbed,
      summary: [...reading.lines],
      tabId: observation.context.tabId,
      topOrigin: observation.context.topOrigin,
      transactionHash: null,
      updatedAt: now,
      userId,
    });
    this.publishView(userId, created);
    if (reading.refusals.length > 0) {
      const refused = await this.advance(userId, created, "refused", {
        error: reading.refusals[0] ?? "Refused.",
        summary: [...reading.lines, ...reading.refusals],
      });
      const row = refused ?? created;
      await this.reply(
        userId,
        row,
        jsonError(
          observation.call.id,
          WALLET_USER_REJECTED,
          row.error ?? "Refused."
        )
      );
      this.record(userId, workspace.session, row, reading, {
        _tag: "deny",
        code: "untrusted_provenance",
        message: row.error ?? "Refused.",
      });
      return null;
    }
    if (
      dappRule({
        chainId: this.deps.chainId,
        id: created.id,
        notAfterMs: created.createdAt + WALLET_RULE_TTL_MS,
        payload,
      }) === null &&
      payload.kind !== "connect"
    ) {
      const refused = await this.advance(userId, created, "refused", {
        error:
          "Froggy cannot pin a Privy rule to this request, so it will not sign it.",
      });
      const row = refused ?? created;
      await this.reply(
        userId,
        row,
        jsonError(
          observation.call.id,
          WALLET_USER_REJECTED,
          row.error ?? "Refused."
        )
      );
      return null;
    }
    return created;
  }

  private async askAndSettle(
    userId: UserId,
    workspace: {
      readonly browser: BrowserHandle;
      readonly session: WorkspaceSession;
    },
    request: WalletRequest,
    account: EvmAddress
  ): Promise<void> {
    const reading = assess(
      request.payload,
      account,
      request.chainId,
      request.origin
    );
    const controller = new AbortController();
    const policy = await this.deps.policies?.current(userId);
    const needsSignature =
      request.kind !== "connect" &&
      this.deps.privy.mode === "live" &&
      policy !== null;
    const awaiting =
      (await this.advance(userId, request, "card_shown")) ?? request;
    const outcome = await this.deps.ask(userId, {
      request: walletCard(awaiting, reading, needsSignature),
      signal: controller.signal,
    });
    const latest =
      (await this.deps.store.walletRequests.byId(userId, request.id)) ??
      awaiting;
    if (
      walletRequestFinished(latest.status) ||
      latest.status === "signed" ||
      latest.status === "sent"
    ) {
      return;
    }
    if (outcome.kind !== "answered" || outcome.optionId !== "allow_once") {
      const denial = denialOf(outcome);
      const settled = await this.advance(userId, latest, denial.event, {
        error: denial.error,
      });
      const row = settled ?? latest;
      await this.reply(
        userId,
        row,
        jsonError(
          request.pageRequestId,
          WALLET_USER_REJECTED,
          row.error ?? "Rejected."
        )
      );
      this.record(userId, workspace.session, row, reading, {
        _tag: "deny",
        code: "approval_denied",
        message: row.error ?? "Declined.",
      });
      return;
    }
    const approved = await this.advance(userId, latest, "approved");
    const next = approved ?? latest;
    if (next.kind === "connect") {
      await this.grantConnect(userId, workspace, next, account, reading);
      return;
    }
    if (this.deps.privy.mode === "stub") {
      await this.fulfillStub(userId, workspace, next, reading);
      return;
    }
    if (!needsSignature) {
      await this.fulfill(userId, workspace, next, reading);
      return;
    }
    await this.waitUntilSettled(userId, workspace, next, reading);
  }

  /**
   * Person-owned policies need the browser to PATCH a one-shot rule before
   * the agent key may sign. `commit` does that work; this waits for it, or
   * expires the request if nobody finished the signature in time.
   */
  private async waitUntilSettled(
    userId: UserId,
    workspace: {
      readonly browser: BrowserHandle;
      readonly session: WorkspaceSession;
    },
    request: WalletRequest,
    reading: DappAssessment
  ): Promise<void> {
    if (this.now() >= request.expiresAt) {
      await this.expireWaiting(userId, workspace, request, reading);
      return;
    }
    const latest = await this.deps.store.walletRequests.byId(
      userId,
      request.id
    );
    if (
      latest === null ||
      walletRequestFinished(latest.status) ||
      latest.status === "signed" ||
      latest.status === "sent"
    ) {
      return;
    }
    await Bun.sleep(50);
    await this.waitUntilSettled(userId, workspace, request, reading);
  }

  private async expireWaiting(
    userId: UserId,
    workspace: {
      readonly browser: BrowserHandle;
      readonly session: WorkspaceSession;
    },
    request: WalletRequest,
    reading: DappAssessment
  ): Promise<void> {
    const latest =
      (await this.deps.store.walletRequests.byId(userId, request.id)) ??
      request;
    if (
      walletRequestFinished(latest.status) ||
      latest.status === "signed" ||
      latest.status === "sent"
    ) {
      return;
    }
    const expired = await this.advance(userId, latest, "expired", {
      error:
        "Approve this in the Froggy app so the policy change can be signed.",
    });
    const row = expired ?? latest;
    await this.reply(
      userId,
      row,
      jsonError(
        request.pageRequestId,
        WALLET_USER_REJECTED,
        row.error ?? "Expired."
      )
    );
    this.record(userId, workspace.session, row, reading, {
      _tag: "deny",
      code: "approval_denied",
      message: row.error ?? "Expired.",
    });
  }

  private async grantConnect(
    userId: UserId,
    workspace: {
      readonly browser: BrowserHandle;
      readonly session: WorkspaceSession;
    },
    request: WalletRequest,
    account: EvmAddress,
    reading: DappAssessment
  ): Promise<void> {
    const approvalId = request.approvalId ?? ApprovalId.generate();
    const connection: WalletConnection = {
      address: account,
      approvalId,
      chainId: request.chainId,
      grantedAt: this.now(),
      id: WalletConnectionId.generate(),
      origin: request.origin,
      revokedAt: null,
      userId,
    };
    await this.deps.store.walletConnections.grant(userId, connection);
    const confirmed = await this.advance(userId, request, "confirmed");
    const row = confirmed ?? request;
    await this.reply(userId, row, jsonResult(request.pageRequestId, [account]));
    await workspace.browser.emitWalletEvent(
      { data: JSON.stringify([account]), event: "accountsChanged", v: 1 },
      request.tabId
    );
    this.record(userId, workspace.session, row, reading, {
      _tag: "allow",
      satisfied: [],
    });
  }

  private async fulfillStub(
    userId: UserId,
    workspace: {
      readonly browser: BrowserHandle;
      readonly session: WorkspaceSession;
    },
    request: WalletRequest,
    reading: DappAssessment
  ): Promise<void> {
    if (request.kind === "send_transaction") {
      const failed = await this.advance(userId, request, "failed", {
        error: "Privy is stubbed; no transaction was broadcast.",
      });
      const row = failed ?? request;
      await this.reply(
        userId,
        row,
        jsonError(
          request.pageRequestId,
          WALLET_INTERNAL,
          row.error ?? "Stubbed."
        )
      );
      this.record(userId, workspace.session, row, reading, {
        _tag: "deny",
        code: "approval_unavailable",
        message: row.error ?? "Stubbed.",
      });
      return;
    }
    const signature = `0x${"73".repeat(65)}`;
    const signed = await this.advance(userId, request, "signed", {
      signedHash: keccak256(asHex(signature)),
    });
    const row = await this.afterSigned(userId, request, signed);
    await this.reply(userId, row, jsonResult(request.pageRequestId, signature));
    this.record(userId, workspace.session, row, reading, {
      _tag: "allow",
      satisfied: [],
    });
  }

  /**
   * Sign after the one-shot rule is on the policy. Called from `commit`, and
   * from the no-signature path when the app secret still owns the policy.
   */
  async fulfillApproved(
    userId: UserId,
    id: WalletRequestId
  ): Promise<WalletRequestView> {
    const workspace = this.deps.workspace(userId);
    const request = await this.deps.store.walletRequests.byId(userId, id);
    if (request === null || workspace === undefined) {
      throw new WalletRequestError("That request is not yours.", 404);
    }
    const account = accountOf(workspace.session);
    if (account === null) {
      throw new WalletRequestError("The wallet is not ready.", 409);
    }
    const reading = assess(
      request.payload,
      account,
      request.chainId,
      request.origin
    );
    if (request.status === "awaiting_approval") {
      const approved = await this.advance(userId, request, "approved");
      if (approved === null) {
        const latest = await this.deps.store.walletRequests.byId(userId, id);
        if (latest !== null) {
          return walletRequestView(latest, reading);
        }
      }
    }
    const latest =
      (await this.deps.store.walletRequests.byId(userId, id)) ?? request;
    if (latest.kind === "connect") {
      await this.grantConnect(userId, workspace, latest, account, reading);
      return walletRequestView(
        (await this.deps.store.walletRequests.byId(userId, id)) ?? latest,
        reading
      );
    }
    this.deps.interactions.resolve(
      userId,
      latest.approvalId ?? latest.id,
      "allow_once"
    );
    await (this.deps.privy.mode === "stub"
      ? this.fulfillStub(userId, workspace, latest, reading)
      : this.fulfill(userId, workspace, latest, reading));
    return walletRequestView(
      (await this.deps.store.walletRequests.byId(userId, id)) ?? latest,
      reading
    );
  }

  async liveDapps(
    userId: UserId,
    extra: WalletRequest
  ): Promise<readonly WalletRequest[]> {
    const rows = await this.deps.store.walletRequests.list(userId, 40);
    return [...rows, extra].filter(
      (row, index, all) =>
        all.findIndex((item) => item.id === row.id) === index &&
        row.kind !== "connect" &&
        (row.status === "awaiting_approval" ||
          row.status === "approved" ||
          row.status === "signed") &&
        this.now() < row.createdAt + WALLET_RULE_TTL_MS
    );
  }

  private async fulfill(
    userId: UserId,
    workspace: {
      readonly browser: BrowserHandle;
      readonly session: WorkspaceSession;
    },
    request: WalletRequest,
    reading: DappAssessment
  ): Promise<void> {
    const wallet = workspace.session.embeddedWallet;
    const agentSigner =
      wallet === null ? null : this.deps.privy.signerFor(wallet);
    if (agentSigner === null) {
      const failed = await this.advance(userId, request, "failed", {
        error: "The agent has no signature on this wallet.",
      });
      const row = failed ?? request;
      await this.reply(
        userId,
        row,
        jsonError(
          request.pageRequestId,
          WALLET_INTERNAL,
          row.error ?? "No signer."
        )
      );
      return;
    }
    try {
      if (request.payload.kind === "personal_sign") {
        await this.signPersonal(
          userId,
          workspace,
          request,
          reading,
          agentSigner
        );
        return;
      }
      if (request.payload.kind === "sign_typed_data_v4") {
        await this.signTyped(userId, workspace, request, reading, agentSigner);
        return;
      }
      if (request.payload.kind === "send_transaction") {
        await this.signSend(userId, workspace, request, reading, agentSigner);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Signing failed.";
      const failed = await this.advance(userId, request, "failed", {
        error: message,
      });
      const row = failed ?? request;
      await this.reply(
        userId,
        row,
        jsonError(request.pageRequestId, WALLET_USER_REJECTED, message)
      );
      this.record(userId, workspace.session, row, reading, {
        _tag: "deny",
        code: "approval_denied",
        message,
      });
    }
  }

  private async signPersonal(
    userId: UserId,
    workspace: {
      readonly browser: BrowserHandle;
      readonly session: WorkspaceSession;
    },
    request: WalletRequest,
    reading: DappAssessment,
    signer: AgentEvmSigner
  ): Promise<void> {
    if (request.payload.kind !== "personal_sign") {
      return;
    }
    const message = Buffer.from(request.payload.message.slice(2), "hex");
    const signature = await signer.signMessage(message);
    const signed = await this.advance(userId, request, "signed", {
      signedHash: keccak256(asHex(signature)),
    });
    const row = await this.afterSigned(userId, request, signed);
    await this.reply(userId, row, jsonResult(request.pageRequestId, signature));
    this.record(userId, workspace.session, row, reading, {
      _tag: "allow",
      satisfied: [],
    });
  }

  private async signTyped(
    userId: UserId,
    workspace: {
      readonly browser: BrowserHandle;
      readonly session: WorkspaceSession;
    },
    request: WalletRequest,
    reading: DappAssessment,
    signer: AgentEvmSigner
  ): Promise<void> {
    if (request.payload.kind !== "sign_typed_data_v4") {
      return;
    }
    const document = parseTypedData(request.payload.typedData);
    if (document === null) {
      throw new Error(
        "The typed data was not a document this wallet can sign."
      );
    }
    const types = decodeTypes(document.types);
    if (Result.isFailure(types)) {
      throw new Error(
        "The typed data was not a document this wallet can sign."
      );
    }
    const signature = await signer.signTypedData({
      domain: asTypedRecord(document.domain),
      message: asTypedRecord(document.message),
      primaryType: document.primaryType,
      types: types.success,
    });
    const signed = await this.advance(userId, request, "signed", {
      signedHash: keccak256(asHex(signature)),
    });
    const row = await this.afterSigned(userId, request, signed);
    await this.reply(userId, row, jsonResult(request.pageRequestId, signature));
    this.record(userId, workspace.session, row, reading, {
      _tag: "allow",
      satisfied: [],
    });
  }

  private async signSend(
    userId: UserId,
    workspace: {
      readonly browser: BrowserHandle;
      readonly session: WorkspaceSession;
    },
    request: WalletRequest,
    reading: DappAssessment,
    signer: AgentEvmSigner
  ): Promise<void> {
    const { payload } = request;
    if (payload.kind !== "send_transaction" || payload.to === null) {
      return;
    }
    const { data, to, value } = payload;
    await this.locks.run(signer.address, async () => {
      const latest =
        (await this.deps.store.walletRequests.byId(userId, request.id)) ??
        request;
      if (latest.status !== "approved") {
        return;
      }
      let gasLimit = CALL_GAS;
      try {
        const estimated = await this.deps.reads.estimateGas({
          data,
          from: signer.address,
          to,
          value,
        });
        gasLimit = estimated < SIMPLE_GAS ? SIMPLE_GAS : estimated;
      } catch {
        gasLimit = data === "0x" ? SIMPLE_GAS : CALL_GAS;
      }
      const [nonce, gasPrice, tip] = await Promise.all([
        this.deps.rpc.transactionCount(signer.address),
        this.deps.rpc.gasPrice(),
        this.deps.rpc.maxPriorityFeePerGas().catch(() => MIN_PRIORITY_FEE),
      ]);
      const maxPriorityFeePerGas =
        tip > MIN_PRIORITY_FEE ? tip : MIN_PRIORITY_FEE;
      const signedTx = await signer.signTransaction({
        chainId: request.chainId,
        data,
        gasLimit,
        maxFeePerGas: gasPrice * 2n + maxPriorityFeePerGas,
        maxPriorityFeePerGas,
        nonce,
        to,
        value: BigInt(value),
      });
      const hash = keccak256(asHex(signedTx));
      this.signedBytes.set(request.id, signedTx);
      const signed = await this.advance(userId, latest, "signed", {
        nonce,
        signedHash: hash,
      });
      if (signed === null) {
        return;
      }
      const sentHash = await this.deps.rpc.sendRawTransaction(signedTx);
      const sent = await this.advance(userId, signed, "sent", {
        transactionHash: sentHash,
      });
      if (sent === null) {
        return;
      }
      await this.reply(
        userId,
        sent,
        jsonResult(request.pageRequestId, sentHash)
      );
      try {
        const receipt = await this.deps.rpc.waitForReceipt(sentHash);
        const event = receipt.status === "success" ? "confirmed" : "failed";
        const confirmed = await this.advance(userId, sent, event, {
          error:
            receipt.status === "success" ? null : "The transaction reverted.",
        });
        const row = confirmed ?? sent;
        if (receipt.status === "success") {
          this.record(userId, workspace.session, row, reading, {
            _tag: "allow",
            satisfied: [],
          });
        } else {
          this.record(userId, workspace.session, row, reading, {
            _tag: "deny",
            code: "approval_denied",
            message: "The transaction reverted.",
          });
        }
      } catch (error) {
        const uncertain = await this.advance(userId, sent, "uncertain", {
          error: error instanceof Error ? error.message : "No receipt yet.",
        });
        this.record(userId, workspace.session, uncertain ?? sent, reading, {
          _tag: "allow",
          satisfied: [],
        });
      }
    });
  }

  async recover(): Promise<void> {
    const rows = await this.deps.store.walletRequests.inFlight([
      "pending",
      "awaiting_approval",
      "approved",
      "signed",
      "sent",
      "uncertain",
    ]);
    const now = this.now();
    await Promise.allSettled(
      rows.map(({ request, userId }) => this.recoverOne(userId, request, now))
    );
  }

  private async recoverOne(
    userId: UserId,
    request: WalletRequest,
    now: number
  ): Promise<void> {
    if (
      (request.status === "pending" ||
        request.status === "awaiting_approval" ||
        request.status === "approved") &&
      request.expiresAt <= now
    ) {
      const expired = await this.advance(userId, request, "expired", {
        error: "This request expired. It will not be signed.",
      });
      const row = expired ?? request;
      await this.reply(
        userId,
        row,
        jsonError(
          request.pageRequestId,
          WALLET_USER_REJECTED,
          row.error ?? "Expired."
        )
      );
      return;
    }
    if (request.status === "signed") {
      await this.rebroadcast(userId, request);
      return;
    }
    if (
      (request.status === "sent" || request.status === "uncertain") &&
      request.transactionHash !== null
    ) {
      await this.reconcile(userId, request, now);
    }
  }

  private async rebroadcast(
    userId: UserId,
    request: WalletRequest
  ): Promise<void> {
    const bytes = this.signedBytes.get(request.id);
    if (bytes === undefined) {
      await this.advance(userId, request, "failed", {
        error:
          "The worker stopped before broadcast. This request will not be signed again.",
      });
      return;
    }
    if (request.signedHash !== null) {
      const known = await this.deps.rpc.transactionKnown(request.signedHash);
      if (known) {
        await this.advance(userId, request, "sent", {
          transactionHash: request.signedHash,
        });
        return;
      }
    }
    try {
      const hash = await this.deps.rpc.sendRawTransaction(bytes);
      await this.advance(userId, request, "sent", {
        transactionHash: hash,
      });
    } catch (error) {
      await this.advance(userId, request, "uncertain", {
        error: error instanceof Error ? error.message : "Rebroadcast failed.",
      });
    }
  }

  private async reconcile(
    userId: UserId,
    request: WalletRequest,
    now: number
  ): Promise<void> {
    if (request.transactionHash === null) {
      return;
    }
    const receipt = await this.deps.rpc.transactionReceipt(
      request.transactionHash
    );
    if (receipt === null) {
      const known = await this.deps.rpc.transactionKnown(
        request.transactionHash
      );
      if (!known && now - request.updatedAt > WALLET_RULE_TTL_MS) {
        await this.advance(userId, request, "reconciled_failed", {
          error: "The node has no record of this transaction.",
        });
      }
      return;
    }
    if (receipt.status === "success") {
      await this.advance(userId, request, "reconciled_confirmed");
      return;
    }
    await this.advance(userId, request, "reconciled_failed", {
      error: "The transaction reverted.",
    });
  }

  private async afterSigned(
    userId: UserId,
    request: WalletRequest,
    signed: WalletRequest | null
  ): Promise<WalletRequest> {
    if (signed === null) {
      return request;
    }
    return (await this.advance(userId, signed, "confirmed")) ?? signed;
  }

  private record(
    userId: UserId,
    session: WorkspaceSession,
    request: WalletRequest,
    reading: DappAssessment,
    decision: PolicyDecision
  ): void {
    const network = decodeNetwork(this.deps.network);
    const to =
      request.payload.kind === "send_transaction"
        ? request.payload.to
        : request.origin;
    const intent: SpendIntent = {
      amount: {
        asset: { decimals: 18, id: "eth", network, symbol: "ETH" },
        units: "0",
      },
      host: originHost(request.origin),
      idempotencyKey: `dapp:${request.id}`,
      kind: kindOf(request.payload),
      payee: {
        id: to ?? request.origin,
        label: originHost(request.origin),
        provenance: "page",
      },
      purpose: reading.title,
      usdMicros: usdMicros(0),
    };
    const approval =
      request.approvalId === null
        ? undefined
        : {
            id: request.approvalId,
            resolution:
              decision._tag === "allow"
                ? ("allow_once" as const)
                : ("deny" as const),
          };
    const settlement =
      request.transactionHash === null
        ? undefined
        : {
            network: this.deps.network,
            transactionId: request.transactionHash,
          };
    const receipt = session.recordDapp({
      approval,
      at: this.now(),
      decision,
      failure: request.error ?? undefined,
      intent,
      runId: request.runId ?? RunId.generate(),
      settlement,
      stubbed: request.stubbed,
    });
    detached("wallet receipt id", async () => {
      await this.patch(userId, request, [request.status], {
        receiptId: receipt.id,
      });
    });
    this.deps.onReceipt?.(userId, receipt);
  }
}

export const dappRuleInput = (request: WalletRequest): DappRuleInput => ({
  chainId: request.chainId,
  id: request.id,
  notAfterMs: request.createdAt + WALLET_RULE_TTL_MS,
  payload: request.payload,
});
