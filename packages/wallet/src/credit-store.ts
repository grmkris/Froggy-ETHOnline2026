import {
  CreditChargeId,
  CreditEntryId,
  CreditPurchase,
  CreditUnits,
  creditUnits,
  CreditLimits,
} from "@froggy/domain";
import type {
  CreditCharge,
  CreditLedgerEntry,
  CreditPurchaseId,
  RunId,
  Task,
  TaskId,
  UserId,
  CreditSummary,
} from "@froggy/domain";
import { Schema } from "effect";

export const FundingPurchase = Schema.Struct({
  ...CreditPurchase.fields,
  idempotencyKey: Schema.String,
  requestFingerprint: Schema.String,
  challenge: Schema.Unknown,
  proofHash: Schema.NullOr(Schema.String),
  authorizationKey: Schema.NullOr(Schema.String),
  paymentHeader: Schema.NullOr(Schema.String),
  signedTransaction: Schema.NullOr(Schema.String),
  transactionNonce: Schema.NullOr(Schema.Int),
});
export type FundingPurchase = typeof FundingPurchase.Type;
export type CreditTaskPatch = Partial<
  Pick<Task, "status" | "result" | "error" | "runId" | "updatedAt">
>;
export type FundingPatch = Partial<
  Pick<
    FundingPurchase,
    | "transactionId"
    | "signedTransaction"
    | "transactionNonce"
    | "error"
    | "updatedAt"
  >
> & { readonly status?: "pending" | "failed" | "uncertain" };
export interface CreditTaskResult {
  readonly task: Task;
  readonly charge: CreditCharge;
  readonly replayed: boolean;
}
export interface CreditStore {
  readonly summary: (
    owner: UserId,
    initialLimits?: CreditLimits
  ) => Promise<CreditSummary>;
  readonly setLimits: (
    owner: UserId,
    limits: CreditLimits
  ) => Promise<CreditSummary>;
  readonly entries: (
    owner: UserId,
    limit?: number
  ) => Promise<readonly CreditLedgerEntry[]>;
  readonly reserveTask: (
    owner: UserId,
    task: Task,
    options?: {
      readonly initialLimits?: CreditLimits;
      readonly stubbed?: boolean;
      readonly now?: number;
      readonly runBudgetUnits?: CreditUnits;
    }
  ) => Promise<CreditTaskResult>;
  readonly finishTask: (
    owner: UserId,
    id: TaskId,
    patch: CreditTaskPatch,
    outcome: "capture" | "release" | "uncertain",
    now?: number
  ) => Promise<CreditTaskResult>;
  readonly findCharge: (
    owner: UserId,
    id: TaskId
  ) => Promise<CreditCharge | null>;
  readonly pendingTasks: (
    limit?: number
  ) => Promise<readonly { userId: UserId; task: Task }[]>;
  readonly createFunding: (
    owner: UserId,
    purchase: FundingPurchase,
    initialLimits?: CreditLimits
  ) => Promise<{
    purchase: FundingPurchase;
    replayed: boolean;
  }>;
  readonly fundingByKey: (
    owner: UserId,
    key: string
  ) => Promise<FundingPurchase | null>;
  readonly findFunding: (
    owner: UserId,
    id: CreditPurchaseId
  ) => Promise<FundingPurchase | null>;
  readonly listFunding: (
    owner: UserId,
    limit?: number
  ) => Promise<readonly FundingPurchase[]>;
  readonly pendingFunding: (
    limit?: number
  ) => Promise<readonly { userId: UserId; purchase: FundingPurchase }[]>;
  readonly pendingSettlement: (
    network: CreditPurchase["network"],
    exceptPurchaseId?: CreditPurchaseId
  ) => Promise<boolean>;
  readonly claimFunding: (
    owner: UserId,
    id: CreditPurchaseId,
    proof: {
      readonly proofHash: string;
      readonly authorizationKey: string;
      readonly paymentHeader: string;
    },
    now?: number
  ) => Promise<{ purchase: FundingPurchase; claimed: boolean }>;
  readonly updateFunding: (
    owner: UserId,
    id: CreditPurchaseId,
    patch: FundingPatch
  ) => Promise<FundingPurchase>;
  readonly confirmFunding: (
    owner: UserId,
    id: CreditPurchaseId,
    result: {
      readonly transactionId: string;
      readonly stubbed?: boolean;
      readonly now?: number;
    }
  ) => Promise<CreditSummary>;
}

