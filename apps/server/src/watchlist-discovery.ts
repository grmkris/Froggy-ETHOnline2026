/**
 * Where a saved address lives, found in the background.
 *
 * A pasted address is saved at once with its short form as the title, and
 * only then does Froggy read every configured RPC to learn which chains hold
 * it, whether it is a contract, and what the contract calls itself. That read
 * is free (decision 0025) and bounded: one pinned block per network, at most
 * six networks, one running check per person, ten starts a minute per person.
 * The answer lives beside the item's other facts, so a chain check never
 * bumps the revision a person's own edit is fenced on. It runs again only
 * when someone asks ("Check again"), never on a schedule and never because
 * the item was opened.
 */

import {
  AddressPresence,
  emptyWatchlistData,
  isTestnet,
  presenceTag,
  presenceTitle,
  shortEvmAddress,
  visiblePresence,
} from "@froggy/domain";
import type {
  EvmTradingNetwork,
  UserId,
  WatchlistData,
  WatchlistItem,
  WatchlistItemId,
} from "@froggy/domain";
import { WatchlistDiscover, WatchlistTrack } from "@froggy/protocol";
import type { AddressLookupResult } from "@froggy/protocol";
import type { Store } from "@froggy/wallet";
import { Schema } from "effect";
import { formatUnits } from "viem";

import { detached } from "./detached";
import type { Services } from "./services";
import { lookupAddress, lookupNetworks } from "./trading/address-lookup";
import type { TradingRpc } from "./trading/rpc";
import { recordItemObservation } from "./watchlist-data";
import { watchlistPreviewFor } from "./watchlist-resolve";
import { saveWatchlistItem } from "./watchlist-routes";

type WatchlistTrack = typeof WatchlistTrack.Type;

export interface DiscoveryDeps {
  readonly store: Store;
  readonly rpc: TradingRpc;
  /** Every configured EVM network when live, the demo trio when stubbed. */
  readonly networks: readonly EvmTradingNetwork[];
  readonly now?: () => number;
  /** Tells open tabs the item changed; the details poll covers the rest. */
  readonly changed?: (owner: UserId) => void;
}

export const discoveryDependencies = (
  services: Services,
  changed?: (owner: UserId) => void
): DiscoveryDeps => {
  const deps: DiscoveryDeps = {
    store: services.store,
    rpc: services.trading.rpc,
    networks: lookupNetworks(
      Object.keys(services.environment.trading.rpcEndpoints),
      services.environment.modes.quicknode === "live"
    ),
  };
  return changed ? { ...deps, changed } : deps;
};

/**
 * Until the identity commit of decision 0037 lands, a saved address still
 * carries one chain; Base is the placeholder because it is where the existing
 * rows were merged. Never shown, never chosen by anyone.
 */
const PLACEHOLDER_NETWORK = "eip155:8453";

const STALE_RUNNING_MS = 15 * 60_000;
const OWNER_STARTS_PER_MINUTE = 10;
const GLOBAL_STARTS_PER_MINUTE = 100;
const DRAIN_LIMIT = 20;
const ABSENT_NOTE =
  "No code, no ETH and no USDC at this block. The address may still hold other tokens or have past activity here.";

const CHAIN_NAMES = new Map([
  ["eip155:1", "Ethereum"],
  ["eip155:8453", "Base"],
  ["eip155:4663", "Robinhood"],
  ["eip155:11155111", "Sepolia"],
  ["eip155:84532", "Base Sepolia"],
]);
export const chainName = (network: string): string =>
  CHAIN_NAMES.get(network) ?? network;

const listNames = (networks: readonly string[]): string => {
  const names = networks.map(chainName);
  if (names.length <= 1) {
    return names.join("");
  }
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
};

/** Start times in the last minute, per person; a runaway paste loop stays a queue, not a flood. */
const starts = new Map<UserId, number[]>();
const allowStart = (owner: UserId, now: number): boolean => {
  let total = 0;
  for (const [key, times] of starts) {
    const recent = times.filter((time) => now - time < 60_000);
    if (recent.length === 0) {
      starts.delete(key);
    } else {
      starts.set(key, recent);
      total += recent.length;
    }
  }
  const own = starts.get(owner) ?? [];
  if (
    own.length >= OWNER_STARTS_PER_MINUTE ||
    total >= GLOBAL_STARTS_PER_MINUTE
  ) {
    return false;
  }
  starts.set(owner, [...own, now]);
  return true;
};

const isAddressItem = (item: WatchlistItem): boolean =>
  item.source._tag === "wallet" || item.source._tag === "token";

