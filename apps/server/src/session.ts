/**
 * A workspace session: one human, one mandate, one spend history.
 *
 * The `spend` method here is the choke point. Every path that moves money — the
 * x402 tool, a transfer, anything added later — goes through it, and it does
 * the same five things in the same order every time: price the intent, ask the
 * policy, reserve on the ledger, perform the side effect, write the receipt.
 *
 * The first three happen under one per-session lock. The window total is read
 * and the reservation written with nothing in between, so two spends with
 * different keys cannot both read the same total and jointly exceed a cap
 * neither broke alone. The side effect happens outside the lock: it may take
 * seconds and nothing about it changes the arithmetic.
 *
 * Writing the receipt regardless of outcome is what makes a refusal as
 * auditable as a payment: "it did not spend" and "it was told not to" are
 * different facts, and only one of them is reassuring.
 */

import {
  APPROVAL_KIND_ORDER,
  ApprovalId,
  ApprovalKind as ApprovalKindSchema,
  MandateId,
  ReceiptId,
  RuleId as RuleIdSchema,
  SpendId,
  SpendIntent as SpendIntentSchema,
  defaultRules,
  formatUsd,
  priceInUsdMicros,
} from "@froggy/domain";
import type {
  Amount,
  ApprovalKind,
  ApprovalRecord,
  ApprovalResolution,
  Mandate,
  PolicyDecision,
  Quote,
  Receipt,
  RuleId,
  RunId as RunIdValue,
  SessionId,
  SpendIntent,
  Evidence,
  UsdMicros,
  UserId,
} from "@froggy/domain";
import type {
  AgentSignerState,
  ApprovalRequest,
  ServiceModes,
  WalletSummary,
} from "@froggy/protocol";
import { authorize } from "@froggy/wallet";
import type { SpendLedger, Store, WalletAddresses } from "@froggy/wallet";
import { Schema } from "effect";

import { detached } from "./detached";
import type { ApprovalOutcome } from "./interactions";

/**
 * A value under construction, with named fields still to be filled in.
 *
 * Optional properties and `exactOptionalPropertyTypes` do not mix with object
 * spreads: `{...(x ? {k: x} : {})}` type-checks but hides whether the key ended
 * up absent or present-and-undefined, which are different values. Assigning to
 * a draft says which one happened.
 */
type Draft<T, K extends keyof T> = Omit<T, K> & { -readonly [P in K]?: T[P] };

export interface SpendRequest {
  readonly amount: Amount;
  /** The Graph answer this spend is justified by, when there is one. */
  evidence?: Evidence;
  readonly host?: string;
  readonly idempotencyKey: string;
  /**
   * Whether a person can be asked. A chat turn can; a scheduled job cannot,
   * and says so, so an `ask` there is refused as unavailable rather than
   * parked on a card nobody will see.
   */
  readonly interactive?: boolean;
  readonly payeeId: string;
  readonly payeeLabel: string;
  readonly purpose: string;
  /** How we learned the payee. `page` and `model` are never payable. */
  readonly provenance: SpendIntent["payee"]["provenance"];
  /** The turn this spend belongs to, so a receipt can be traced back to it. */
  readonly runId: RunIdValue;
  /**
   * The run's signal. Checked once more immediately before the outbound call:
   * a run stopped between the reservation and the payment must not pay.
   */
  readonly signal?: AbortSignal;
  /** Performs the payment. Only called after the policy has allowed it. */
  readonly settle: () => Promise<{
    readonly network: string;
    readonly ok: boolean;
    readonly stubbed: boolean;
    readonly transactionId: string | null;
  }>;
}

/** What a settlement reports back. Named because three paths now handle it. */
type Settled = Awaited<ReturnType<SpendRequest["settle"]>>;

/** The priced intent and what the policy made of it. */
interface Judged {
  readonly at: number;
  readonly decision: PolicyDecision;
  readonly intent: SpendIntent;
  readonly quote: Quote;
  readonly usdMicros: UsdMicros;
}

/** No money moved. The shape a failed or abandoned settlement reports. */
const unpaid = (request: SpendRequest): Settled => ({
  network: request.amount.asset.network,
  ok: false,
  stubbed: false,
  transactionId: null,
});

export interface SpendResult {
  /**
   * Set when the policy allowed the spend but nothing was sent: the wallet
   * froze or the run stopped between the reservation and the call. The
   * receipt then carries an allow and no settlement, and this says why.
   */
  readonly abandoned: string | null;
  readonly decision: PolicyDecision;
  readonly receipt: Receipt;
}

