import type { HistoryRecord, Purchase, Task, UserId } from "@froggy/domain";
import type { HistoryBusiness } from "@froggy/protocol";
import type { Store } from "@froggy/wallet";

import { historyPreview } from "./history";

const purchaseEvidence = (purchase: Purchase): HistoryBusiness => ({
  kind: "purchase",
  id: purchase.id,
  status: purchase.status,
  payment: purchase.payment.state,
  delivery: purchase.delivery.state,
  quotedUsdMicros: purchase.quote?.usdMicros ?? null,
  receiptIds: purchase.receiptId === null ? [] : [purchase.receiptId],
  saleId: null,
  approval: {
    id: purchase.approvalId,
    expiresAt: purchase.expiresAt,
    status:
      purchase.status === "awaiting_approval"
        ? "Awaiting answer"
        : purchase.status,
  },
  error:
    purchase.error === null ? null : historyPreview(purchase.error, 1000).text,
});
const taskEvidence = (task: Task): HistoryBusiness => ({
  kind: "task",
  id: task.id,
  status: task.status,
  payment: null,
  delivery: task.status === "done" ? "Result recorded" : task.status,
  quotedUsdMicros: task.priceUsdMicros,
  receiptIds: [],
  saleId: task.saleId,
  approval: null,
  error: task.error === null ? null : historyPreview(task.error, 1000).text,
});
/** Join actual identifiers only. A successful call or a price is not settlement. */
export const historyBusiness = async (
  store: Store,
  userId: UserId,
  record: HistoryRecord,
  related: readonly HistoryRecord[]
): Promise<readonly HistoryBusiness[]> => {
  const executions = [record, ...related].filter(
    (item) => item.kind === "execution"
  );
  const taskIds = new Set(
    executions.flatMap((item) => (item.taskId === null ? [] : [item.taskId]))
  );
  const purchaseIds = new Set(
    executions.flatMap((item) =>
      item.purchaseId === null ? [] : [item.purchaseId]
    )
  );
  const [tasks, purchases, runPurchases] = await Promise.all([
    Promise.all(
      [...taskIds].map(async (id) => await store.tasks.byId(userId, id))
    ),
    Promise.all(
      [...purchaseIds].map(async (id) => await store.purchases.byId(userId, id))
    ),
    record.kind === "run"
      ? store.purchases.forRun(userId, record.id)
      : Promise.resolve([]),
  ]);
  const uniquePurchases = new Map(
    [...purchases, ...runPurchases]
      .filter((item) => item !== null)
      .map((item) => [item.id, item])
  );
  return [
    ...[...uniquePurchases.values()].map(purchaseEvidence),
    ...tasks.filter((item) => item !== null).map(taskEvidence),
  ];
};