export class CreditStoreError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "CreditStoreError";
  }
}

/** All methods share the same account lock and database transaction. */
export interface CreditTransaction {
  readonly account: CreditSummary;
  readonly saveAccount: (account: CreditSummary) => void | Promise<void>;
  readonly task: (id: TaskId) => Task | null | Promise<Task | null>;
  readonly taskByKey: (key: string) => Task | null | Promise<Task | null>;
  readonly activeBrowse: (except: TaskId) => boolean | Promise<boolean>;
  readonly saveTask: (task: Task) => void | Promise<void>;
  readonly charge: (
    id: TaskId
  ) => CreditCharge | null | Promise<CreditCharge | null>;
  readonly recentCharges: (
    since: number
  ) => readonly CreditCharge[] | Promise<readonly CreditCharge[]>;
  readonly runCharges: (
    id: RunId
  ) => readonly CreditCharge[] | Promise<readonly CreditCharge[]>;
  readonly saveCharge: (charge: CreditCharge) => void | Promise<void>;
  readonly funding: (
    id: CreditPurchaseId
  ) => FundingPurchase | null | Promise<FundingPurchase | null>;
  readonly fundingByKey: (
    key: string
  ) => FundingPurchase | null | Promise<FundingPurchase | null>;
  readonly conflictingFundingMode: (
    stubbed: boolean
  ) => boolean | Promise<boolean>;
  readonly saveFunding: (purchase: FundingPurchase) => void | Promise<void>;
  readonly append: (entry: CreditLedgerEntry) => void | Promise<void>;
}
export interface CreditRepository {
  readonly transact: <T>(
    owner: UserId,
    initialLimits: CreditLimits | undefined,
    operation: (tx: CreditTransaction) => T | Promise<T>
  ) => Promise<T>;
  readonly entries: CreditStore["entries"];
  readonly listFunding: CreditStore["listFunding"];
  readonly pendingFunding: CreditStore["pendingFunding"];
  readonly pendingSettlement: CreditStore["pendingSettlement"];
  readonly pendingTasks: CreditStore["pendingTasks"];
}

const conflict = (message: string): never => {
  throw new CreditStoreError("credit_conflict", message);
};
const requireFunding = async (tx: CreditTransaction, id: CreditPurchaseId) => {
  const purchase = await tx.funding(id);
  if (!purchase) {
    throw new CreditStoreError("not_found", "Credit purchase not found.");
  }
  return purchase;
};
const requireFundingMode = async (tx: CreditTransaction, stubbed: boolean) => {
  const funded =
    tx.account.availableUnits +
      tx.account.reservedUnits +
      tx.account.spentUnits >
    0;
  if (
    (funded && tx.account.stubbed !== stubbed) ||
    (await tx.conflictingFundingMode(stubbed))
  ) {
    conflict(
      "Simulated credits and real purchased credits cannot share an account."
    );
  }
};
const entry = (input: Omit<CreditLedgerEntry, "id">): CreditLedgerEntry => ({
  id: CreditEntryId.generate(),
  ...input,
});
const comparableInput = (input: Task["input"]) => {
  const quote = Schema.decodeUnknownResult(
    Schema.Record(Schema.String, Schema.Unknown)
  )(input["quote"]);
  return quote._tag === "Success"
    ? {
        ...input,
        quote: Object.fromEntries(
          Object.entries(quote.success).filter(
            ([key]) => key !== "taskId" && key !== "expiresAt"
          )
        ),
      }
    : input;
};
const sameTaskRequest = (earlier: Task, input: Task) =>
  earlier.kind === input.kind &&
  earlier.connectionId === input.connectionId &&
  earlier.priceUsdMicros === input.priceUsdMicros &&
  Bun.deepEquals(
    comparableInput(earlier.input),
    comparableInput(input.input),
    true
  );

const held = (charge: CreditCharge) =>
  charge.status === "reserved" || charge.status === "uncertain";