/** A question for the person, and the run it must not outlive. */
export interface AskInput {
  readonly request: ApprovalRequest;
  readonly signal: AbortSignal;
}

export interface SessionDeps {
  /**
   * Put a card in front of the person and wait. Absent when no surface can
   * show one, in which case every `ask` is refused as unavailable.
   */
  readonly ask?: (input: AskInput) => Promise<ApprovalOutcome>;
  readonly ledger: SpendLedger;
  readonly modes: ServiceModes;
  /** Published when the mandate changes for a reason other than a message. */
  readonly onMandate?: (mandate: Mandate) => void;
  /**
   * What one whole unit of an asset is worth, or null when nobody knows.
   *
   * Null is a refusal, not a fallback. Pricing a spend against a guess is a
   * cap that was never applied, and the previous code did exactly that: it
   * valued one HBAR at one dollar, which is out by more than a factor of ten
   * and made every limit in the mandate a statement about the wrong quantity.
   */
  readonly quote: (asset: Amount["asset"], now: number) => Quote | null;
  readonly now?: () => number;
  readonly onPolicyDecision: (decision: PolicyDecision) => void;
  readonly onReceipt: (receipt: Receipt) => void;
  readonly store: Store;
}

/**
 * The window the wallet pane's "spent so far" figure covers.
 *
 * It is the widest window any rule declares, so the number on screen is the one
 * the binding rule is actually using rather than a separate approximation that
 * disagrees with the refusal message.
 */
const DEFAULT_WINDOW_MS = 24 * 60 * 60 * 1000;

/** How much history a reconnecting client is handed. */
const RECEIPT_HISTORY = 100;

/** How long a card waits for an answer before it resolves as a timeout. */
const APPROVAL_TTL_MS = 120_000;

/** How long "allow for this session" lasts. A session, not forever. */
const EXEMPTION_TTL_MS = 24 * 60 * 60 * 1000;

const APPROVAL_LABELS: Record<ApprovalKind, string> = {
  allow_once: "Allow once",
  allow_session: "Allow for this session",
  deny: "Not this time",
  deny_stop: "Stop and freeze",
};

const isApprovalKind = Schema.is(ApprovalKindSchema);

/** The four options, in the order every surface renders them. */
const approvalOptions = (): ApprovalRequest["options"] =>
  ApprovalKindSchema.literals
    .toSorted((a, b) => APPROVAL_KIND_ORDER[a] - APPROVAL_KIND_ORDER[b])
    .map((kind) => ({ id: kind, kind, label: APPROVAL_LABELS[kind] }));

/** What the human said, or why nothing was said, as the receipt records it. */
const resolutionOf = (outcome: ApprovalOutcome): ApprovalResolution => {
  switch (outcome.kind) {
    case "answered": {
      return isApprovalKind(outcome.optionId) ? outcome.optionId : "deny";
    }
    case "aborted": {
      return "aborted";
    }
    case "deadline": {
      return "timeout";
    }
    default: {
      return "deny";
    }
  }
};

/** The ways a question ends without a yes. */
type Refusal = Exclude<ApprovalResolution, "allow_once" | "allow_session">;

/** A decision for every one of them. */
const refusalFor = (
  resolution: Refusal,
  ruleId: RuleId,
  reason: string | null
): PolicyDecision => {
  switch (resolution) {
    case "timeout": {
      return {
        _tag: "deny",
        code: "approval_timeout",
        message: "Nobody answered within two minutes, so nothing was paid.",
        ruleId,
      };
    }
    case "unavailable": {
      return {
        _tag: "deny",
        code: "approval_unavailable",
        message:
          "This spend is over the automatic limit and there is no one to ask from here.",
        ruleId,
      };
    }
    case "aborted": {
      return {
        _tag: "deny",
        code: "approval_denied",
        message: `The question was withdrawn: ${reason ?? "the run ended"}.`,
        ruleId,
      };
    }
    case "deny_stop": {
      return {
        _tag: "deny",
        code: "approval_denied",
        message: "You said no and stopped the agent.",
        ruleId,
      };
    }
    case "deny": {
      return {
        _tag: "deny",
        code: "approval_denied",
        message: "You declined this spend.",
        ruleId,
      };
    }
    default: {
      return resolution satisfies never;
    }
  }
};

