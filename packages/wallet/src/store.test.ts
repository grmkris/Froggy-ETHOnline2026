import { describe, expect, it } from "bun:test";

import {
  AgentTokenId,
  MandateId,
  OAuthClientId,
  OAuthGrantId,
  ReceiptId,
  RunId,
  SaleId,
  ScheduleId,
  SessionId,
  SpendId,
  TabId,
  TaskId,
  WalletConnectionId,
  WalletRequestId,
  ApprovalId,
  EvmAddress,
  parQuote,
  usdMicros,
  userId,
} from "@froggy/domain";
import type {
  Mandate,
  Receipt,
  Sale,
  Schedule,
  Task,
  WalletConnection,
  WalletRequest,
} from "@froggy/domain";
import { Schema } from "effect";

import { memoryStore, readReceipts } from "./store";

const ALICE = userId("did:privy:store-test");
const NOW = 1_756_000_000_000;

const receipt = (at: number): Receipt => ({
  at,
  decision: { _tag: "allow", satisfied: [] },
  id: ReceiptId.generate(),
  intent: {
    amount: {
      asset: {
        decimals: 8,
        id: "0.0.0",
        network: "hedera:testnet",
        symbol: "HBAR",
      },
      units: "1",
    },
    idempotencyKey: `k-${at}`,
    payee: { id: "0.0.1", label: "oracle", provenance: "server" },
    purpose: "test",
    usdMicros: usdMicros(1),
  },
  quote: parQuote(at),
  runId: RunId.generate(),
  sessionId: SessionId.generate(),
  spendId: SpendId.generate(),
  stubbed: true,
});

describe("memoryStore", () => {
  it("forgets a person entirely", async () => {
    const store = memoryStore();
    await store.receipts.append(ALICE, receipt(NOW));
    await store.pocket.adjust(ALICE, 500_000);
    await store.forget(ALICE);
    expect(await store.receipts.recent(ALICE, 10)).toEqual([]);
    expect(await store.mandates.load(ALICE)).toBeNull();
    // Null, not zero: the next session credits the starting allowance again.
    expect(await store.pocket.load(ALICE)).toBeNull();
  });

  it("remembers the welcome once, and forgets it with the person", async () => {
    const store = memoryStore();
    expect(await store.setup.load(ALICE)).toBeNull();
    await store.setup.save(ALICE, NOW);
    expect(await store.setup.load(ALICE)).toBe(NOW);
    // Null shows the welcome again; a person can ask for that from Home.
    await store.setup.save(ALICE, null);
    expect(await store.setup.load(ALICE)).toBeNull();
    await store.setup.save(ALICE, NOW);
    await store.forget(ALICE);
    expect(await store.setup.load(ALICE)).toBeNull();
  });

  it("keeps a person's Hedera account, through forget", async () => {
    const store = memoryStore();
    expect(await store.hedera.load(ALICE)).toBeNull();
    await store.hedera.save(ALICE, {
      accountId: "0.0.4242",
      custody: { keyCiphertext: "v1.nonce.body", kind: "sealed" },
    });
    await store.forget(ALICE);
    // The account holds money, so it outlives the preferences.
    expect(await store.hedera.load(ALICE)).toEqual({
      accountId: "0.0.4242",
      custody: { keyCiphertext: "v1.nonce.body", kind: "sealed" },
    });
  });

  it("keeps a pocket that never goes negative, and knows never from zero", async () => {
    const store = memoryStore();
    expect(await store.pocket.load(ALICE)).toBeNull();
    expect(await store.pocket.adjust(ALICE, 500_000)).toBe(500_000);
    expect(await store.pocket.adjust(ALICE, -200_000)).toBe(300_000);
    // A debit the balance cannot cover floors at zero rather than going into
    // debt; the policy is what stops it being asked for in the first place.
    expect(await store.pocket.adjust(ALICE, -900_000)).toBe(0);
    // A top-up after the floor is credited in full: zero is a balance, not a state.
    expect(await store.pocket.adjust(ALICE, 100_000)).toBe(100_000);
    expect(await store.pocket.load(ALICE)).toBe(100_000);
  });

  it("returns receipts newest first, capped", async () => {
    const store = memoryStore();
    await store.receipts.append(ALICE, receipt(NOW));
    await store.receipts.append(ALICE, receipt(NOW + 1));
    await store.receipts.append(ALICE, receipt(NOW + 2));

    const recent = await store.receipts.recent(ALICE, 2);
    expect(recent.map((r) => r.at)).toEqual([NOW + 2, NOW + 1]);
  });

  it("round-trips a mandate", async () => {
    const store = memoryStore();
    const mandate: Mandate = {
      createdAt: NOW,
      id: MandateId.generate(),
      rules: [],
      sessionId: SessionId.generate(),
    };
    expect(await store.mandates.load(ALICE)).toBeNull();

    await store.mandates.save(ALICE, mandate);

    expect(await store.mandates.load(ALICE)).toEqual(mandate);
  });
});