const limitsRefusal = (
  account: CreditSummary,
  units: number,
  recent: readonly CreditCharge[],
  now: number
) => {
  const { limits } = account;
  if (limits.frozen) {
    return "credit_frozen: Credit spending is frozen.";
  }
  if (limits.expiresAt !== null && limits.expiresAt <= now) {
    return "credit_expired: Credit spending permission expired.";
  }
  if (units > limits.perTaskUnits) {
    return "credit_task_cap: This task exceeds your credit limit per task.";
  }
  const used = recent.reduce(
    (sum, charge) =>
      sum + (held(charge) || charge.status === "captured" ? charge.units : 0),
    0
  );
  if (used + units > limits.dailyUnits) {
    return "credit_daily_cap: This task exceeds your rolling 24-hour credit limit.";
  }
  if (units > account.availableUnits) {
    return "insufficient_credits: Buy credits before starting this task.";
  }
  return null;
};

type ReserveOptions = NonNullable<Parameters<CreditStore["reserveTask"]>[2]>;
const reservationRefusal = async (
  tx: CreditTransaction,
  task: Task,
  units: CreditUnits,
  options: ReserveOptions,
  now: number
): Promise<string | null> => {
  let refusal = limitsRefusal(
    tx.account,
    units,
    await tx.recentCharges(now - 86_400_000),
    now
  );
  if (
    refusal === null &&
    task.kind === "browse" &&
    (await tx.activeBrowse(task.id))
  ) {
    refusal =
      "credit_browser_busy: Another browser task is active. Finish or cancel it first.";
  }
  if (refusal === null && options.runBudgetUnits !== undefined) {
    const runCharges =
      task.runId === null ? [] : await tx.runCharges(task.runId);
    const used =
      task.runId === null
        ? options.runBudgetUnits
        : runCharges.reduce(
            (sum, prior) =>
              sum +
              (held(prior) || prior.status === "captured" ? prior.units : 0),
            0
          );
    if (used + units > options.runBudgetUnits) {
      refusal =
        "credit_run_cap: This task exceeds the run's remaining credit budget.";
    }
  }
  if (refusal === null && (options.stubbed === true) !== tx.account.stubbed) {
    refusal =
      "credit_mode_mismatch: Simulated tasks and real purchased credits are kept separate.";
  }
  return refusal;
};