/**
 * Thrown when nothing can say what an asset is worth.
 *
 * A throw rather than a `deny` decision on purpose: a denial is a statement
 * that the policy considered this and said no, and that would be a lie. This
 * is "we could not evaluate the policy at all", which is a different fact and
 * has to read differently on the receipt and to the model.
 */
export class UnpricedAssetError extends Error {
  constructor(symbol: string) {
    super(
      `No usable price for ${symbol}, so the mandate's caps cannot be applied. Nothing was paid.`
    );
    this.name = "UnpricedAssetError";
  }
}

/**
 * Thrown when the spend does not even have the shape of a spend.
 *
 * A negative amount, a fractional unit count, an amount that is not a number:
 * these came from a tool argument, and a tool argument came from the model.
 * They are refused before the policy sees them — a cap compared against `NaN`
 * passes — and the model is told the request was malformed, not denied.
 */
export class MalformedSpendError extends Error {
  constructor(detail: string) {
    super(`That is not a spend this wallet can evaluate: ${detail}`);
    this.name = "MalformedSpendError";
  }
}

const decodeIntent = Schema.decodeUnknownResult(SpendIntentSchema);

const widestWindowMs = (mandate: Mandate): number => {
  let widest = DEFAULT_WINDOW_MS;
  for (const rule of mandate.rules) {
    if (rule._tag === "window_cap") {
      widest = Math.max(widest, rule.windowMs);
    }
  }
  return widest;
};

/** Swallow a settled rejection in a chain that must never inherit one. */
const swallow = (): void => undefined;

export class WorkspaceSession {
  readonly id: SessionId;
  /**
   * Whose session this is.
   *
   * The ledger is keyed on this rather than on `id`, because `id` is generated
   * per process: a cap read against it would reset on every redeploy.
   */
  readonly userId: UserId;

  private readonly deps: SessionDeps;
  private readonly now: () => number;
  private mandate: Mandate;
  private readonly receipts: Receipt[] = [];
  /**
   * Settlements this process is in the middle of, by idempotency key.
   *
   * A second call for the same key joins the first rather than starting its
   * own. The ledger's `created` flag is what makes a double payment impossible
   * across processes; this is what makes it impossible *and* the loser's
   * receipt truthful within one.
   */
  private readonly settlements = new Map<string, Promise<Settled>>();
  /**
   * The lock around price → policy → reserve.
   *
   * A promise chain rather than a mutex library: every judgement waits for the
   * previous one to finish, so the window total a spend is judged against
   * already includes the reservation the spend before it wrote.
   */
  private gate: Promise<unknown> = Promise.resolve();
  private hydration: Promise<void> | null = null;
  private addresses: WalletAddresses = { signer: null, smart: null };
  /**
   * Whether Privy is holding a signature for the agent on this wallet.
   *
   * Starts `pending` because the grant is asked for asynchronously on the
   * first authenticated request; the pane says "asking" rather than flashing
   * "the agent cannot pay" for the second it takes.
   */
  private agentSigner: AgentSignerState = "pending";
  private agentNote: string | null = null;

  constructor(
    id: SessionId,
    userId: UserId,
    deps: SessionDeps,
    allowlist: {
      readonly hosts: readonly string[];
      readonly payeeIds: readonly string[];
    }
  ) {
    this.id = id;
    this.userId = userId;
    this.deps = deps;
    this.now = deps.now ?? Date.now;
    this.mandate = {
      createdAt: this.now(),
      frozen: false,
      id: MandateId.generate(),
      rules: defaultRules({
        hosts: allowlist.hosts,
        ids: () => RuleIdSchema.generate(),
        now: this.now(),
        payeeIds: allowlist.payeeIds,
      }),
      sessionId: id,
    };
  }

  get currentMandate(): Mandate {
    return this.mandate;
  }

  /** What this process has seen. `recentReceipts` reads what survived a restart. */
  get history(): readonly Receipt[] {
    return this.receipts;
  }