/** The one item for an address, whatever the check decided it is. */
const findAddressItem = async (
  store: Store,
  owner: UserId,
  address: string
): Promise<WatchlistItem | undefined> =>
  await store.watchlist.transact(owner, (book) =>
    [...book.values()].find(
      (item) =>
        (item.source._tag === "wallet" || item.source._tag === "token") &&
        item.source.address.toLowerCase() === address.toLowerCase()
    )
  );

/** One lookup row becomes one presence row; an empty EOA is "absent", not "observed". */
export const presenceFromLookup = (
  lookup: AddressLookupResult
): readonly AddressPresence[] =>
  lookup.networks.map((row) => {
    const empty =
      row.status === "observed" &&
      row.kind === "eoa" &&
      row.nativeBalance === "0" &&
      (row.usdc === null || row.usdc.units === "0");
    let status: AddressPresence["status"] = "observed";
    if (row.status === "unavailable") {
      status = "unavailable";
    } else if (empty) {
      status = "absent";
    }
    return Schema.decodeUnknownSync(AddressPresence)({
      network: row.network,
      status,
      kind: row.kind,
      block: row.block,
      nativeBalance: row.nativeBalance,
      usdc: row.usdc,
      token:
        row.token === null
          ? null
          : {
              name: row.token.name ?? null,
              symbol: row.token.symbol,
              decimals: row.token.decimals,
              totalSupply: row.token.totalSupply,
            },
      observedAt: lookup.observedAt,
      stubbed: lookup.stubbed,
      note: empty ? ABSENT_NOTE : row.note,
    });
  });

const describeRow = (row: AddressPresence): string => {
  if (row.kind === "contract") {
    const name = row.token?.name ?? row.token?.symbol ?? null;
    if (name === null) {
      return "Contract without ERC-20 metadata";
    }
    const symbol =
      row.token?.symbol && row.token.symbol !== name
        ? ` (${row.token.symbol})`
        : "";
    const decimals =
      row.token?.decimals === null || row.token?.decimals === undefined
        ? ""
        : ` · ${row.token.decimals} decimals`;
    return `Token ${name}${symbol}${decimals}`;
  }
  const eth =
    row.nativeBalance === null
      ? ""
      : ` · ${formatUnits(BigInt(row.nativeBalance), 18)} ETH`;
  const usdc =
    row.usdc === null
      ? ""
      : ` · ${formatUnits(BigInt(row.usdc.units), row.usdc.decimals)} USDC`;
  return `Address${eth}${usdc}`;
};

type Discovery = NonNullable<WatchlistData["discovery"]>;

const setDiscovery = async (
  store: Store,
  owner: UserId,
  itemId: WatchlistItemId,
  key: string,
  patch: Partial<Discovery>
): Promise<void> => {
  await store.watchlistData.transact(owner, (book) => {
    const data = book.get(itemId);
    if (data?.discovery?.key === key) {
      book.set(itemId, {
        ...data,
        discovery: { ...data.discovery, ...patch },
      });
    }
  });
};

/** Queue a check unless one is already queued or running; returns the data book entry either way. */
export const queueDiscovery = async (
  store: Store,
  owner: UserId,
  itemId: WatchlistItemId,
  key: string,
  note: string,
  now: number
): Promise<{ readonly data: WatchlistData; readonly queued: boolean }> =>
  await store.watchlistData.transact(owner, (book) => {
    const current = book.get(itemId) ?? emptyWatchlistData(itemId);
    const pending = current.discovery ?? null;
    if (pending !== null && ["queued", "running"].includes(pending.status)) {
      return { data: current, queued: false };
    }
    const next: WatchlistData = {
      ...current,
      discovery: {
        key,
        requestedAt: now,
        startedAt: null,
        status: "queued",
        note,
      },
    };
    book.set(itemId, next);
    return { data: next, queued: true };
  });

