import { listChainNames, visiblePresence, UpdateId } from "@froggy/domain";
import type {
  AddressPresence,
  Update,
  UserId,
  WalletActivity,
  WatchlistItem,
} from "@froggy/domain";
import type { AppServerMessage, Notice } from "@froggy/protocol";
import type { Store } from "@froggy/wallet";

import { flowLine } from "./wallet-activity";

export interface Updates {
  readonly file: (owner: UserId, update: Update) => Promise<Update>;
  readonly announce: (owner: UserId) => Promise<void>;
}
export const createUpdates = (deps: {
  readonly store: Store;
  readonly publishApp?:
    | ((owner: UserId, message: AppServerMessage) => void)
    | undefined;
}): Updates => {
  const announce = async (owner: UserId): Promise<void> => {
    deps.publishApp?.(owner, {
      v: 1,
      type: "updates.changed",
      unread: await deps.store.updates.unread(owner),
    });
  };
  return {
    announce,
    file: async (owner, update) => {
      const saved = await deps.store.updates.save(owner, update);
      await announce(owner);
      return saved;
    },
  };
};
const record = (input: Omit<Update, "v" | "id" | "readAt">): Update => ({
  ...input,
  title: input.title.slice(0, 120),
  body: input.body.slice(0, 1000),
  v: 1,
  id: UpdateId.generate(),
  readAt: null,
});
const chain = (activity: WalletActivity): string =>
  activity.network === "eip155:4663" ? "Robinhood" : "Base";
const finality = (activity: WalletActivity): string =>
  `${chain(activity)} · ${activity.finality === "finalized" ? "confirmed" : "provisional until confirmed"}`;
const priceUpdate = (item: WatchlistItem, activity: WalletActivity): Update => {
  const { price } = activity;
  return record({
    kind: "price",
    key: `activity:${activity.id}`,
    itemId: item.id,
    activityId: activity.id,
    at: activity.observedAt,
    stubbed: activity.stubbed,
    title: price
      ? `${item.title} ${price.initiallyMatched ? "is already" : "moved"} ${price.comparison} ${price.threshold} ${price.quoteCurrency}`
      : `${item.title} price alert`,
    body: price
      ? `Observed ${price.observation.price} ${price.quoteCurrency} · ${price.sourceLabel}\n${finality(activity)}`
      : finality(activity),
  });
};
export const activityUpdate = (
  item: WatchlistItem,
  activity: WalletActivity
): Update => {
  if (activity.kind === "price") {
    return priceUpdate(item, activity);
  }
  const lines = activity.flows.slice(0, 6).map(flowLine);
  const sent = activity.flows.find((flow) => flow.direction === "sent");
  const received = activity.flows.find((flow) => flow.direction === "received");
  const title =
    activity.kind === "swap" && sent && received
      ? `${item.title} swapped ${flowLine(sent).slice(5)} for ${flowLine(received).slice(9)}`
      : `${item.title} ${lines[0]?.toLowerCase() ?? "had onchain activity"}`;
  return record({
    kind: "activity",
    key: `activity:${activity.id}`,
    itemId: item.id,
    activityId: activity.id,
    at: activity.observedAt,
    stubbed: activity.stubbed,
    title,
    body: [...lines, finality(activity)].join("\n"),
  });
};
export const correctionUpdate = (
  activity: WalletActivity,
  now: number
): Update =>
  record({
    kind: activity.kind === "price" ? "price" : "activity",
    key: `correction:${activity.id}:${activity.blockHash}`,
    itemId: activity.itemId,
    activityId: activity.id,
    at: now,
    stubbed: activity.stubbed,
    title: "Correction to provisional activity",
    body: `The provisional ${chain(activity)} ${activity.kind === "price" ? "price evidence" : "wallet activity"} ${activity.finality === "unverified" ? "could not be reverified after a monitoring gap" : "was removed by a chain reorganization"}.`,
  });
export const foundUpdate = (
  item: WatchlistItem,
  key: string,
  rows: readonly AddressPresence[],
  now: number
): Update => {
  const found = visiblePresence(rows).filter(
    (row) => row.status === "observed"
  );
  return record({
    kind: "found",
    key: `found:${item.id}:${key}`.slice(0, 300),
    itemId: item.id,
    at: now,
    stubbed: found.some((row) => row.stubbed),
    title: `Froggy found ${item.title} on ${found.length} ${found.length === 1 ? "chain" : "chains"}`,
    body: listChainNames(found.map((row) => row.network)),
  });
};
export const enrichedUpdate = (
  item: WatchlistItem,
  key: string,
  status: string,
  note: string,
  stubbed: boolean,
  now: number
): Update =>
  record({
    kind: "enriched",
    key: `enriched:${item.id}:${key}`.slice(0, 300),
    itemId: item.id,
    at: now,
    stubbed,
    title:
      status === "done"
        ? `Finished checking ${item.title}`
        : `${item.title} check needs attention`,
    body: note,
  });
export const noticeUpdate = (notice: Notice): Update =>
  record({
    kind: "notice",
    key: `notice:${notice.id}`,
    itemId: null,
    at: notice.at,
    stubbed: false,
    title: notice.source === "reminder" ? "Reminder" : "Froggy sent an update",
    body: notice.text,
  });