const sale = (paymentHash: string): Sale => ({
  amount: "5000000",
  asset: "0.0.0",
  at: NOW,
  deliveredAt: null,
  error: null,
  id: SaleId.generate(),
  network: "hedera:testnet",
  payer: "0.0.9700388",
  paymentHash,
  resource: "https://example.test/oracle/snapshot?symbol=USDC",
  result: null,
  status: "settled",
  stubbed: true,
  transactionId: "stub-not-a-real-hedera-transaction-1",
});

const task = (key: string | null): Task => ({
  agentTokenId: null,
  connectionId: null,
  createdAt: NOW,
  error: null,
  id: TaskId.generate(),
  idempotencyKey: key,
  input: { symbol: "USDC" },
  kind: "brief",
  priceUsdMicros: usdMicros(50_000),
  result: null,
  runId: null,
  saleId: null,
  status: "quoted",
  updatedAt: NOW,
});

describe("memoryStore sales, tasks and agent tokens", () => {
  it("records a sale once per payment proof and tells only the first caller it created it", async () => {
    const store = memoryStore();
    const first = await store.sales.record(sale("proof-a"));
    const again = await store.sales.record({
      ...sale("proof-a"),
      id: SaleId.generate(),
    });
    expect(first.created).toBe(true);
    expect(again.created).toBe(false);
    expect(again.sale.id).toBe(first.sale.id);
    await store.sales.update(first.sale.id, {
      deliveredAt: NOW + 1,
      result: { answer: "Euler 2.76%" },
      status: "delivered",
    });
    const byHash = await store.sales.byPaymentHash("proof-a");
    expect(byHash?.status).toBe("delivered");
    const byId = await store.sales.byId(first.sale.id);
    expect(byId?.result).toEqual({ answer: "Euler 2.76%" });
  });

  it("returns the same task for a repeated idempotency key, and none across people", async () => {
    const store = memoryStore();
    const created = task("hermes-1");
    await store.tasks.create(ALICE, created);
    const byKey = await store.tasks.byIdempotencyKey(ALICE, "hermes-1");
    expect(byKey?.id).toBe(created.id);
    expect(
      await store.tasks.byIdempotencyKey(userId("did:privy:bob"), "hermes-1")
    ).toBeNull();
    await store.tasks.update(ALICE, created.id, {
      status: "done",
      updatedAt: NOW + 5,
    });
    const updated = await store.tasks.byId(ALICE, created.id);
    expect(updated?.status).toBe("done");
    expect(
      await store.tasks.byId(userId("did:privy:bob"), created.id)
    ).toBeNull();
  });

  it("looks a token up by its hash until it is revoked, and never returns the hash", async () => {
    const store = memoryStore();
    const id = AgentTokenId.generate();
    await store.agents.create(ALICE, {
      createdAt: NOW,
      id,
      label: "Hermes",
      lastUsedAt: null,
      revokedAt: null,
      secretHash: "hash-1",
    });
    const found = await store.agents.lookup("hash-1");
    expect(found?.userId).toBe(ALICE);
    expect(found?.token).not.toHaveProperty("secretHash");
    await store.agents.touch(id, NOW + 2);
    const touched = await store.agents.list(ALICE);
    expect(touched[0]?.lastUsedAt).toBe(NOW + 2);
    await store.agents.revoke(ALICE, id);
    expect(await store.agents.lookup("hash-1")).toBeNull();
    const revoked = await store.agents.list(ALICE);
    expect(revoked[0]?.revokedAt).not.toBeNull();
  });

  it("forgets a person's tasks and tokens but keeps the seller's sales", async () => {
    const store = memoryStore();
    await store.tasks.create(ALICE, task(null));
    await store.agents.create(ALICE, {
      createdAt: NOW,
      id: AgentTokenId.generate(),
      label: "Hermes",
      lastUsedAt: null,
      revokedAt: null,
      secretHash: "hash-2",
    });
    const recorded = await store.sales.record(sale("proof-b"));
    await store.forget(ALICE);
    expect(await store.tasks.list(ALICE, 10)).toEqual([]);
    expect(await store.agents.list(ALICE)).toEqual([]);
    expect(await store.sales.byId(recorded.sale.id)).not.toBeNull();
  });
});

