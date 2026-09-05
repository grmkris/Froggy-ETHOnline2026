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
  parQuote,
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
import type { ServiceModes, WalletSummary } from "@froggy/protocol";
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

export interface SpendResult {
  readonly decision: PolicyDecision;
  readonly receipt: Receipt;
}

export interface SessionDeps {
  readonly ledger: SpendLedger;
  readonly modes: ServiceModes;
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
  private addresses: WalletAddresses = { signer: null, smart: null };

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

  async walletSummary(): Promise<WalletSummary> {
    const since = this.now() - widestWindowMs(this.mandate);
    const rows = await this.deps.ledger.since(this.userId, since);
    let spent = 0;
    for (const row of rows) {
      spent += row.usdMicros;
    }
    return {
      address: this.addresses.smart,
      balanceLabel:
        this.deps.modes.privy === "stub" ? "balance unavailable (stub)" : "—",
      signerAddress: this.addresses.signer,
      windowSpentUsdMicros: spent,
    };
  }

  async spend(request: SpendRequest): Promise<SpendResult> {
    const at = this.now();
    // Stablecoins and HBAR both get a par quote in this build. It is recorded
    // on the receipt rather than assumed, so the day a real price feed lands
    // the old receipts still say what rate they were judged against.
    const quote: Quote = parQuote(at);
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

    const row = await this.deps.ledger.reserve({
      at,
      id: spendId,
      idempotencyKey: request.idempotencyKey,
      usdMicros,
      userId: this.userId,
    });

    if (row.status === "settled") {
      // This exact spend already happened. A retried tool call must return the
      // first outcome, not pay again.
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

    const outcome = await request.settle().catch(() => ({
      network: intent.amount.asset.network,
      ok: false,
      stubbed: false,
      transactionId: null,
    }));

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
