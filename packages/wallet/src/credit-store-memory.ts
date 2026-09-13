import { creditUnits, defaultCreditLimits } from "@froggy/domain";
import type {
  Allowance,
  CreditCharge,
  CreditLedgerEntry,
  CreditSummary,
  CreditPurchaseId,
  Task,
  TaskId,
  UserId,
} from "@froggy/domain";

import { CreditStoreError, makeCreditStore } from "./credit-store";
import type {
  CreditRepository,
  CreditStore,
  FundingPurchase,
} from "./credit-store";

const count = (limit = 50) => Math.min(1000, Math.max(1, Math.floor(limit)));

export const memoryCreditStore = (
  tasks: Map<TaskId, Task & { userId: UserId }>,
  allowanceFor: (owner: UserId) => Allowance | null = () => null
): CreditStore => {
  const accounts = new Map<UserId, CreditSummary>();
  const charges = new Map<TaskId, CreditCharge & { userId: UserId }>();
  const purchases = new Map<
    CreditPurchaseId,
    FundingPurchase & { userId: UserId }
  >();
  const ledger = new Map<UserId, CreditLedgerEntry[]>();
  let previous: Promise<unknown> = Promise.resolve();
  const transact: CreditRepository["transact"] = async (
    owner,
    initialLimits,
    operation
  ) => {
    const completion = Promise.withResolvers<null>();
    const preceding = previous;
    previous = completion.promise;
    await preceding;
    try {
      let account: CreditSummary = structuredClone(
        accounts.get(owner) ?? {
          v: 1,
          availableUnits: creditUnits(0),
          reservedUnits: creditUnits(0),
          spentUnits: creditUnits(0),
          limits: initialLimits ?? defaultCreditLimits(allowanceFor(owner)),
          stubbed: false,
        }
      );
      const stagedTasks = new Map(
        [...tasks].filter(([, task]) => task.userId === owner)
      );
      const stagedCharges = new Map(
        [...charges].filter(([, charge]) => charge.userId === owner)
      );
      const stagedFunding = new Map(
        [...purchases].filter(([, purchase]) => purchase.userId === owner)
      );
      const stagedEntries: CreditLedgerEntry[] = [];
      const result = await operation({
        account,
        saveAccount: (value) => {
          account = structuredClone(value);
        },
        task: (id) => structuredClone(stagedTasks.get(id) ?? null),
        taskByKey: (key) =>
          structuredClone(
            [...stagedTasks.values()].find(
              (task) => task.idempotencyKey === key
            ) ?? null
          ),
        activeBrowse: (except) =>
          [...stagedTasks.values()].some(
            (task) =>
              task.id !== except &&
              task.kind === "browse" &&
              [
                "paid",
                "running",
                "paused",
                "uncertain",
                "awaiting_approval",
              ].includes(task.status)
          ),
        saveTask: (task) => {
          const other = tasks.get(task.id);
          if (other && other.userId !== owner) {
            throw new CreditStoreError(
              "credit_conflict",
              "Task belongs to another account."
            );
          }
          stagedTasks.set(task.id, structuredClone({ ...task, userId: owner }));
        },
        charge: (id) => structuredClone(stagedCharges.get(id) ?? null),
        recentCharges: (since) =>
          structuredClone(
            [...stagedCharges.values()].filter(
              (charge) =>
                (charge.status === "captured" && charge.updatedAt >= since) ||
                charge.status === "reserved" ||
                charge.status === "uncertain"
            )
          ),
        runCharges: (id) =>
          structuredClone(
            [...stagedCharges.values()].filter(
              (charge) => stagedTasks.get(charge.taskId)?.runId === id
            )
          ),
        saveCharge: (charge) => {
          stagedCharges.set(
            charge.taskId,
            structuredClone({ ...charge, userId: owner })
          );
        },
        funding: (id) => structuredClone(stagedFunding.get(id) ?? null),
        fundingByKey: (key) =>
          structuredClone(
            [...stagedFunding.values()].find(
              (purchase) => purchase.idempotencyKey === key
            ) ?? null
          ),
        conflictingFundingMode: (stubbed) =>
          [...stagedFunding.values()].some(
            (purchase) =>
              purchase.stubbed !== stubbed &&
              (purchase.status === "pending" ||
                purchase.status === "uncertain" ||
                purchase.status === "confirmed")
          ),
        saveFunding: (purchase) => {
          const other = purchases.get(purchase.id);
          if (other && other.userId !== owner) {
            throw new CreditStoreError(
              "credit_conflict",
              "Purchase belongs to another account."
            );
          }
          for (const saved of [
            ...purchases.values(),
            ...stagedFunding.values(),
          ]) {
            if (saved.id === purchase.id) {
              continue;
            }
            if (
              (purchase.proofHash !== null &&
                purchase.proofHash === saved.proofHash) ||
              (purchase.authorizationKey !== null &&
                purchase.authorizationKey === saved.authorizationKey) ||
              (purchase.transactionId !== null &&
                purchase.network === saved.network &&
                purchase.transactionId === saved.transactionId)
            ) {
              throw new CreditStoreError(
                "payment_reused",
                "This payment already belongs to another credit purchase."
              );
            }
          }
          stagedFunding.set(
            purchase.id,
            structuredClone({ ...purchase, userId: owner })
          );
        },
        append: (value) => {
          stagedEntries.push(structuredClone(value));
        },
      });
      accounts.set(owner, account);
      for (const [id, task] of stagedTasks) {
        tasks.set(id, task);
      }
      for (const [id, charge] of stagedCharges) {
        charges.set(id, charge);
      }
      for (const [id, purchase] of stagedFunding) {
        purchases.set(id, purchase);
      }
      ledger.set(owner, [...(ledger.get(owner) ?? []), ...stagedEntries]);
      return structuredClone(result);
    } finally {
      completion.resolve(null);
    }
  };
  return makeCreditStore({
    transact,
    entries: async (owner, limit) =>
      await Promise.resolve(
        structuredClone(
          (ledger.get(owner) ?? []).slice(-count(limit)).toReversed()
        )
      ),
    listFunding: async (owner, limit) =>
      await Promise.resolve(
        structuredClone(
          [...purchases.values()]
            .filter((row) => row.userId === owner)
            .toSorted((a, b) => b.createdAt - a.createdAt)
            .slice(0, count(limit))
        )
      ),
    pendingSettlement: async (network, exceptPurchaseId) =>
      await Promise.resolve(
        [...purchases.values()].some(
          (row) =>
            row.network === network &&
            row.id !== exceptPurchaseId &&
            row.signedTransaction !== null &&
            (row.status === "pending" || row.status === "uncertain")
        )
      ),
    pendingFunding: async (limit) =>
      await Promise.resolve(
        structuredClone(
          [...purchases.values()]
            .filter(
              (row) => row.status === "pending" || row.status === "uncertain"
            )
            .slice(0, count(limit))
            .map((purchase) => ({ userId: purchase.userId, purchase }))
        )
      ),
    pendingTasks: async (limit) =>
      await Promise.resolve(
        structuredClone(
          [...charges.values()]
            .filter(
              (row) => row.status === "reserved" || row.status === "uncertain"
            )
            .flatMap((charge) => {
              const task = tasks.get(charge.taskId);
              return task ? [{ userId: charge.userId, task }] : [];
            })
            .slice(0, count(limit))
        )
      ),
  });
};