const reminder = (nextRunAt: number, createdAt = NOW): Schedule => ({
  action: { _tag: "remind", text: "check the oven" },
  cadence: { _tag: "once", at: nextRunAt },
  createdAt,
  id: ScheduleId.generate(),
  label: "oven",
  lastRunAt: null,
  nextRunAt,
  status: "active",
  timezone: "Europe/Berlin",
});

const digest = (nextRunAt: number): Schedule => ({
  ...reminder(nextRunAt),
  action: { _tag: "digest" },
  cadence: { _tag: "daily", time: "08:00" },
  label: "Daily digest",
});

describe("memoryStore schedules", () => {
  it("creates, lists newest first and cancels only an active row of the owner's", async () => {
    const store = memoryStore();
    const first = reminder(NOW + 60_000, NOW);
    const second = reminder(NOW + 120_000, NOW + 1);
    await store.schedules.create(ALICE, first);
    await store.schedules.create(ALICE, second);
    const listed = await store.schedules.list(ALICE);
    expect(listed.map((row) => row.id)).toEqual([second.id, first.id]);
    expect(
      await store.schedules.cancel(userId("did:privy:bob"), first.id)
    ).toBe(false);
    expect(await store.schedules.cancel(ALICE, first.id)).toBe(true);
    expect(await store.schedules.cancel(ALICE, first.id)).toBe(false);
    const afterCancel = await store.schedules.list(ALICE);
    expect(afterCancel.find((row) => row.id === first.id)).toMatchObject({
      nextRunAt: null,
      status: "cancelled",
    });
    expect(await store.schedules.timezoneFor(ALICE)).toBe("Europe/Berlin");
    expect(await store.schedules.timezoneFor(userId("did:privy:bob"))).toBe(
      null
    );
  });

  it("claims a due row once, and again only after the claim goes stale", async () => {
    const store = memoryStore();
    const due = reminder(NOW);
    await store.schedules.create(ALICE, due);
    await store.schedules.create(ALICE, reminder(NOW + 3_600_000));
    const first = await store.schedules.claimDue(NOW, 600_000);
    expect(first.map((row) => row.schedule.id)).toEqual([due.id]);
    expect(first[0]?.userId).toBe(ALICE);
    expect(await store.schedules.claimDue(NOW + 1000, 600_000)).toEqual([]);
    // The process that claimed it died: past the stale window it is due again.
    const again = await store.schedules.claimDue(NOW + 600_001, 600_000);
    expect(again.map((row) => row.schedule.id)).toEqual([due.id]);
  });

  it("finish clears the claim, writes the outcome and keeps lastRunAt on a retry", async () => {
    const store = memoryStore();
    const due = reminder(NOW);
    await store.schedules.create(ALICE, due);
    await store.schedules.claimDue(NOW, 600_000);
    await store.schedules.finish(due.id, NOW, {
      nextRunAt: NOW + 60_000,
      status: "active",
    });
    // Unclaimed and due again in a minute, with no run recorded.
    const [retry] = await store.schedules.list(ALICE);
    expect(retry).toMatchObject({
      lastRunAt: null,
      nextRunAt: NOW + 60_000,
      status: "active",
    });
    expect(await store.schedules.claimDue(NOW + 60_000, 600_000)).toHaveLength(
      1
    );
    await store.schedules.finish(due.id, NOW + 60_000, {
      lastRunAt: NOW + 60_000,
      nextRunAt: null,
      status: "done",
    });
    const [done] = await store.schedules.list(ALICE);
    expect(done).toMatchObject({
      lastRunAt: NOW + 60_000,
      nextRunAt: null,
      status: "done",
    });
    expect(await store.schedules.claimDue(NOW + 120_000, 600_000)).toEqual([]);
  });

  it("keeps one digest per person: saving replaces, null removes", async () => {
    const store = memoryStore();
    expect(await store.schedules.digestOf(ALICE)).toBeNull();
    const morning = digest(NOW + 3_600_000);
    await store.schedules.saveDigest(ALICE, morning);
    const first = await store.schedules.digestOf(ALICE);
    expect(first?.id).toBe(morning.id);
    const evening = digest(NOW + 7_200_000);
    await store.schedules.saveDigest(ALICE, evening);
    const second = await store.schedules.digestOf(ALICE);
    expect(second?.id).toBe(evening.id);
    const rows = await store.schedules.list(ALICE);
    expect(rows.find((row) => row.id === morning.id)?.status).toBe("cancelled");
    await store.schedules.saveDigest(ALICE, null);
    expect(await store.schedules.digestOf(ALICE)).toBeNull();
  });

  it("forgets a person's schedules", async () => {
    const store = memoryStore();
    await store.schedules.create(ALICE, reminder(NOW));
    await store.forget(ALICE);
    expect(await store.schedules.list(ALICE)).toEqual([]);
    expect(await store.schedules.claimDue(NOW, 600_000)).toEqual([]);
  });
});