  /**
   * Load what a previous process persisted: the frozen flag, the mandate the
   * person saved, and their recent receipts. Once. A session that has been
   * hydrated publishes its mandate, so a pane that opened before the load
   * finished sees the real one rather than the defaults.
   */
  async hydrate(): Promise<void> {
    this.hydration ??= (async () => {
      const [frozen, saved, recent] = await Promise.all([
        this.deps.store.frozen.load(this.userId),
        this.deps.store.mandates.load(this.userId),
        this.deps.store.receipts.recent(this.userId, RECEIPT_HISTORY),
      ]);
      if (saved !== null) {
        this.mandate = { ...saved, frozen, sessionId: this.id };
      } else if (frozen) {
        this.mandate = { ...this.mandate, frozen };
      }
      const known = new Set(this.receipts.map((receipt) => receipt.id));
      for (const receipt of recent.toReversed()) {
        if (!known.has(receipt.id)) {
          this.receipts.unshift(receipt);
        }
      }
      this.deps.onMandate?.(this.mandate);
    })();
    await this.hydration;
  }

  async recentReceipts(limit = RECEIPT_HISTORY): Promise<readonly Receipt[]> {
    const stored = await this.deps.store.receipts.recent(this.userId, limit);
    const known = new Set(stored.map((receipt) => receipt.id));
    const unsaved = this.receipts
      .toReversed()
      .filter((receipt) => !known.has(receipt.id));
    return [...unsaved, ...stored].slice(0, limit);
  }

  setAddresses(addresses: WalletAddresses): void {
    this.addresses = addresses;
  }

  /**
   * May the agent send a request to this host at all?
   *
   * Asked *before* the request, not after. `x402_fetch` used to fetch the
   * model's URL first and consult the policy only once a 402 came back, which
   * meant a prompt injection could make the server issue an arbitrary outbound
   * request — to a metadata endpoint, to something on the private network, to
   * anything reachable from the container — and the "refusal" happened long
   * after the damage.
   *
   * The allowlist was always the control. This is what makes it one.
   */
  allowsHost(host: string): boolean {
    for (const rule of this.mandate.rules) {
      if (rule._tag === "host_allowlist") {
        return rule.hosts.includes(host);
      }
    }
    // No rule means no allowlist, and no allowlist means nothing is allowed.
    // The other reading — "unconstrained" — is how an empty policy becomes a
    // permissive one.
    return false;
  }

  setAgentSigner(state: AgentSignerState, note: string | null): void {
    this.agentSigner = state;
    this.agentNote = note;
  }

  /**
   * Replace the mandate.
   *
   * The session id is forced rather than trusted: a client that posts someone
   * else's mandate must not be able to reparent it, and `frozen` is preserved
   * from the current mandate so a mandate edit can never be a way to unfreeze.
   * Unfreezing is its own message.
   */
  updateMandate(next: Mandate): Mandate {
    this.mandate = { ...next, frozen: this.mandate.frozen, sessionId: this.id };
    this.persistMandate();
    return this.mandate;
  }

  setFrozen(frozen: boolean): Mandate {
    this.mandate = { ...this.mandate, frozen };
    // The flag is the kill switch; it must outlive the process. Persisted
    // after the in-memory flip, never instead of it.
    detached("frozen persist", async () => {
      await this.deps.store.frozen.save(this.userId, frozen);
    });
    this.persistMandate();
    return this.mandate;
  }

  /**
   * Never throws.
   *
   * It is read on a socket open and from a fire-and-forget publish, so an
   * exception here used to become an unhandled rejection and take the whole
   * process down — which is how a Postgres service that had not finished
   * provisioning turned into a 502 on every route. Spending still fails closed
   * when the ledger is unreadable, because `spend` reads it separately and
   * does throw; this is a *display* path, and a display path must degrade.
   */
  async walletSummary(): Promise<WalletSummary> {
    const since = this.now() - widestWindowMs(this.mandate);
    let spent = 0;
    let ledgerNote: string | null = null;
    try {
      const rows = await this.deps.ledger.since(this.userId, since);
      for (const row of rows) {
        spent += row.usdMicros;
      }
    } catch (error) {
      ledgerNote = `Spend history unavailable: ${
        error instanceof Error ? error.message : "unknown error"
      }. The figure below is a floor, and payments will be refused.`;
    }
    return {
      // The *signer*, not the smart account. The Graph's x402 leg is an
      // EIP-3009 authorization signed by the address that holds the USDC, and
      // the smart wallet on this app is configured for Base Sepolia only — so
      // showing it here would tell someone to fund the wrong address on the
      // wrong chain.
      address: this.addresses.signer,
      agentNote: this.agentNote,
      agentSigner: this.agentSigner,
      balanceLabel:
        this.deps.modes.privy === "stub" ? "balance unavailable (stub)" : "—",
      ledgerNote,
      signerAddress: this.addresses.signer,
      windowSpentUsdMicros: spent,
    };
  }