/** Write what was found: presence rows, the verdict, the name and the kind, and one free observation. */
const recordPresence = async (
  deps: DiscoveryDeps,
  owner: UserId,
  item: WatchlistItem,
  key: string,
  rows: readonly AddressPresence[]
): Promise<void> => {
  const { store } = deps;
  const now = (deps.now ?? Date.now)();
  const observed = rows.filter((row) => row.status === "observed");
  const visible = visiblePresence(rows);
  let status: Discovery["status"] = "done";
  let note: string;
  if (rows.length > 0 && rows.every((row) => row.status === "unavailable")) {
    status = "failed";
    note = "Could not reach any chain. Check again later.";
  } else if (observed.length === 0) {
    const mainnets = rows
      .filter((row) => !isTestnet(row.network))
      .map((row) => row.network);
    const testnets = rows.filter((row) => isTestnet(row.network));
    note = `Not seen on any chain we checked: ${listNames(mainnets)}${testnets.length > 0 ? " (and the Sepolia testnets)" : ""}.`;
  } else {
    const found = visible
      .filter((row) => row.status === "observed")
      .map((row) => row.network);
    const unreachable = visible
      .filter((row) => row.status === "unavailable")
      .map((row) => row.network);
    note = `Found on ${listNames(found)}.${unreachable.length > 0 ? ` ${listNames(unreachable)} could not be checked.` : ""}`;
  }
  await store.watchlistData.transact(owner, (book) => {
    const data = book.get(item.id) ?? emptyWatchlistData(item.id);
    if (data.discovery?.key !== key) {
      return;
    }
    book.set(item.id, {
      ...data,
      presence: rows,
      discovery: { ...data.discovery, status, note },
    });
  });
  if (item.source._tag !== "wallet" && item.source._tag !== "token") {
    return;
  }
  const { address, network } = item.source;
  const tag = presenceTag(rows);
  const title = presenceTitle(rows);
  await store.watchlist.transact(owner, (book) => {
    const current = book.get(item.id);
    if (
      current === undefined ||
      (current.source._tag !== "wallet" && current.source._tag !== "token")
    ) {
      return;
    }
    const placeholder =
      current.title === shortEvmAddress(address) ||
      current.title.toLowerCase() === address.toLowerCase();
    let next = current;
    if (tag !== null && tag !== current.source._tag) {
      next = {
        ...next,
        source:
          tag === "token"
            ? { _tag: "token", network, address }
            : { _tag: "wallet", network, address },
      };
    }
    if (title !== null && placeholder && title !== current.title) {
      next = { ...next, title };
    }
    if (next !== current) {
      book.set(item.id, {
        ...next,
        revision: current.revision + 1,
        updatedAt: now,
      });
    }
  });
  if (observed.length > 0) {
    await recordItemObservation(store, owner, item.id, {
      at: now,
      source: "Chain lookup",
      sourceUrl: null,
      price: null,
      currency: null,
      basis: `address:${address.toLowerCase()}`,
      stubbed: rows.some((row) => row.stubbed),
      facts: visible
        .filter((row) => row.status === "observed")
        .map((row) => ({
          label: chainName(row.network).slice(0, 60),
          value: describeRow(row).slice(0, 500),
        })),
    });
  }
  deps.changed?.(owner);
};

/** Look the address up now and record it; used by the queue and by a tool that cannot wait for the tick. */
const runDiscovery = async (
  deps: DiscoveryDeps,
  owner: UserId,
  item: WatchlistItem,
  key: string
): Promise<void> => {
  if (item.source._tag !== "wallet" && item.source._tag !== "token") {
    return;
  }
  try {
    const lookup = await lookupAddress(
      { rpc: deps.rpc, networks: deps.networks, now: deps.now ?? Date.now },
      { address: item.source.address },
      []
    );
    await recordPresence(deps, owner, item, key, presenceFromLookup(lookup));
  } catch (error) {
    await setDiscovery(deps.store, owner, item.id, key, {
      status: "failed",
      note: (error instanceof Error
        ? error.message
        : "The chain lookup failed."
      ).slice(0, 500),
    });
    deps.changed?.(owner);
  }
};

type DataBook = Map<WatchlistItemId, WatchlistData>;

/** Items saved without a check (an agent save, a migrated row) get their first run, once. */
const queueFirstRuns = (
  book: DataBook,
  items: readonly WatchlistItem[],
  now: number
): void => {
  for (const item of items) {
    if (!isAddressItem(item) || item.archived) {
      continue;
    }
    const data = book.get(item.id) ?? emptyWatchlistData(item.id);
    if (
      (data.presence ?? []).length === 0 &&
      (data.discovery ?? null) === null
    ) {
      book.set(item.id, {
        ...data,
        discovery: {
          key: `discover:${item.id}:first`,
          requestedAt: now,
          startedAt: null,
          status: "queued",
          note: "Checking which chains this address is on.",
        },
      });
    }
  }
};

/** A check still running blocks the queue; one abandoned for fifteen minutes is failed instead. */
const stillRunning = (book: DataBook, now: number): boolean => {
  let running = false;
  for (const data of book.values()) {
    const pending = data.discovery ?? null;
    if (pending?.status !== "running") {
      continue;
    }
    if (now - (pending.startedAt ?? pending.requestedAt) > STALE_RUNNING_MS) {
      book.set(data.itemId, {
        ...data,
        discovery: {
          ...pending,
          status: "failed",
          note: "Checking was interrupted. Use Check again.",
        },
      });
    } else {
      running = true;
    }
  }
  return running;
};

