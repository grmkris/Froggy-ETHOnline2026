import { ConversationId, HistoryId, HistoryPage } from "@froggy/domain";
import type { HistoryRecord, Receipt, UserId } from "@froggy/domain";
import { HistoryUpdate } from "@froggy/protocol";
import { HistoryConflictError, historyCursor } from "@froggy/wallet";
import type { HistoryFilter, HistoryTransaction, Store } from "@froggy/wallet";
import { Schema } from "effect";

import { expireHistoryLease, historyPreview } from "./history";
import { historyBusiness } from "./history-business";
import { recoverAgentHistory, recoverTelegramHistory } from "./history-sources";

const bad = (error: string, status = 400): Response =>
  Response.json({ v: 1, error }, { status });
const page = (
  records: readonly HistoryRecord[],
  limit: number,
  sequence: number,
  receipts: readonly Receipt[] = []
): Response => {
  const selected = records.slice(0, limit);
  const last = selected.at(-1);
  return Response.json(
    Schema.decodeUnknownSync(HistoryPage)({
      v: 1,
      records: selected,
      receipts,
      sequence,
      cursor:
        selected.length === limit && last !== undefined
          ? historyCursor(last)
          : null,
    })
  );
};
type MutableFilter = { -readonly [K in keyof HistoryFilter]: HistoryFilter[K] };
const requestedFilter = (url: URL): Omit<HistoryFilter, "kind"> => {
  const values: Partial<MutableFilter> = {};
  for (const field of ["source", "status", "connectionId", "before"] as const) {
    const value = url.searchParams.get(field);
    if (value !== null && value !== "") {
      values[field] = value.slice(0, 200);
    }
  }
  const since = url.searchParams.get("since");
  if (since !== null && since !== "") {
    const at = Number(since);
    if (!Number.isSafeInteger(at) || at < 0) {
      throw new HistoryConflictError("Invalid date filter.");
    }
    values.since = at;
  }
  const search = url.searchParams.get("q");
  if (search !== null && search.trim() !== "") {
    values.search = search.trim().slice(0, 200);
  }
  const archived = url.searchParams.get("archived");
  if (archived === "true") {
    values.archived = true;
  }
  if (archived === "false") {
    values.archived = false;
  }
  const limit = Number(url.searchParams.get("limit") ?? 20);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw new HistoryConflictError("Limit must be between 1 and 50.");
  }
  values.limit = limit;
  if (values.before !== undefined) {
    const [at, id, extra] = values.before.split(":");
    if (
      !Number.isSafeInteger(Number(at)) ||
      extra !== undefined ||
      !Schema.is(HistoryId)(id)
    ) {
      throw new HistoryConflictError("Invalid history cursor.");
    }
  }
  return values;
};
const detail = async (
  store: Store,
  userId: UserId,
  record: HistoryRecord
): Promise<Response> => {
  let runId = "runId" in record ? record.runId : null;
  if (record.kind === "run") {
    runId = record.id;
  }
  let related: readonly HistoryRecord[] = [];
  if (record.kind === "run") {
    const lists = await Promise.all(
      ["message", "execution"].map(
        async (kind) =>
          await store.history.list(userId, {
            kind: kind === "message" ? "message" : "execution",
            runId: record.id,
            limit: 50,
          })
      )
    );
    related = lists.flat();
  }
  let receiptRows =
    runId === null ? [] : await store.receipts.forRun(userId, runId);
  if (runId === null && record.kind === "execution") {
    receiptRows = await store.receipts.byIds(userId, record.receiptIds);
  }
  return Response.json({
    v: 1,
    record,
    related,
    receipts: receiptRows,
    business: await historyBusiness(store, userId, record, related),
  });
};
const conversationSummaries = async (
  tx: HistoryTransaction,
  records: readonly HistoryRecord[]
): Promise<readonly HistoryRecord[]> =>
  await Promise.all(
    records.map(async (record) => {
      if (record.kind !== "conversation") {
        return record;
      }
      const [latest] = await tx.list({
        kind: "run",
        conversationId: record.id,
        limit: 1,
      });
      return latest?.kind === "run"
        ? { ...record, latestStatus: latest.status }
        : record;
    })
  );