  async spend(request: SpendRequest): Promise<SpendResult> {
    const key = request.idempotencyKey;

    // Read and claimed with no `await` in between, which is the whole point:
    // two concurrent calls used to both get past this check, both reserve a
    // row that already read `reserved`, and both pay. Reproduced as
    // "settle() ran 2 time(s)".
    const joined = this.settlements.get(key);
    if (joined !== undefined) {
      return await this.join(request, joined);
    }
    const claim = Promise.withResolvers<Settled>();
    this.settlements.set(key, claim.promise);

    try {
      return await this.pay(request, claim.resolve);
    } finally {
      this.settlements.delete(key);
      // Idempotent: resolving an already-resolved promise is a no-op. This is
      // for the throw path, so a joiner is never left waiting on a payment
      // that will never happen.
      claim.resolve(unpaid(request));
    }
  }

  // -- internals -----------------------------------------------------------

  private persistMandate(): void {
    const { mandate } = this;
    detached("mandate persist", async () => {
      await this.deps.store.mandates.save(this.userId, mandate);
    });
  }

  /** Run `work` after every judgement queued before it has finished. */
  private async serial<T>(work: () => Promise<T>): Promise<T> {
    const previous = this.gate;
    const next = (async () => {
      // The predecessor's outcome is irrelevant; only its completion matters.
      try {
        await previous;
      } catch {
        swallow();
      }
      return await work();
    })();
    // The stored chain must never reject, or the next caller inherits it.
    this.gate = (async () => {
      try {
        await next;
      } catch {
        swallow();
      }
    })();
    return await next;
  }

  /**
   * Price the intent and ask the policy. No side effects, no money.
   *
   * Split out so both the paying path and the joining path build the same
   * receipt from the same decision — a caller that lost the race still gets a
   * receipt saying what the policy thought, not a blank one.
   */
  private async judge(
    request: SpendRequest,
    approved = false
  ): Promise<Judged> {
    const at = this.now();
    // Recorded on the receipt rather than assumed, so a receipt says what rate
    // it was judged against — and so a rate that later turns out to have been
    // wrong is visible rather than inferred.
    const quote = this.deps.quote(request.amount.asset, at);
    if (quote === null) {
      throw new UnpricedAssetError(request.amount.asset.symbol);
    }

    // Decoded, not assembled. The amount's `units` came from a tool argument
    // and a tool argument came from the model; the schema is what refuses a
    // negative, fractional or non-numeric one before a cap compares it.
    const draft: Draft<SpendIntent, "host" | "usdMicros"> = {
      amount: request.amount,
      idempotencyKey: request.idempotencyKey,
      payee: {
        id: request.payeeId,
        label: request.payeeLabel,
        provenance: request.provenance,
      },
      purpose: request.purpose,
    };
    if (request.host !== undefined) {
      draft.host = request.host;
    }
    const decoded = decodeIntent({ ...draft, usdMicros: 0 });
    if (decoded._tag === "Failure") {
      throw new MalformedSpendError(String(decoded.failure));
    }
    const usdMicros: UsdMicros = priceInUsdMicros(
      decoded.success.amount,
      quote
    );
    const intent: SpendIntent = { ...decoded.success, usdMicros };

    const since = at - widestWindowMs(this.mandate);
    const recent = await this.deps.ledger.since(this.userId, since);
    const decision = authorize({
      approved,
      intent,
      mandate: this.mandate,
      now: at,
      recent: recent.map((row) => ({ at: row.at, usdMicros: row.usdMicros })),
    });

    // Published before anything else happens, so the wallet pane shows the
    // refusal before the model has narrated it. The demo's whole point is that
    // the rejection did not come from the model.
    this.deps.onPolicyDecision(decision);
    return { at, decision, intent, quote, usdMicros };
  }

