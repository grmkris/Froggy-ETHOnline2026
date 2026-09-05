/**
 * A workspace session: one human, one mandate, one spend history.
 *
 * The `spend` method here is the choke point. Every path that moves money — the
 * x402 tool, a transfer, anything added later — goes through it, and it does
 * the same five things in the same order every time: price the intent, ask the
 * policy, reserve on the ledger, perform the side effect, write the receipt.
 *
 * Reserving *before* the side effect is what makes concurrent tool calls safe.
 * Writing the receipt regardless of outcome is what makes a refusal as
 * auditable as a payment: "it did not spend" and "it was told not to" are
 * different facts, and only one of them is reassuring.
 */

import {
  MandateId,
  ReceiptId,
  RuleId as RuleIdSchema,
  SpendId,
  defaultRules,
  priceInUsdMicros,
} from "@froggy/domain";
import type {
  Amount,
  Mandate,
  PolicyDecision,
  Quote,
  Receipt,
  RunId as RunIdValue,
  SessionId,
  SpendIntent,
  Evidence,
  UsdMicros,
  UserId,
} from "@froggy/domain";
import type {
  AgentSignerState,
  ServiceModes,
  WalletSummary,
} from "@froggy/protocol";
import { authorize } from "@froggy/wallet";
import type { SpendLedger, WalletAddresses } from "@froggy/wallet";

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
  readonly payeeId: string;
  readonly payeeLabel: string;
  readonly purpose: string;
  /** How we learned the payee. `page` and `model` are never payable. */
  readonly provenance: SpendIntent["payee"]["provenance"];
  /** The turn this spend belongs to, so a receipt can be traced back to it. */
  readonly runId: RunIdValue;
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

/** No money moved. The shape a failed or abandoned settlement reports. */
const unpaid = (request: SpendRequest): Settled => ({
  network: request.amount.asset.network,
  ok: false,
  stubbed: false,
  transactionId: null,
});

export interface SpendResult {
  readonly decision: PolicyDecision;
  readonly receipt: Receipt;
}

export interface SessionDeps {
  readonly ledger: SpendLedger;
  readonly modes: ServiceModes;
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
}

/**
 * The window the wallet pane's "spent so far" figure covers.
 *
 * It is the widest window any rule declares, so the number on screen is the one
 * the binding rule is actually using rather than a separate approximation that
 * disagrees with the refusal message.
 */
const DEFAULT_WINDOW_MS = 24 * 60 * 60 * 1000;

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

const widestWindowMs = (mandate: Mandate): number => {
  let widest = DEFAULT_WINDOW_MS;
  for (const rule of mandate.rules) {
    if (rule._tag === "window_cap") {
      widest = Math.max(widest, rule.windowMs);
    }
  }
  return widest;
};

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

  get history(): readonly Receipt[] {
    return this.receipts;
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
    return this.mandate;
  }

  setFrozen(frozen: boolean): Mandate {
    this.mandate = { ...this.mandate, frozen };
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

  /**
   * Price the intent and ask the policy. No side effects, no money.
   *
   * Split out so both the paying path and the joining path build the same
   * receipt from the same decision — a caller that lost the race still gets a
   * receipt saying what the policy thought, not a blank one.
   */
  private async judge(request: SpendRequest): Promise<{
    readonly at: number;
    readonly decision: PolicyDecision;
    readonly intent: SpendIntent;
    readonly quote: Quote;
    readonly usdMicros: UsdMicros;
  }> {
    const at = this.now();
    // Recorded on the receipt rather than assumed, so a receipt says what rate
    // it was judged against — and so a rate that later turns out to have been
    // wrong is visible rather than inferred.
    const quote = this.deps.quote(request.amount.asset, at);
    if (quote === null) {
      throw new UnpricedAssetError(request.amount.asset.symbol);
    }
    const usdMicros: UsdMicros = priceInUsdMicros(request.amount, quote);

    // Built as a draft and narrowed, rather than assembled with conditional
    // spreads: `exactOptionalPropertyTypes` makes `host: undefined` different
    // from an absent `host`, and a spread hides which of the two you got.
    const draft: Draft<SpendIntent, "host"> = {
      amount: request.amount,
      idempotencyKey: request.idempotencyKey,
      payee: {
        id: request.payeeId,
        label: request.payeeLabel,
        provenance: request.provenance,
      },
      purpose: request.purpose,
      usdMicros,
    };
    if (request.host !== undefined) {
      draft.host = request.host;
    }
    const intent: SpendIntent = draft;

    const since = at - widestWindowMs(this.mandate);
    const recent = await this.deps.ledger.since(this.userId, since);
    const decision = authorize({
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

  private async pay(
    request: SpendRequest,
    publish: (outcome: Settled) => void
  ): Promise<SpendResult> {
    const { at, decision, intent, quote, usdMicros } =
      await this.judge(request);

    const spendId = SpendId.generate();
    if (decision._tag !== "allow") {
      return this.finish({
        at,
        decision,
        intent,
        quote,
        runId: request.runId,
        spendId,
        stubbed: false,
      });
    }

    const { created, row } = await this.deps.ledger.reserve({
      at,
      id: spendId,
      idempotencyKey: request.idempotencyKey,
      usdMicros,
      userId: this.userId,
    });

    if (!created) {
      // Another *process* owns this spend — the in-process claim above cannot
      // see it, only the unique index can. There is no promise to join, so the
      // receipt honestly carries no settlement rather than inventing one.
      return this.finish({
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
    const draft: Draft<Receipt, "evidence" | "settlement"> = {
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
    if (input.evidence !== undefined) {
      draft.evidence = input.evidence;
    }
    if (input.settlement !== undefined) {
      draft.settlement = input.settlement;
    }
    const receipt: Receipt = draft;
    this.receipts.push(receipt);
    this.deps.onReceipt(receipt);
    return { decision: input.decision, receipt };
  }
}