/** Claim the oldest queued check and run it; true when something ran. */
const runNext = async (
  deps: DiscoveryDeps,
  owner: UserId
): Promise<boolean> => {
  const { store } = deps;
  const now = (deps.now ?? Date.now)();
  const items = await store.watchlist.transact(owner, (book) => [
    ...book.values(),
  ]);
  const byId = new Map(items.map((item) => [item.id, item]));
  const claimed = await store.watchlistData.transact(owner, (book) => {
    queueFirstRuns(book, items, now);
    if (stillRunning(book, now)) {
      return null;
    }
    const queued = [...book.values()]
      .filter((data) => data.discovery?.status === "queued")
      .toSorted(
        (a, b) =>
          (a.discovery?.requestedAt ?? 0) - (b.discovery?.requestedAt ?? 0)
      );
    for (const data of queued) {
      const pending = data.discovery;
      const item = byId.get(data.itemId);
      if (!pending) {
        continue;
      }
      if (item === undefined || item.archived || !isAddressItem(item)) {
        book.set(data.itemId, {
          ...data,
          discovery: {
            ...pending,
            status: "failed",
            note: "The saved item changed. Save it again to check.",
          },
        });
        continue;
      }
      if (!allowStart(owner, now)) {
        return null;
      }
      book.set(data.itemId, {
        ...data,
        discovery: { ...pending, status: "running", startedAt: now },
      });
      return { item, key: pending.key };
    }
    return null;
  });
  if (claimed === null) {
    return false;
  }
  await runDiscovery(deps, owner, claimed.item, claimed.key);
  return true;
};

/** Drain one person's queue, one check at a time; the tick calls this for everyone with saved items. */
export const discoverSavedItems = async (
  deps: DiscoveryDeps,
  owner: UserId,
  remaining = DRAIN_LIMIT
): Promise<void> => {
  const ran = await runNext(deps, owner);
  if (ran && remaining > 1) {
    await discoverSavedItems(deps, owner, remaining - 1);
  }
};

/** The rows an agent can act on now: what was found, or one bounded read when nothing has been yet. */
export const ensureDiscovered = async (
  deps: DiscoveryDeps,
  owner: UserId,
  item: WatchlistItem
): Promise<readonly AddressPresence[]> => {
  const { store } = deps;
  const now = (deps.now ?? Date.now)();
  const existing = await store.watchlistData.transact(owner, (book) => {
    const data = book.get(item.id);
    return data?.discovery?.status === "done" ? (data.presence ?? []) : null;
  });
  if (existing !== null) {
    return existing;
  }
  const key = `discover:${item.id}:${now}`;
  const { queued } = await queueDiscovery(
    store,
    owner,
    item.id,
    key,
    "Checking which chains this address is on.",
    now
  );
  if (queued) {
    await store.watchlistData.transact(owner, (book) => {
      const data = book.get(item.id);
      if (data?.discovery?.key === key) {
        book.set(item.id, {
          ...data,
          discovery: { ...data.discovery, status: "running", startedAt: now },
        });
      }
    });
    await runDiscovery(deps, owner, item, key);
  }
  return await store.watchlistData.transact(
    owner,
    (book) => book.get(item.id)?.presence ?? []
  );
};

type DiscoveryResponse =
  | {
      readonly v: 1;
      readonly item: WatchlistItem;
      readonly data: WatchlistData;
    }
  | { readonly v: 1; readonly error: string };
const reply = (body: DiscoveryResponse, status = 200): Response =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

const itemAndData = async (
  store: Store,
  owner: UserId,
  itemId: WatchlistItemId
): Promise<{
  readonly item: WatchlistItem | undefined;
  readonly data: WatchlistData;
}> => ({
  item: await store.watchlist.transact(owner, (book) => book.get(itemId)),
  data: await store.watchlistData.transact(
    owner,
    (book) => book.get(itemId) ?? emptyWatchlistData(itemId)
  ),
});

/** Presence the paste's own preview already read for this address, if any. */
const seedFromPreview = async (
  owner: UserId,
  address: string,
  previewRef: WatchlistTrack["previewRef"]
): Promise<readonly AddressPresence[] | null> => {
  const preview = previewRef
    ? await watchlistPreviewFor(owner, previewRef)
    : null;
  if (
    preview?.lookup === undefined ||
    preview.lookup.address.toLowerCase() !== address.toLowerCase()
  ) {
    return null;
  }
  return presenceFromLookup(preview.lookup);
};