  /**
   * Somebody else is already paying for this key.
   *
   * The receipt is still built and still carries the policy's decision — a
   * retried tool call deserves an answer, not silence — but no money moves and
   * the settlement is whatever the first caller actually achieved.
   */
  private async join(
    request: SpendRequest,
    settling: Promise<Settled>
  ): Promise<SpendResult> {
    const [judged, outcome] = await Promise.all([
      this.judge(request),
      settling,
    ]);
    return this.finish({
      abandoned: null,
      at: judged.at,
      decision: judged.decision,
      evidence: request.evidence,
      intent: judged.intent,
      quote: judged.quote,
      runId: request.runId,
      settlement:
        outcome.transactionId === null
          ? undefined
          : {
              network: outcome.network,
              transactionId: outcome.transactionId,
            },
      spendId: SpendId.generate(),
      stubbed: outcome.stubbed,
    });
  }

  /**
   * Judge and, if allowed, reserve — under the lock. A refusal is filed as a
   * row; an `ask` files nothing yet, because the answer decides what it was.
   */
  private async judgeAndReserve(
    request: SpendRequest,
    approved: boolean
  ): Promise<{
    readonly judged: Judged;
    readonly reservation: Awaited<ReturnType<SpendLedger["reserve"]>> | null;
    readonly spendId: SpendId;
  }> {
    return await this.serial(async () => {
      const judged = await this.judge(request, approved);
      const spendId = SpendId.generate();
      if (judged.decision._tag === "ask") {
        return { judged, reservation: null, spendId };
      }
      if (judged.decision._tag !== "allow") {
        await this.refuse(request, judged, spendId);
        return { judged, reservation: null, spendId };
      }
      const reservation = await this.deps.ledger.reserve({
        at: judged.at,
        id: spendId,
        idempotencyKey: request.idempotencyKey,
        usdMicros: judged.usdMicros,
        userId: this.userId,
      });
      return { judged, reservation, spendId };
    });
  }

  /**
   * A refusal is a row too. Allowed to fail: the receipt is the record the
   * person reads, and a ledger that cannot take the note must not turn a
   * clean refusal into an error.
   */
  private async refuse(
    request: SpendRequest,
    judged: Judged,
    spendId: SpendId
  ): Promise<void> {
    try {
      await this.deps.ledger.refuse({
        at: judged.at,
        id: spendId,
        idempotencyKey: request.idempotencyKey,
        usdMicros: judged.usdMicros,
        userId: this.userId,
      });
    } catch {
      // See above.
    }
  }

  /**
   * The policy said `ask`. Put the card up, wait, and turn the answer into
   * what happens next — outside the lock, because a person takes minutes and
   * every other spend of theirs would otherwise queue behind the question.
   */
  private async consult(
    request: SpendRequest,
    judged: Judged
  ): Promise<{
    readonly approval: ApprovalRecord;
    readonly reason: string | null;
  }> {
    const id = ApprovalId.generate();
    const { ask } = this.deps;
    if (
      ask === undefined ||
      request.interactive === false ||
      request.signal === undefined
    ) {
      return { approval: { id, resolution: "unavailable" }, reason: null };
    }
    const { intent } = judged;
    const outcome = await ask({
      request: {
        amountLabel: formatUsd(intent.usdMicros),
        detail: `${intent.purpose}. Over the automatic limit, so it is your call.`,
        expiresAt: judged.at + APPROVAL_TTL_MS,
        id,
        options: approvalOptions(),
        payeeLabel: intent.payee.label,
        purpose: intent.purpose,
        title: `Approve ${formatUsd(intent.usdMicros)} to ${intent.payee.label}?`,
      },
      signal: request.signal,
    });
    const resolution = resolutionOf(outcome);
    if (resolution === "allow_session") {
      this.exempt(intent, judged.at);
    }
    return {
      approval: { id, resolution },
      reason: outcome.kind === "aborted" ? outcome.reason : null,
    };
  }

  /**
   * "Allow for this session": one payee, this amount as the ceiling, a day.
   *
   * Appended as a rule rather than remembered in a variable, so it survives a
   * restart, shows in the mandate editor and can be deleted there like any
   * other rule.
   */
  private exempt(intent: SpendIntent, at: number): void {
    this.mandate = {
      ...this.mandate,
      rules: [
        ...this.mandate.rules,
        {
          _tag: "ask_exemption",
          id: RuleIdSchema.generate(),
          maxUsdMicros: intent.usdMicros,
          notAfter: at + EXEMPTION_TTL_MS,
          payeeId: intent.payee.id,
        },
      ],
    };
    this.persistMandate();
    this.deps.onMandate?.(this.mandate);
  }

