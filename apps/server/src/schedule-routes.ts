import { DigestSchedule, NO_DIGEST, ScheduleId } from "@froggy/domain";
/**
 * Schedules over HTTP, and the one place a schedule is created.
 *
 * `createSchedule` is shared by the routes and the model's `schedule` tool,
 * so the two cannot disagree about the zone, the cap or what "in the past"
 * means. Creating a schedule changes no spending authority — a scheduled
 * prompt runs under the same mandate as a chat turn — which is why the tool
 * is allowed to exist.
 *
 * The digest keeps its old wire shape (`{hour, timezone}`) and is stored
 * as a daily schedule underneath, so the Settings control needs no change.
 */
import type { AgentConnectionId, Schedule, UserId } from "@froggy/domain";
import { ScheduleRequest } from "@froggy/protocol";
import type { ScheduleList, ScheduleRequestBody } from "@froggy/protocol";
import type { Store } from "@froggy/wallet";
import { Schema } from "effect";

import { connectionScopes } from "./capabilities";
import { cadenceOf, isTimezone, nextRunAfter } from "./schedules";

/** Active schedules a person may hold. A ticker is not a job queue. */
const MAX_ACTIVE = 20;

const decodeRequest = Schema.decodeUnknownResult(ScheduleRequest);
const decodeDigest = Schema.decodeUnknownResult(DigestSchedule);

export type CreateOutcome =
  | {
      readonly kind: "created";
      readonly schedule: Schedule;
      /** True when no zone was given and none was known, so UTC was assumed. */
      readonly timezoneDefaulted: boolean;
    }
  | {
      readonly kind: "refused";
      readonly reason: string;
      readonly status: 400 | 409;
    };

/**
 * Resolve the zone (request, then the person's last known, then UTC), turn
 * the request into a cadence, refuse a once-off already in the past or a
 * twenty-first active schedule, and persist.
 */
export const createSchedule = async (
  store: Store,
  userId: UserId,
  request: ScheduleRequestBody,
  now: number,
  connectionId: AgentConnectionId | null = null
): Promise<CreateOutcome> => {
  if (request.timezone !== undefined && !isTimezone(request.timezone)) {
    return {
      kind: "refused",
      reason: `Unknown timezone "${request.timezone}". Use an IANA name such as Europe/Berlin.`,
      status: 400,
    };
  }
  const known =
    request.timezone === undefined
      ? await store.schedules.timezoneFor(userId)
      : null;
  const timezone = request.timezone ?? known ?? "UTC";
  const timezoneDefaulted = request.timezone === undefined && known === null;
  const cadence = cadenceOf(request.when, timezone, now);
  const nextRunAt = nextRunAfter(cadence, timezone, now);
  if (nextRunAt === null) {
    return {
      kind: "refused",
      reason: "That time has already passed.",
      status: 400,
    };
  }
  const existing = await store.schedules.list(userId);
  const active = existing.filter((row) => row.status === "active");
  if (active.length >= MAX_ACTIVE) {
    return {
      kind: "refused",
      reason: `You already have ${MAX_ACTIVE} active schedules. Cancel one first.`,
      status: 409,
    };
  }
  const action =
    request.action._tag === "prompt"
      ? { ...request.action, connectionId }
      : request.action;
  if (
    action._tag === "prompt" &&
    action.permissions !== undefined &&
    action.permissions.length > 0
  ) {
    const scopes = await connectionScopes(store, userId, connectionId);
    if (
      scopes !== null &&
      action.permissions.some((scope) => !scopes.has(scope))
    ) {
      return {
        kind: "refused",
        reason: "This connection lacks the requested email permissions.",
        status: 409,
      };
    }
  }
  const schedule: Schedule = {
    action,
    cadence,
    createdAt: now,
    id: ScheduleId.generate(),
    label: request.label,
    lastRunAt: null,
    nextRunAt,
    status: "active",
    timezone,
  };
  await store.schedules.create(userId, schedule);
  return { kind: "created", schedule, timezoneDefaulted };
};

type ScheduleResponse =
  | ScheduleList
  | Schedule
  | DigestSchedule
  | { readonly cancelled: boolean }
  | { readonly error: string };

const json = (body: ScheduleResponse, status = 200): Response =>
  Response.json(body, { headers: { "cache-control": "no-store" }, status });

/** `GET`, `POST /api/schedules`, `DELETE /api/schedules/:id`; null for any other path. */
export const handleSchedules = async (
  store: Store,
  request: Request,
  userId: UserId,
  pathname: string
): Promise<Response | null> => {
  if (pathname === "/api/schedules" && request.method === "GET") {
    return json({ schedules: await store.schedules.list(userId), v: 1 });
  }
  if (pathname === "/api/schedules" && request.method === "POST") {
    const decoded = decodeRequest(await request.json().catch(() => null));
    if (decoded._tag === "Failure") {
      return json({ error: "Malformed schedule request." }, 400);
    }
    const outcome = await createSchedule(
      store,
      userId,
      decoded.success,
      Date.now()
    );
    return outcome.kind === "created"
      ? json(outcome.schedule, 201)
      : json({ error: outcome.reason }, outcome.status);
  }
  if (pathname.startsWith("/api/schedules/") && request.method === "DELETE") {
    const id = pathname.slice("/api/schedules/".length);
    if (!ScheduleId.is(id)) {
      return json({ cancelled: false }, 404);
    }
    const cancelled = await store.schedules.cancel(userId, id);
    return json({ cancelled }, cancelled ? 200 : 404);
  }
  return null;
};

/** The digest as the Settings control reads it: an hour and a zone, or never. */
const digestOf = (schedule: Schedule | null): DigestSchedule => {
  if (schedule === null || schedule.cadence._tag !== "daily") {
    return NO_DIGEST;
  }
  return {
    hour: Number(schedule.cadence.time.slice(0, 2)),
    timezone: schedule.timezone,
  };
};

/** The digest schedule: read it, or replace it. */
export const handleDigest = async (
  store: Store,
  request: Request,
  userId: UserId
): Promise<Response> => {
  if (request.method !== "PUT") {
    return json(digestOf(await store.schedules.digestOf(userId)));
  }
  const decoded = decodeDigest(await request.json().catch(() => null));
  if (decoded._tag === "Failure") {
    return json({ error: "Malformed digest schedule." }, 400);
  }
  const { hour } = decoded.success;
  const timezone = isTimezone(decoded.success.timezone)
    ? decoded.success.timezone
    : "UTC";
  if (hour === null) {
    await store.schedules.saveDigest(userId, null);
    return json(NO_DIGEST);
  }
  const now = Date.now();
  const cadence = {
    _tag: "daily",
    time: `${String(hour).padStart(2, "0")}:00`,
  } as const;
  const schedule: Schedule = {
    action: { _tag: "digest" },
    cadence,
    createdAt: now,
    id: ScheduleId.generate(),
    label: "Daily digest",
    lastRunAt: null,
    nextRunAt: nextRunAfter(cadence, timezone, now),
    status: "active",
    timezone,
  };
  await store.schedules.saveDigest(userId, schedule);
  return json({ hour, timezone });
};