/** Seed the answer from the paste's own preview when there is one, else queue the read. */
const startTracking = async (
  deps: DiscoveryDeps,
  owner: UserId,
  saved: WatchlistItem,
  previewRef: WatchlistTrack["previewRef"],
  now: number
): Promise<void> => {
  if (saved.source._tag !== "wallet" && saved.source._tag !== "token") {
    return;
  }
  const current = await deps.store.watchlistData.transact(
    owner,
    (book) => book.get(saved.id) ?? emptyWatchlistData(saved.id)
  );
  if (current.discovery?.status === "done") {
    return;
  }
  const seed = await seedFromPreview(owner, saved.source.address, previewRef);
  const first = (current.discovery ?? null) === null;
  const key =
    seed === null && first
      ? `discover:${saved.id}:first`
      : `discover:${saved.id}:${seed === null ? "" : "preview:"}${now}`;
  const { queued } = await queueDiscovery(
    deps.store,
    owner,
    saved.id,
    key,
    "Checking which chains this address is on.",
    now
  );
  if (!queued) {
    return;
  }
  if (seed !== null) {
    // The paste already read these chains; write the answer rather than reading them again.
    await recordPresence(deps, owner, saved, key, seed);
    return;
  }
  detached("saved item discovery", async () => {
    await discoverSavedItems(deps, owner);
  });
};

/** The item for this address: the one already saved, restored if archived, else new with the short form as its name. */
const saveTracked = async (
  store: Store,
  owner: UserId,
  input: WatchlistTrack
): Promise<WatchlistItem> => {
  const existing = await findAddressItem(store, owner, input.address);
  if (existing !== undefined && !existing.archived) {
    return existing;
  }
  const source: WatchlistItem["source"] =
    existing?.source._tag === "token"
      ? {
          _tag: "token",
          network: existing.source.network,
          address: existing.source.address,
        }
      : {
          _tag: "wallet",
          network: PLACEHOLDER_NETWORK,
          address: input.address,
        };
  return await saveWatchlistItem(store, owner, {
    title: shortEvmAddress(input.address),
    notes: input.notes ?? "",
    source,
  });
};

/** `POST /api/watchlist/track`: save the address now, find where it lives after. */
export const handleWatchlistTrack = async (
  deps: DiscoveryDeps,
  request: Request,
  owner: UserId
): Promise<Response> => {
  if (request.method !== "POST") {
    return reply({ v: 1, error: "Method not allowed." }, 405);
  }
  const parsed = Schema.decodeUnknownResult(WatchlistTrack)(
    await request.json().catch(() => null)
  );
  if (parsed._tag === "Failure") {
    return reply({ v: 1, error: "Paste an EVM address." }, 400);
  }
  const input = parsed.success;
  const now = (deps.now ?? Date.now)();
  const saved = await saveTracked(deps.store, owner, input);
  await startTracking(deps, owner, saved, input.previewRef, now);
  const { item, data } = await itemAndData(deps.store, owner, saved.id);
  return reply({ v: 1, item: item ?? saved, data }, 201);
};

/** `POST /api/watchlist/:id/discover`: "Check again", the one deliberate re-run. */
export const handleWatchlistDiscover = async (
  deps: DiscoveryDeps,
  request: Request,
  owner: UserId,
  itemId: WatchlistItemId
): Promise<Response> => {
  if (request.method !== "POST") {
    return reply({ v: 1, error: "Method not allowed." }, 405);
  }
  const parsed = Schema.decodeUnknownResult(WatchlistDiscover)(
    await request.json().catch(() => null)
  );
  if (parsed._tag === "Failure") {
    return reply({ v: 1, error: "Malformed request." }, 400);
  }
  const now = (deps.now ?? Date.now)();
  const item = await deps.store.watchlist.transact(owner, (book) =>
    book.get(itemId)
  );
  if (item === undefined || item.archived || !isAddressItem(item)) {
    return reply({ v: 1, error: "Item not found." }, 404);
  }
  const { queued } = await queueDiscovery(
    deps.store,
    owner,
    itemId,
    `discover:${itemId}:${now}`,
    "Checking again.",
    now
  );
  if (!queued) {
    return reply(
      { v: 1, error: "Still checking which chains this address is on." },
      409
    );
  }
  const recent = starts.get(owner)?.filter((time) => now - time < 60_000) ?? [];
  if (recent.length >= OWNER_STARTS_PER_MINUTE) {
    return reply(
      { v: 1, error: "Too many checks. Try again in a minute." },
      429
    );
  }
  detached("check saved item again", async () => {
    await discoverSavedItems(deps, owner);
  });
  const state = await itemAndData(deps.store, owner, itemId);
  return reply({ v: 1, item: state.item ?? item, data: state.data });
};
