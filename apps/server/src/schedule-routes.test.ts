import { describe, expect, test } from "bun:test";

import { ScheduleId, userId } from "@froggy/domain";
import { ScheduleList } from "@froggy/protocol";
import { memoryStore } from "@froggy/wallet";
import { Schema } from "effect";

import {
  createSchedule,
  handleDigest,
  handleSchedules,
} from "./schedule-routes";

const ALICE = userId("did:privy:alice");
// 2026-09-05T06:30:00Z, a Saturday: 08:30 in Berlin.
const NOW = Date.UTC(2026, 8, 5, 6, 30);

const remind = { _tag: "remind", text: "check the oven" } as const;

describe("createSchedule", () => {
  test("reads a delay in the person's last known zone, and says when UTC was assumed", async () => {
    const store = memoryStore();
    const first = await createSchedule(
      store,
      ALICE,
      { action: remind, label: "oven", when: { _tag: "in", minutes: 2 } },
      NOW
    );
    expect(first).toMatchObject({
      kind: "created",
      schedule: {
        cadence: { _tag: "once", at: NOW + 120_000 },
        timezone: "UTC",
      },
      timezoneDefaulted: true,
    });
    const berlin = await createSchedule(
      store,
      ALICE,
      {
        action: remind,
        label: "coffee",
        timezone: "Europe/Berlin",
        when: { _tag: "daily", time: "07:30" },
      },
      NOW + 1
    );
    expect(berlin).toMatchObject({
      kind: "created",
      // Tomorrow 07:30 CEST: half past seven has gone today.
      schedule: {
        nextRunAt: Date.UTC(2026, 8, 6, 5, 30),
        timezone: "Europe/Berlin",
      },
      timezoneDefaulted: false,
    });
    // No zone given: the Berlin one just used, not UTC.
    const later = await createSchedule(
      store,
      ALICE,
      { action: remind, label: "tea", when: { _tag: "daily", time: "16:00" } },
      NOW + 2
    );
    expect(later).toMatchObject({
      kind: "created",
      schedule: { timezone: "Europe/Berlin" },
      timezoneDefaulted: false,
    });
  });

  test("refuses a past local time, an unknown zone, and a twenty-first schedule", async () => {
    const store = memoryStore();
    expect(
      await createSchedule(
        store,
        ALICE,
        {
          action: remind,
          label: "gone",
          timezone: "Europe/Berlin",
          when: { _tag: "at", local: "2026-09-05T08:00" },
        },
        NOW
      )
    ).toMatchObject({ kind: "refused", status: 400 });
    expect(
      await createSchedule(
        store,
        ALICE,
        {
          action: remind,
          label: "where",
          timezone: "Mars/Olympus",
          when: { _tag: "in", minutes: 5 },
        },
        NOW
      )
    ).toMatchObject({ kind: "refused", status: 400 });
    await Promise.all(
      Array.from(
        { length: 20 },
        async (_, index) =>
          await createSchedule(
            store,
            ALICE,
            {
              action: remind,
              label: `n${index}`,
              when: { _tag: "in", minutes: 5 },
            },
            NOW
          )
      )
    );
    expect(
      await createSchedule(
        store,
        ALICE,
        { action: remind, label: "one more", when: { _tag: "in", minutes: 5 } },
        NOW
      )
    ).toMatchObject({ kind: "refused", status: 409 });
  });
});

const request = (method: string, path: string, body?: string): Request =>
  new Request(`http://localhost${path}`, {
    body: body ?? null,
    headers: { "content-type": "application/json" },
    method,
  });

const decodeCreated = Schema.decodeUnknownSync(
  Schema.Struct({ id: ScheduleId })
);
const decodeList = Schema.decodeUnknownSync(ScheduleList);

describe("handleSchedules and handleDigest", () => {
  test("creates, lists and cancels over HTTP, and answers 400 for a malformed body", async () => {
    const store = memoryStore();
    const bad = await handleSchedules(
      store,
      request("POST", "/api/schedules", JSON.stringify({ label: "x", v: 1 })),
      ALICE,
      "/api/schedules"
    );
    expect(bad?.status).toBe(400);
    const created = await handleSchedules(
      store,
      request(
        "POST",
        "/api/schedules",
        JSON.stringify({
          action: remind,
          label: "oven",
          v: 1,
          when: { _tag: "in", minutes: 1 },
        })
      ),
      ALICE,
      "/api/schedules"
    );
    expect(created?.status).toBe(201);
    const schedule = decodeCreated(await created?.json());
    const listed = await handleSchedules(
      store,
      request("GET", "/api/schedules"),
      ALICE,
      "/api/schedules"
    );
    const list = decodeList(await listed?.json());
    expect(list.schedules.map((row) => row.id)).toEqual([schedule.id]);
    const cancelled = await handleSchedules(
      store,
      request("DELETE", `/api/schedules/${schedule.id}`),
      ALICE,
      `/api/schedules/${schedule.id}`
    );
    expect(cancelled?.status).toBe(200);
    const again = await handleSchedules(
      store,
      request("DELETE", `/api/schedules/${schedule.id}`),
      ALICE,
      `/api/schedules/${schedule.id}`
    );
    expect(again?.status).toBe(404);
    expect(
      await handleSchedules(
        store,
        request("GET", "/api/wallet"),
        ALICE,
        "/api/wallet"
      )
    ).toBeNull();
  });

  test("keeps the digest's hour-and-zone shape over a daily schedule row", async () => {
    const store = memoryStore();
    const none = await handleDigest(
      store,
      request("GET", "/api/digest"),
      ALICE
    );
    expect(await none.json()).toEqual({ hour: null, timezone: "UTC" });
    const set = await handleDigest(
      store,
      request(
        "PUT",
        "/api/digest",
        JSON.stringify({ hour: 8, timezone: "Europe/Berlin" })
      ),
      ALICE
    );
    expect(await set.json()).toEqual({ hour: 8, timezone: "Europe/Berlin" });
    const digest = await store.schedules.digestOf(ALICE);
    expect(digest).toMatchObject({
      action: { _tag: "digest" },
      cadence: { _tag: "daily", time: "08:00" },
      status: "active",
    });
    const read = await handleDigest(
      store,
      request("GET", "/api/digest"),
      ALICE
    );
    expect(await read.json()).toEqual({ hour: 8, timezone: "Europe/Berlin" });
    await handleDigest(
      store,
      request(
        "PUT",
        "/api/digest",
        JSON.stringify({ hour: null, timezone: "Europe/Berlin" })
      ),
      ALICE
    );
    expect(await store.schedules.digestOf(ALICE)).toBeNull();
  });
});