const oauthClient = () => ({
  createdAt: NOW,
  id: OAuthClientId.generate(),
  name: "Claude Code",
  redirectUris: ["http://127.0.0.1/callback"],
});

const oauthGrant = (clientId: OAuthClientId) => ({
  clientId,
  clientName: "Claude Code",
  createdAt: NOW,
  id: OAuthGrantId.generate(),
  lastUsedAt: null,
  revokedAt: null,
  scopes: ["services" as const],
});

const oauthToken = (grantId: OAuthGrantId, hash: string) => ({
  codeChallenge: null,
  createdAt: NOW,
  expiresAt: NOW + 3_600_000,
  grantId,
  hash,
  kind: "access" as const,
  redirectUri: null,
  resource: null,
  revokedAt: null,
  scopes: ["services" as const],
  usedAt: null,
});

describe("memoryStore oauth", () => {
  it("consumes a token once: true, then false on the replay", async () => {
    const store = memoryStore();
    const client = oauthClient();
    await store.oauth.clients.create(client);
    const grant = oauthGrant(client.id);
    await store.oauth.grants.create(ALICE, grant);
    await store.oauth.tokens.insert(oauthToken(grant.id, "code-1"));
    expect(await store.oauth.tokens.consume("code-1", NOW + 1)).toBe(true);
    expect(await store.oauth.tokens.consume("code-1", NOW + 2)).toBe(false);
    expect(await store.oauth.tokens.consume("never-issued", NOW + 2)).toBe(
      false
    );
    // The row is still readable: a used code is the replay signal, not gone.
    const used = await store.oauth.tokens.byHash("code-1");
    expect(used?.usedAt).toBe(NOW + 1);
  });

  it("hides every token under a revoked grant, and lists the grant as revoked", async () => {
    const store = memoryStore();
    const client = oauthClient();
    await store.oauth.clients.create(client);
    const grant = oauthGrant(client.id);
    await store.oauth.grants.create(ALICE, grant);
    await store.oauth.tokens.insert(oauthToken(grant.id, "access-1"));
    await store.oauth.tokens.insert(oauthToken(grant.id, "refresh-1"));
    await store.oauth.grants.touch(grant.id, NOW + 3);
    const touched = await store.oauth.grants.byId(grant.id);
    expect(touched?.grant.lastUsedAt).toBe(NOW + 3);
    // Somebody else's id cannot revoke it.
    expect(
      await store.oauth.grants.revoke(userId("did:privy:bob"), grant.id, NOW)
    ).toBe(false);
    expect(await store.oauth.grants.revoke(ALICE, grant.id, NOW + 4)).toBe(
      true
    );
    await store.oauth.tokens.revokeAllForGrant(grant.id, NOW + 4);
    expect(await store.oauth.tokens.byHash("access-1")).toBeNull();
    expect(await store.oauth.tokens.byHash("refresh-1")).toBeNull();
    const listed = await store.oauth.grants.list(ALICE);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.revokedAt).toBe(NOW + 4);
    expect(listed[0]?.clientName).toBe("Claude Code");
    expect(await store.oauth.clients.byId(client.id)).toEqual(client);
  });

  it("forgets a person's grants and their tokens", async () => {
    const store = memoryStore();
    const client = oauthClient();
    await store.oauth.clients.create(client);
    const grant = oauthGrant(client.id);
    await store.oauth.grants.create(ALICE, grant);
    await store.oauth.tokens.insert(oauthToken(grant.id, "access-2"));
    await store.forget(ALICE);
    expect(await store.oauth.grants.list(ALICE)).toEqual([]);
    expect(await store.oauth.grants.byId(grant.id)).toBeNull();
    expect(await store.oauth.tokens.byHash("access-2")).toBeNull();
  });
});

const ACCOUNT = Schema.decodeUnknownSync(EvmAddress)(
  "0x00000000000000000000000000000000000000aa"
);
const ORIGIN = "https://app.example";