export const makeCreditStore = (repository: CreditRepository): CreditStore => ({
  summary: async (owner, initialLimits) =>
    await repository.transact(owner, initialLimits, (tx) => tx.account),
  setLimits: async (owner, limits) =>
    await repository.transact(owner, undefined, async (tx) => {
      const next = {
        ...tx.account,
        limits: Schema.decodeUnknownSync(CreditLimits)(limits),
      };
      await tx.saveAccount(next);
      return next;
    }),
  entries: repository.entries,
  listFunding: repository.listFunding,
  pendingFunding: repository.pendingFunding,
  pendingSettlement: repository.pendingSettlement,
  pendingTasks: repository.pendingTasks,
  findCharge: async (owner, id) =>
    await repository.transact(
      owner,
      undefined,
      async (tx) => await tx.charge(id)
    ),
  reserveTask: async (owner, input, options = {}) =>
    await repository.transact(owner, options.initialLimits, async (tx) => {
      if (input.idempotencyKey === null || input.idempotencyKey === "") {
        return conflict("A paid task requires an idempotency key.");
      }
      const earlier = await tx.taskByKey(input.idempotencyKey);
      if (earlier && !sameTaskRequest(earlier, input)) {
        return conflict(
          "This idempotency key belongs to another task or connection."
        );
      }
      const task = earlier ?? input;
      const existing = await tx.charge(task.id);
      if (existing) {
        return { task, charge: existing, replayed: true };
      }
      if (task.saleId !== null || (earlier && task.status !== "quoted")) {
        return conflict("This task has already been paid or started.");
      }
      const units = Schema.decodeUnknownSync(CreditUnits)(task.priceUsdMicros);
      if (units === 0) {
        return conflict("A credit-priced task must cost at least one unit.");
      }
      const now = options.now ?? Date.now();
      const refusal = await reservationRefusal(tx, task, units, options, now);
      const refused = refusal !== null;
      const charge: CreditCharge = {
        id: CreditChargeId.generate(),
        taskId: task.id,
        connectionId: task.connectionId,
        idempotencyKey: input.idempotencyKey,
        units,
        status: refused ? "refused" : "reserved",
        reason: refusal,
        createdAt: now,
        updatedAt: now,
        stubbed: options.stubbed === true || tx.account.stubbed,
      };
      const updated: Task = {
        ...task,
        chargeId: charge.id,
        priceCreditUnits: units,
        chargeStatus: charge.status,
        status: refused ? "failed" : "paid",
        error: refusal,
        updatedAt: now,
      };
      if (!refused) {
        await tx.saveAccount({
          ...tx.account,
          availableUnits: creditUnits(tx.account.availableUnits - units),
          reservedUnits: creditUnits(tx.account.reservedUnits + units),
        });
      }
      await tx.saveCharge(charge);
      await tx.saveTask(updated);
      await tx.append(
        entry({
          kind: refused ? "refusal" : "reserve",
          units,
          availableDelta: refused ? 0 : 0 - units,
          reservedDelta: refused ? 0 : units,
          chargeId: charge.id,
          purchaseId: null,
          taskId: task.id,
          at: now,
          note: refusal ?? "Credits reserved for a task.",
          stubbed: charge.stubbed,
        })
      );
      return { task: updated, charge, replayed: false };
    }),
  finishTask: async (owner, id, patch, outcome, now = Date.now()) =>
    await repository.transact(owner, undefined, async (tx) => {
      const task = await tx.task(id);
      const before = await tx.charge(id);
      if (!task || !before) {
        throw new CreditStoreError("not_found", "Credit task not found.");
      }
      if (!held(before)) {
        return { task, charge: before, replayed: true };
      }
      const statuses = {
        capture: "captured",
        release: "released",
        uncertain: "uncertain",
      } as const;
      const status = statuses[outcome];
      const charge: CreditCharge = {
        ...before,
        status,
        reason: patch.error ?? null,
        updatedAt: now,
      };
      const updated: Task = {
        ...task,
        ...patch,
        chargeStatus: status,
        updatedAt: patch.updatedAt ?? now,
      };
      if (outcome !== "uncertain") {
        const { units } = before;
        await tx.saveAccount({
          ...tx.account,
          reservedUnits: creditUnits(tx.account.reservedUnits - units),
          availableUnits: creditUnits(
            tx.account.availableUnits + (outcome === "release" ? units : 0)
          ),
          spentUnits: creditUnits(
            tx.account.spentUnits + (outcome === "capture" ? units : 0)
          ),
        });
        await tx.append(
          entry({
            kind: outcome,
            units,
            availableDelta: outcome === "release" ? units : 0,
            reservedDelta: 0 - units,
            chargeId: charge.id,
            purchaseId: null,
            taskId: id,
            at: now,
            note:
              patch.error ??
              (outcome === "capture"
                ? "Task completed."
                : "Unused credits returned."),
            stubbed: charge.stubbed,
          })
        );
      }
      await tx.saveCharge(charge);
      await tx.saveTask(updated);
      return { task: updated, charge, replayed: false };
    }),
  createFunding: async (owner, input, initialLimits) =>
    await repository.transact(owner, initialLimits, async (tx) => {
      const purchase = Schema.decodeUnknownSync(FundingPurchase)(input);
      const existing = await tx.fundingByKey(purchase.idempotencyKey);
      if (existing) {
        if (existing.requestFingerprint !== purchase.requestFingerprint) {
          return conflict("This funding key has different terms.");
        }
        return { purchase: existing, replayed: true };
      }
      if (
        purchase.status !== "quoted" ||
        purchase.creditUnits <= 0 ||
        purchase.transactionId !== null ||
        purchase.proofHash !== null ||
        purchase.authorizationKey !== null ||
        purchase.paymentHeader !== null ||
        purchase.signedTransaction !== null
      ) {
        return conflict("A new credit purchase must be an unpaid quote.");
      }
      await requireFundingMode(tx, purchase.stubbed);
      await tx.saveFunding(purchase);
      return { purchase, replayed: false };
    }),
  fundingByKey: async (owner, key) =>
    await repository.transact(
      owner,
      undefined,
      async (tx) => await tx.fundingByKey(key)
    ),
  findFunding: async (owner, id) =>
    await repository.transact(
      owner,
      undefined,
      async (tx) => await tx.funding(id)
    ),
  claimFunding: async (owner, id, proof, now = Date.now()) =>
    await repository.transact(owner, undefined, async (tx) => {
      const purchase = await requireFunding(tx, id);
      if (purchase.proofHash !== null) {
        if (
          purchase.proofHash !== proof.proofHash ||
          purchase.authorizationKey !== proof.authorizationKey
        ) {
          return conflict(
            "This credit purchase already has a different payment. Reconcile it before paying again."
          );
        }
        return { purchase, claimed: false };
      }
      if (purchase.status !== "quoted" || purchase.expiresAt <= now) {
        return conflict(
          "This credit purchase quote expired or is no longer payable."
        );
      }
      if (!proof.proofHash || !proof.authorizationKey || !proof.paymentHeader) {
        return conflict(
          "A payment proof and authorization identity are required."
        );
      }
      // Claim chooses the funding mode under the account lock, before any outbound settlement.
      await requireFundingMode(tx, purchase.stubbed);
      const next: FundingPurchase = {
        ...purchase,
        ...proof,
        status: "pending",
        updatedAt: now,
      };
      await tx.saveFunding(next);
      return { purchase: next, claimed: true };
    }),
  updateFunding: async (owner, id, patch) =>
    await repository.transact(owner, undefined, async (tx) => {
      const purchase = await requireFunding(tx, id);
      if (purchase.status === "confirmed") {
        return purchase;
      }
      if (
        purchase.transactionId !== null &&
        patch.transactionId !== undefined &&
        patch.transactionId !== purchase.transactionId
      ) {
        return conflict("The recorded funding transaction cannot be replaced.");
      }
      if (
        purchase.signedTransaction !== null &&
        patch.signedTransaction !== undefined &&
        patch.signedTransaction !== purchase.signedTransaction
      ) {
        return conflict("The signed funding transaction cannot be replaced.");
      }
      const next = Schema.decodeUnknownSync(FundingPurchase)({
        ...purchase,
        ...patch,
        updatedAt: patch.updatedAt ?? Date.now(),
      });
      await tx.saveFunding(next);
      return next;
    }),
  confirmFunding: async (owner, id, result) =>
    await repository.transact(owner, undefined, async (tx) => {
      const purchase = await requireFunding(tx, id);
      if (purchase.status === "confirmed") {
        if (purchase.transactionId !== result.transactionId) {
          return conflict(
            "This purchase was confirmed by a different transaction."
          );
        }
        return tx.account;
      }
      if (
        purchase.proofHash === null ||
        purchase.authorizationKey === null ||
        !result.transactionId ||
        (purchase.status !== "pending" && purchase.status !== "uncertain")
      ) {
        return conflict(
          "Only a claimed, confirmed payment can create credits."
        );
      }
      if (
        purchase.transactionId !== null &&
        purchase.transactionId !== result.transactionId
      ) {
        return conflict(
          "The funding receipt does not match the recorded transaction."
        );
      }
      const now = result.now ?? Date.now();
      const stubbed = purchase.stubbed || result.stubbed === true;
      await requireFundingMode(tx, stubbed);
      await tx.saveFunding({
        ...purchase,
        status: "confirmed",
        transactionId: result.transactionId,
        error: null,
        updatedAt: now,
        stubbed,
      });
      const account = {
        ...tx.account,
        availableUnits: creditUnits(
          tx.account.availableUnits + purchase.creditUnits
        ),
        stubbed: tx.account.stubbed || stubbed,
      };
      await tx.saveAccount(account);
      await tx.append(
        entry({
          kind: "funding",
          units: purchase.creditUnits,
          availableDelta: purchase.creditUnits,
          reservedDelta: 0,
          chargeId: null,
          purchaseId: id,
          taskId: null,
          at: now,
          note: "Credit purchase confirmed.",
          stubbed,
        })
      );
      return account;
    }),
});