  private async pay(
    request: SpendRequest,
    publish: (outcome: Settled) => void
  ): Promise<SpendResult> {
    let attempt = await this.judgeAndReserve(request, false);
    let approval: ApprovalRecord | undefined;

    if (attempt.judged.decision._tag === "ask") {
      const { ruleId } = attempt.judged.decision;
      const asked = await this.consult(request, attempt.judged);
      ({ approval } = asked);
      const { resolution } = approval;
      if (resolution === "allow_once" || resolution === "allow_session") {
        // Judged again, with the answer in hand: the mandate may have frozen
        // while the card was open, and the window may have filled.
        attempt = await this.judgeAndReserve(request, true);
      } else {
        const decision = refusalFor(resolution, ruleId, asked.reason);
        this.deps.onPolicyDecision(decision);
        const judged: Judged = { ...attempt.judged, decision };
        await this.refuse(request, judged, attempt.spendId);
        attempt = { judged, reservation: null, spendId: attempt.spendId };
      }
    }

    const { judged, reservation, spendId } = attempt;
    const { at, decision, intent, quote } = judged;

    if (reservation === null) {
      return this.finish({
        abandoned: null,
        approval,
        at,
        decision,
        intent,
        quote,
        runId: request.runId,
        spendId,
        stubbed: false,
      });
    }

    const { created, row } = reservation;
    if (!created) {
      // Another *process* owns this spend — the in-process claim above cannot
      // see it, only the unique index can. There is no promise to join, so the
      // receipt honestly carries no settlement rather than inventing one.
      return this.finish({
        abandoned: null,
        approval,
        at,
        decision,
        evidence: request.evidence,
        intent,
        quote,
        runId: request.runId,
        spendId: row.id,
        stubbed: false,
      });
    }

    // The last look before money leaves. A freeze or a stop that landed while
    // the reservation was being written must win here, not after the call.
    let abandoned: string | null = null;
    if (this.mandate.frozen) {
      abandoned = "the wallet was frozen before the payment was sent";
    } else if (request.signal?.aborted === true) {
      abandoned = "the run was stopped before the payment was sent";
    }
    if (abandoned !== null) {
      publish(unpaid(request));
      await this.deps.ledger.settle(row.id, "abandoned");
      return this.finish({
        abandoned,
        approval,
        at,
        decision,
        evidence: request.evidence,
        intent,
        quote,
        runId: request.runId,
        spendId: row.id,
        stubbed: false,
      });
    }

    const outcome = await request.settle().catch(() => unpaid(request));
    publish(outcome);
    await this.deps.ledger.settle(row.id, outcome.ok ? "settled" : "failed");

    return this.finish({
      abandoned: null,
      approval,
      at,
      decision,
      evidence: request.evidence,
      intent,
      quote,
      runId: request.runId,
      settlement:
        outcome.transactionId === null
          ? undefined
          : { network: outcome.network, transactionId: outcome.transactionId },
      spendId: row.id,
      stubbed: outcome.stubbed,
    });
  }

  private finish(input: {
    readonly abandoned: string | null;
    readonly approval?: ApprovalRecord | undefined;
    readonly at: number;
    readonly decision: PolicyDecision;
    readonly evidence?: Evidence | undefined;
    readonly intent: SpendIntent;
    readonly quote: Quote;
    readonly runId: RunIdValue;
    readonly settlement?: Receipt["settlement"];
    readonly spendId: SpendId;
    readonly stubbed: boolean;
  }): SpendResult {
    const draft: Draft<Receipt, "approval" | "evidence" | "settlement"> = {
      at: input.at,
      decision: input.decision,
      id: ReceiptId.generate(),
      intent: input.intent,
      quote: input.quote,
      runId: input.runId,
      sessionId: this.id,
      spendId: input.spendId,
      // A receipt is stubbed if *anything* in its chain was: a real payment
      // against fixture evidence is still not a real answer.
      stubbed: input.stubbed || (input.evidence?.stubbed ?? false),
    };
    if (input.approval !== undefined) {
      draft.approval = input.approval;
    }
    if (input.evidence !== undefined) {
      draft.evidence = input.evidence;
    }
    if (input.settlement !== undefined) {
      draft.settlement = input.settlement;
    }
    const receipt: Receipt = draft;
    this.receipts.push(receipt);
    detached("receipt persist", async () => {
      await this.deps.store.receipts.append(this.userId, receipt);
    });
    this.deps.onReceipt(receipt);
    return { abandoned: input.abandoned, decision: input.decision, receipt };
  }
}
