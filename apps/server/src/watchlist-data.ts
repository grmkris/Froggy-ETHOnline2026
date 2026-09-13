import { emptyWatchlistData, WatchlistItemId } from "@froggy/domain";
import type {
  Task,
  UserId,
  WatchlistData,
  WatchlistItem,
  WatchlistObservation,
} from "@froggy/domain";
import type { WatchlistDetails, TokenInspectResult } from "@froggy/protocol";
import type { Store } from "@froggy/wallet";

import { serviceTicket } from "./service-tasks";

export const recordItemObservation = async (
  store: Store,
  owner: UserId,
  itemId: WatchlistItemId,
  observation: WatchlistObservation,
  snapshotTaskId?: WatchlistData["snapshotTaskId"]
): Promise<void> => {
  await store.watchlistData.transact(owner, (book) => {
    const data = book.get(itemId) ?? emptyWatchlistData(itemId);
    const cutoff = Date.now() - 90 * 86_400_000;
    const usable = observation.price !== null || observation.facts.length > 0;
    const latest =
      usable && (data.latest === null || data.latest.at <= observation.at)
        ? observation
        : data.latest;
    const observations = [
      ...data.observations.filter(
        (entry) =>
          entry.at > cutoff &&
          !(
            entry.at === observation.at &&
            entry.basis === observation.basis &&
            entry.source === observation.source &&
            entry.stubbed === observation.stubbed
          )
      ),
      observation,
    ]
      .toSorted((a, b) => a.at - b.at)
      .slice(-500);
    book.set(itemId, {
      ...data,
      latest,
      observations,
      snapshotTaskId:
        snapshotTaskId &&
        (data.latest === null || data.latest.at <= observation.at)
          ? snapshotTaskId
          : data.snapshotTaskId,
    });
  });
};

const tokenFacts = (
  token: TokenInspectResult["token"] | undefined
): WatchlistObservation["facts"] => {
  if (!token) {
    return [];
  }
  return [
    { label: "Symbol", value: token.symbol },
    { label: "Liquidity (USD)", value: token.liquidityUsd },
    { label: "24h volume (USD)", value: token.volume24hUsd },
    { label: "24h change (%)", value: token.priceChange24hPercent },
  ].flatMap((fact) =>
    fact.value === null
      ? []
      : [{ label: fact.label, value: String(fact.value) }]
  );
};

const marketResult = (task: Task, network: string, after: number) => {
  if (task.kind !== "service" || task.status !== "done") {
    return null;
  }
  const result = serviceTicket(task).data;
  if (
    (result?.operation !== "token_snapshot" &&
      result?.operation !== "token_inspect" &&
      result?.operation !== "market_search") ||
    result.network !== network ||
    after >= result.observedAt
  ) {
    return null;
  }
  return result;
};

/** One bounded, free import of existing results; never a provider request or a paid backfill. */
export const ingestItemTasks = async (
  store: Store,
  owner: UserId,
  item: WatchlistItem
): Promise<void> => {
  const { source } = item;
  if (source._tag !== "token") {
    return;
  }
  const existing = await store.watchlistData.transact(owner, (book) =>
    book.get(item.id)
  );
  const tasks = await store.tasks.list(owner, 100);
  await Promise.all(
    tasks.map(async (task) => {
      const result = marketResult(
        task,
        source.network,
        existing?.latest?.at ?? -1
      );
      if (!result) {
        return;
      }
      let tokens = result.operation === "market_search" ? result.tokens : [];
      if (result.operation !== "market_search" && result.token) {
        tokens = [result.token];
      }
      const token = tokens.find(
        (entry) => entry.address.toLowerCase() === source.address.toLowerCase()
      );
      if (
        !token &&
        !(
          result.operation === "token_snapshot" &&
          result.address.toLowerCase() === source.address.toLowerCase()
        )
      ) {
        return;
      }
      await recordItemObservation(
        store,
        owner,
        item.id,
        {
          at: result.observedAt,
          source: "Birdeye",
          sourceUrl: null,
          price: token?.priceUsd ?? null,
          currency: "USD",
          basis: `${source.network}:${source.address.toLowerCase()}`,
          stubbed: result.stubbed || serviceTicket(task).stubbed,
          facts: tokenFacts(token),
        },
        result.operation === "token_snapshot" ? task.id : undefined
      );
    })
  );
};

export const readItemDetails = async (
  store: Store,
  owner: UserId,
  item: WatchlistItem,
  compact = false
): Promise<typeof WatchlistDetails.Type> => {
  await ingestItemTasks(store, owner, item);
  const data = await store.watchlistData.transact(
    owner,
    (book) => book.get(item.id) ?? emptyWatchlistData(item.id)
  );
  const task = data.snapshotTaskId
    ? await store.tasks.byId(owner, data.snapshotTaskId)
    : null;
  const snapshot = task?.kind === "service" ? serviceTicket(task).data : null;
  const chart = snapshot?.operation === "token_snapshot" ? snapshot : null;
  return {
    v: 1,
    item,
    data: compact ? { ...data, observations: [] } : data,
    snapshot:
      compact && chart !== null
        ? {
            ...chart,
            series: chart.series.map((series) => ({ ...series, points: [] })),
            seriesTaskId: data.snapshotTaskId ?? undefined,
          }
        : chart,
  };
};

export const handleWatchlistData = async (
  store: Store,
  request: Request,
  owner: UserId,
  pathname: string
): Promise<Response | null> => {
  if (request.method !== "GET" || !pathname.startsWith("/api/watchlist/")) {
    return null;
  }
  if (pathname === "/api/watchlist/details") {
    const items = await store.watchlist.transact(owner, (book) => [
      ...book.values(),
    ]);
    const data = await store.watchlistData.transact(owner, (book) =>
      items.flatMap((item) => {
        const value = book.get(item.id);
        return value ? [{ ...value, observations: [] }] : [];
      })
    );
    return Response.json(
      { v: 1, items: data },
      { headers: { "cache-control": "no-store" } }
    );
  }
  const match = /^\/api\/watchlist\/(?<id>[^/]+)\/details$/u.exec(pathname);
  const id = match?.groups?.["id"];
  if (id === undefined || !WatchlistItemId.is(id)) {
    return null;
  }
  const item = await store.watchlist.transact(owner, (book) => book.get(id));
  if (!item) {
    return Response.json({ v: 1, error: "Item not found." }, { status: 404 });
  }
  return Response.json(await readItemDetails(store, owner, item), {
    headers: { "cache-control": "no-store" },
  });
};
