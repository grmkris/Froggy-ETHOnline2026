import { describe, expect, test } from "bun:test";

import { userId } from "@froggy/domain";
import type { ApprovalRequest } from "@froggy/protocol";

import { InteractionRegistry } from "./interactions";

const ALICE = userId("did:privy:alice");
const BOB = userId("did:privy:bob");

const request = (id: string, expiresAt: number): ApprovalRequest => ({
  amountLabel: "$0.05",
  detail: "Pay 0.05 tHBAR for the lending brief?",
  expiresAt,
  id,
  options: [
    { id: "no", kind: "deny", label: "Not this time" },
    { id: "yes", kind: "allow_once", label: "Allow once" },
  ],
  payeeLabel: "the oracle",
  purpose: "the lending brief",
  title: "Approve a spend",
});

const registry = () => {
  const requests: string[] = [];
  const resolved: string[] = [];
  const now = 1_000_000;
  const interactions = new InteractionRegistry({
    now: () => now,
    onRequest: (_user, req) => {
      requests.push(req.id);
    },
    onResolved: (_user, id) => {
      resolved.push(id);
    },
  });
  return { interactions, now, requests, resolved };
};

describe("InteractionRegistry", () => {
  test("publishes the card and resolves with the person's answer", async () => {
    const { interactions, now, requests, resolved } = registry();
    const controller = new AbortController();
    const parked = interactions.park({
      request: request("apr_1", now + 60_000),
      signal: controller.signal,
      userId: ALICE,
    });
    expect(requests).toEqual(["apr_1"]);
    expect(interactions.pendingFor(ALICE).length).toBe(1);
    expect(interactions.resolve(ALICE, "apr_1", "yes")).toBe(true);
    expect(await parked).toEqual({
      accessToken: null,
      kind: "answered",
      optionId: "yes",
    });
    expect(resolved).toEqual(["apr_1"]);
    expect(interactions.pendingFor(ALICE).length).toBe(0);
  });

  test("refuses an answer from someone else, and an option that was not offered", async () => {
    const { interactions, now } = registry();
    const controller = new AbortController();
    const parked = interactions.park({
      request: request("apr_2", now + 60_000),
      signal: controller.signal,
      userId: ALICE,
    });
    expect(interactions.resolve(BOB, "apr_2", "yes")).toBe(false);
    expect(interactions.resolve(ALICE, "apr_2", "maybe")).toBe(false);
    expect(interactions.resolve(ALICE, "apr_2", "no")).toBe(true);
    expect(await parked).toEqual({
      accessToken: null,
      kind: "answered",
      optionId: "no",
    });
  });

  test("an aborted run settles the card as aborted", async () => {
    const { interactions, now, resolved } = registry();
    const controller = new AbortController();
    const parked = interactions.park({
      request: request("apr_3", now + 60_000),
      signal: controller.signal,
      userId: ALICE,
    });
    controller.abort();
    expect(await parked).toMatchObject({ kind: "aborted" });
    expect(resolved).toEqual(["apr_3"]);
    // A late answer is a no-op, not a second resolution.
    expect(interactions.resolve(ALICE, "apr_3", "yes")).toBe(false);
  });

  test("the deadline settles the card when nobody answers", async () => {
    const { interactions, now } = registry();
    const controller = new AbortController();
    const parked = interactions.park({
      request: request("apr_4", now + 10),
      signal: controller.signal,
      userId: ALICE,
    });
    expect(await parked).toEqual({ kind: "deadline" });
  });

  test("abortAll denies every card one user has open and nobody else's", async () => {
    const { interactions, now } = registry();
    const controller = new AbortController();
    const a = interactions.park({
      request: request("apr_5", now + 60_000),
      signal: controller.signal,
      userId: ALICE,
    });
    const b = interactions.park({
      request: request("apr_6", now + 60_000),
      signal: controller.signal,
      userId: BOB,
    });
    interactions.abortAll(ALICE, "frozen");
    expect(await a).toEqual({ kind: "aborted", reason: "frozen" });
    expect(interactions.pendingFor(BOB).length).toBe(1);
    expect(interactions.resolve(BOB, "apr_6", "yes")).toBe(true);
    expect(await b).toMatchObject({ kind: "answered" });
  });
});