const walletRequest = (at: number): WalletRequest => ({
  approvalId: null,
  chainId: 8453,
  contextId: "ctx-1",
  createdAt: at,
  delivery: "pending",
  error: null,
  expiresAt: at + 300_000,
  fingerprint: "fp",
  id: WalletRequestId.generate(),
  initiatedDuring: "human",
  kind: "personal_sign",
  nonce: null,
  origin: ORIGIN,
  pageRequestId: "p-1",
  payload: { address: ACCOUNT, kind: "personal_sign", message: "0x68690a" },
  receiptId: null,
  runId: null,
  signedHash: null,
  status: "pending",
  stubbed: true,
  summary: [],
  tabId: TabId.generate(),
  topOrigin: ORIGIN,
  transactionHash: null,
  updatedAt: at,
  userId: ALICE,
});

const walletConnection = (at: number): WalletConnection => ({
  address: ACCOUNT,
  approvalId: ApprovalId.generate(),
  chainId: 8453,
  grantedAt: at,
  id: WalletConnectionId.generate(),
  origin: ORIGIN,
  revokedAt: null,
  userId: ALICE,
});

describe("memoryStore wallet requests", () => {
  it("updates only when the status is one the caller expected", async () => {
    const store = memoryStore();
    const request = await store.walletRequests.create(
      ALICE,
      walletRequest(NOW)
    );
    const advanced = await store.walletRequests.update(
      ALICE,
      request.id,
      ["pending"],
      { status: "awaiting_approval", updatedAt: NOW + 1 }
    );
    expect(advanced?.status).toBe("awaiting_approval");
    const stale = await store.walletRequests.update(
      ALICE,
      request.id,
      ["pending"],
      { status: "approved", updatedAt: NOW + 2 }
    );
    expect(stale).toBeNull();
    const current = await store.walletRequests.byId(ALICE, request.id);
    expect(current?.status).toBe("awaiting_approval");
  });

  it("scopes reads to the owner and lists newest first", async () => {
    const store = memoryStore();
    const older = await store.walletRequests.create(ALICE, walletRequest(NOW));
    const newer = await store.walletRequests.create(
      ALICE,
      walletRequest(NOW + 10)
    );
    const bob = userId("did:privy:store-test-bob");
    expect(await store.walletRequests.byId(bob, older.id)).toBeNull();
    const listed = await store.walletRequests.list(ALICE, 10);
    expect(listed.map((row) => row.id)).toEqual([newer.id, older.id]);
  });

  it("finds in-flight requests across owners for recovery", async () => {
    const store = memoryStore();
    const bob = userId("did:privy:store-test-bob");
    const mine = await store.walletRequests.create(ALICE, walletRequest(NOW));
    await store.walletRequests.create(bob, {
      ...walletRequest(NOW + 1),
      status: "confirmed",
      userId: bob,
    });
    const inFlight = await store.walletRequests.inFlight(["pending", "sent"]);
    expect(inFlight.map((row) => row.request.id)).toEqual([mine.id]);
    expect(inFlight[0]?.userId).toBe(ALICE);
  });
});

describe("memoryStore wallet connections", () => {
  it("keeps one active connection per origin and revokes as a unit", async () => {
    const store = memoryStore();
    const first = await store.walletConnections.grant(
      ALICE,
      walletConnection(NOW)
    );
    const second = await store.walletConnections.grant(
      ALICE,
      walletConnection(NOW + 5)
    );
    const active = await store.walletConnections.active(ALICE, ORIGIN);
    expect(active?.id).toBe(second.id);
    expect(await store.walletConnections.list(ALICE)).toHaveLength(1);
    expect(await store.walletConnections.revoke(ALICE, first.id, NOW + 6)).toBe(
      false
    );
    expect(
      await store.walletConnections.revoke(ALICE, second.id, NOW + 7)
    ).toBe(true);
    expect(await store.walletConnections.active(ALICE, ORIGIN)).toBeNull();
    expect(await store.walletConnections.list(ALICE)).toEqual([]);
  });

  it("forget clears connections and requests", async () => {
    const store = memoryStore();
    await store.walletConnections.grant(ALICE, walletConnection(NOW));
    const request = await store.walletRequests.create(
      ALICE,
      walletRequest(NOW)
    );
    await store.forget(ALICE);
    expect(await store.walletConnections.list(ALICE)).toEqual([]);
    expect(await store.walletRequests.byId(ALICE, request.id)).toBeNull();
  });
});

describe("readReceipts", () => {
  it("skips a document that no longer decodes rather than failing the batch", () => {
    const good = receipt(NOW);
    const read = readReceipts([good, { not: "a receipt" }, null]);
    expect(read.length).toBe(1);
    expect(read[0]?.id).toBe(good.id);
  });
});