const listHistory = async (
  store: Store,
  userId: UserId,
  url: URL,
  filter: Omit<HistoryFilter, "kind">
): Promise<Response | null> => {
  const { pathname } = url;
  if (pathname === "/api/activity/changes") {
    const after = Number(url.searchParams.get("after") ?? 0);
    if (!Number.isSafeInteger(after) || after < 0) {
      return bad("Invalid recovery cursor.");
    }
    return Response.json({
      v: 1,
      ...(await store.history.changes(userId, after)),
    });
  }
  let kinds: readonly HistoryRecord["kind"][] = [];
  if (pathname === "/api/conversations") {
    kinds = ["conversation"];
  }
  if (pathname === "/api/activity") {
    kinds = ["run", "execution"];
  }
  if (pathname === "/api/history/search") {
    kinds = ["conversation", "message", "execution"];
  }
  if (kinds.length > 0) {
    return await store.history.transaction(userId, async (tx) => {
      const lists = await Promise.all(
        kinds.map(async (kind) => {
          const scoped = {
            ...filter,
            kind,
            rootOnly: pathname === "/api/activity" && kind === "execution",
          };
          if (pathname === "/api/conversations" && kind === "conversation") {
            return await tx.list({
              ...scoped,
              archived: filter.archived ?? false,
            });
          }
          return await tx.list(scoped);
        })
      );
      const records = await conversationSummaries(tx, lists.flat());
      return page(
        records.toSorted((a, b) =>
          historyCursor(b).localeCompare(historyCursor(a))
        ),
        filter.limit ?? 20,
        tx.owner.sequence
      );
    });
  }
  const messagePath =
    /^\/api\/conversations\/(?<conversation>[^/]+)\/messages$/u.exec(pathname);
  if (messagePath === null) {
    return null;
  }
  const id = messagePath.groups?.["conversation"];
  if (!Schema.is(ConversationId)(id)) {
    return bad("Conversation unavailable.", 404);
  }
  return await store.history.transaction(userId, async (tx) => {
    const conversation = await tx.get(id);
    if (conversation === null) {
      return bad("Conversation unavailable.", 404);
    }
    const messages = await tx.list({
      ...filter,
      kind: "message",
      conversationId: id,
    });
    const runIds = [
      ...new Set(
        messages.flatMap((message) =>
          message.kind === "message" && message.runId !== null
            ? [message.runId]
            : []
        )
      ),
    ];
    const receipts = await Promise.all(
      runIds.map(async (runId) => await store.receipts.forRun(userId, runId))
    );
    return page(
      messages,
      filter.limit ?? 20,
      tx.owner.sequence,
      receipts.flat().slice(0, 100)
    );
  });
};
const removePage = async (
  tx: HistoryTransaction,
  conversationId: ConversationId,
  kind: HistoryRecord["kind"]
): Promise<void> => {
  const records = await tx.list({ kind, conversationId, limit: 50 });
  if (records.length === 0) {
    return;
  }
  await Promise.all(
    records.map(async (record) => {
      await tx.remove(record.id);
    })
  );
  await removePage(tx, conversationId, kind);
};
const updateConversation = async (
  store: Store,
  userId: UserId,
  id: ConversationId,
  request: Request
): Promise<Response> => {
  if (request.method === "PATCH") {
    const decoded = Schema.decodeUnknownResult(HistoryUpdate)(
      await request.json()
    );
    if (decoded._tag === "Failure") {
      return bad("Invalid conversation change.");
    }
    const record = await store.history.transaction(userId, async (tx) => {
      const current = await tx.get(id);
      if (current?.kind !== "conversation") {
        throw new HistoryConflictError("Conversation unavailable.");
      }
      return await tx.save(
        {
          ...current,
          title:
            decoded.success.title === undefined
              ? current.title
              : historyPreview(decoded.success.title, 100).text,
          archived: decoded.success.archived ?? current.archived,
          updatedAt: Date.now(),
        },
        decoded.success.revision
      );
    });
    return Response.json({ v: 1, record });
  }
  if (request.method !== "DELETE") {
    return bad("Method not supported.", 405);
  }
  await store.history.transaction(userId, async (tx) => {
    const current = await tx.get(id);
    if (current?.kind !== "conversation") {
      throw new HistoryConflictError("Conversation unavailable.");
    }
    const active =
      tx.owner.activeRunId === null ? null : await tx.get(tx.owner.activeRunId);
    if (active?.kind === "run" && active.conversationId === id) {
      throw new HistoryConflictError(
        "Stop the active run before deleting this conversation."
      );
    }
    await store.history.clearTelegramCache(userId, id);
    await Promise.all(
      (["message", "execution", "artifact", "run"] as const).map(
        async (kind) => {
          await removePage(tx, id, kind);
        }
      )
    );
    await tx.remove(id);
  });
  return Response.json({ v: 1, deleted: true });
};
export const handleHistory = async (
  store: Store,
  request: Request,
  userId: UserId
): Promise<Response | null> => {
  const url = new URL(request.url);
  const { pathname } = url;
  if (
    !/^\/api\/(?:conversations|activity|runs|executions|artifacts|history)(?:\/|$)/u.test(
      pathname
    )
  ) {
    return null;
  }
  try {
    if (pathname === "/api/activity") {
      await recoverAgentHistory(store, userId);
    }
    if (pathname === "/api/conversations") {
      await recoverTelegramHistory(store, userId);
    }
    await store.history.transaction(userId, async (tx) => {
      await expireHistoryLease(tx, Date.now());
    });
    if (request.method === "GET") {
      const listed = await listHistory(
        store,
        userId,
        url,
        requestedFilter(url)
      );
      if (listed !== null) {
        return listed;
      }
      const id = pathname.split("/").at(3);
      if (!Schema.is(HistoryId)(id)) {
        return bad("History record unavailable.", 404);
      }
      const record = await store.history.get(userId, id);
      return record === null
        ? bad("History record unavailable.", 404)
        : await detail(store, userId, record);
    }
    const id = pathname.split("/").at(3);
    if (
      !Schema.is(ConversationId)(id) ||
      !pathname.startsWith("/api/conversations/")
    ) {
      return bad("Conversation unavailable.", 404);
    }
    return await updateConversation(store, userId, id, request);
  } catch (error) {
    if (error instanceof HistoryConflictError) {
      return bad(error.message, 409);
    }
    throw error;
  }
};
