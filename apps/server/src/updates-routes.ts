import { UpdateId } from "@froggy/domain";
import type { UserId } from "@froggy/domain";
import type { AppServerMessage } from "@froggy/protocol";
import type { Store } from "@froggy/wallet";
import { Schema } from "effect";

import { createUpdates } from "./updates";

const validateRead = async (request: Request): Promise<Response | null> => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Expected a versioned JSON request." },
      { status: 400 }
    );
  }
  if (
    Schema.decodeUnknownResult(Schema.Struct({ v: Schema.Literal(1) }))(body)
      ._tag === "Failure"
  ) {
    return Response.json({ error: "Expected v: 1." }, { status: 400 });
  }

  return null;
};
const detail = async (
  store: Store,
  owner: UserId,
  id: UpdateId
): Promise<Response> => {
  const update = await store.updates.byId(owner, id);
  const activityId = update?.activityId;
  const activity = activityId
    ? await store.walletActivity.transact(async (tx) => {
        const [stored] = await tx.activities(owner, [activityId]);
        return stored ?? null;
      })
    : null;
  return update
    ? Response.json({ v: 1, update, activity })
    : Response.json({ error: "Update not found." }, { status: 404 });
};
export const handleUpdates = async (
  store: Store,
  request: Request,
  owner: UserId,
  publishApp?: (owner: UserId, message: AppServerMessage) => void
): Promise<Response | null> => {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/updates")) {
    return null;
  }
  if (request.method === "POST") {
    const invalid = await validateRead(request);
    if (invalid) {
      return invalid;
    }
  }
  const updates = createUpdates({ store, publishApp });
  if (url.pathname === "/api/updates" && request.method === "GET") {
    const before = url.searchParams.get("before");
    if (before !== null && !UpdateId.is(before)) {
      return Response.json(
        { error: "Invalid update cursor." },
        { status: 400 }
      );
    }
    return Response.json(await store.updates.list(owner, before ?? undefined));
  }
  if (url.pathname === "/api/updates/read-all" && request.method === "POST") {
    await store.updates.markAllRead(owner, Date.now());
    await updates.announce(owner);
    return Response.json({ v: 1, unread: await store.updates.unread(owner) });
  }
  const match = /^\/api\/updates\/(?<id>[^/]+)(?<read>\/read)?$/u.exec(
    url.pathname
  )?.groups;
  if (!match || match["id"] === undefined || !UpdateId.is(match["id"])) {
    return Response.json({ error: "Update not found." }, { status: 404 });
  }
  const { id } = match;
  if (request.method === "GET" && match["read"] === undefined) {
    return await detail(store, owner, id);
  }
  if (request.method === "POST" && match["read"] !== undefined) {
    if (!(await store.updates.markRead(owner, id, Date.now()))) {
      return Response.json({ error: "Update not found." }, { status: 404 });
    }
    await updates.announce(owner);
    return Response.json({ v: 1, unread: await store.updates.unread(owner) });
  }
  return Response.json({ error: "Method not allowed." }, { status: 405 });
};
