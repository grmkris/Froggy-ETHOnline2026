import { describe, expect, test } from "bun:test";

import { SaleId } from "@froggy/domain";
import { stubGraphClient } from "@froggy/graph";
import type { GraphClient } from "@froggy/graph";
import { challengeFrom, stubOracleGate } from "@froggy/payments";
import type {
  OracleGate,
  SettleOutcome,
  SettlementNote,
} from "@froggy/payments";
import { memoryStore } from "@froggy/wallet";

import {
  handleX402Demo,
  X402_DEMO_PATH,
  X402_DEMO_REPORT_PATH,
} from "./x402-demo";

const ORIGIN = "https://froggy.test";
const TOPIC = "0.0.10847557";
const proof = (nonce: string): string =>
  Buffer.from(
    JSON.stringify({
      accepted: {},
      payload: { nonce },
      x402Version: 2,
    })
  ).toString("base64");
const request = (path = X402_DEMO_REPORT_PATH, payment?: string): Request =>
  new Request(
    `${ORIGIN}${path}`,
    payment === undefined ? {} : { headers: { "payment-signature": payment } }
  );

const fixture = (options: { graph?: GraphClient; gate?: OracleGate } = {}) => {
  const gate = options.gate ?? stubOracleGate();
  const graph = options.graph ?? stubGraphClient();
  let settlements = 0;
  let queries = 0;
  const notes: SettlementNote[] = [];
  const services: Parameters<typeof handleX402Demo>[0] = {
    environment: {
      appOrigin: ORIGIN,
      modes: {
        browser: "stub",
        database: "stub",
        graph: "stub",
        hedera: "stub",
        model: "stub",
        privy: "stub",
        telegram: "stub",
      },
    },
    graph: {
      lendingMarkets: async (symbol) => {
        queries += 1;
        return await graph.lendingMarkets(symbol);
      },
    },
    // The report is on the service card, and the card says every settlement
    // leaves a public note, so this seller writes one too. Counted here so a
    // test can say whether it did.
    hcs: {
      ensure: async () => await Promise.resolve(TOPIC),
      mode: "stub" as const,
      record: async (note) => {
        notes.push(note);
        return await Promise.resolve({
          sequenceNumber: notes.length,
          topicId: TOPIC,
          transactionId: note.transactionId,
        });
      },
      topicId: () => TOPIC,
    },
    oracle: {
      ...gate,
      settle: async (payment, requirements) => {
        settlements += 1;
        return await gate.settle(payment, requirements);
      },
    },
    store: memoryStore(),
  };
  const handle = async (req: Request): Promise<Response> => {
    const response = await handleX402Demo(services, req);
    if (response === null) {
      throw new Error("The fixture did not match a demo route.");
    }
    return response;
  };
  const storedSale = async (response: Response) => {
    const id = response.headers.get("x-froggy-sale");
    if (id === null || !SaleId.is(id)) {
      throw new Error("The response has no sale reference.");
    }
    const sale = await services.store.sales.byId(id);
    if (sale === null) {
      throw new Error("The sale was not stored.");
    }
    return sale;
  };
  return {
    handle,
    services,
    storedSale,
    settlements: () => settlements,
    queries: () => queries,
    notes: () => notes,
  };
};

describe("Pond Observatory x402 demo", () => {
  test("the free landing has browser, chat and MCP instructions and charges nothing", async () => {
    const f = fixture();
    const response = await f.handle(request(X402_DEMO_PATH));
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get("payment-required")).toBeNull();
    expect(html).toContain(`href="${X402_DEMO_REPORT_PATH}"`);
    expect(html).toContain("Froggy chat prompt");
    expect(html).toContain("froggy_x402_request");
    expect(html).toContain("froggy_x402_status");
    expect(html).toContain("No real charge");
    expect(html).toContain("STUB");
    expect(f.settlements()).toBe(0);
    expect(f.queries()).toBe(0);
  });

  test("the report starts as HTML 402 with a bounded payable challenge", async () => {
    const f = fixture();
    const response = await f.handle(request());
    expect(response.status).toBe(402);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(response.headers.get("payment-required")?.length).toBeLessThan(
      32_768
    );
    const decoded = await challengeFrom(response);
    expect(decoded?.x402Version).toBe(2);
    expect(decoded?.accepts[0]?.scheme).toBe("exact");
    expect(decoded?.accepts[0]?.network).toBe("hedera:testnet");
    expect(decoded?.accepts[0]?.amount).toBe("5000000");
    expect(f.settlements()).toBe(0);
    expect(f.queries()).toBe(0);
  });

  test("a paid request renders and durably replays the report without a second settlement", async () => {
    const f = fixture();
    const payment = proof("one-report");
    const first = await f.handle(request(undefined, payment));
    const html = await first.text();
    expect(first.status).toBe(200);
    expect(first.headers.get("payment-response")).not.toBeNull();
    expect(first.headers.get("x-froggy-stubbed")).toBe("true");
    expect(html).toContain("USDC, across");
    expect(html).toContain("Aave V3 USDC");
    expect(html).toContain("4.87%");
    expect(html).toContain("STUB · recorded Graph fixture");
    expect(html).toContain("No real payment was made");
    expect(html).not.toContain(payment);
    expect(Buffer.byteLength(html)).toBeLessThan(65_536);
    const sale = await f.storedSale(first);
    expect(sale.status).toBe("delivered");
    expect(sale.resource).toBe(`${ORIGIN}${X402_DEMO_REPORT_PATH}`);
    expect(sale.stubbed).toBe(true);
    const repeated = await f.handle(request(undefined, payment));
    expect(await repeated.text()).toBe(html);
    expect(f.settlements()).toBe(1);
    expect(f.queries()).toBe(1);
  });

  test("a real settlement leaves the public note the service card promises", async () => {
    // The report is listed on /.well-known/x402.json, and the card — and the
    // door's catalogue, and the README — all say every settlement leaves a
    // note. It used to leave none, so froggy_receipt answered "no matching
    // note was found" for a purchase that had really happened.
    const f = fixture({
      gate: {
        ...stubOracleGate(),
        settle: async () =>
          await Promise.resolve({
            ok: true,
            stubbed: false,
            transactionId: "0.0.10571514@1788733693.213156813",
          }),
      },
    });
    const response = await f.handle(request(undefined, proof("noted")));
    expect(response.status).toBe(200);
    // The note is written detached, exactly as the snapshot seller writes its
    // own: the buyer paid and is owed the report now, and the trail is for
    // whoever audits later.
    await Promise.resolve();
    const [note] = f.notes();
    expect(note?.transactionId).toBe("0.0.10571514@1788733693.213156813");
    expect(note?.kind).toBe("sold");
    expect(note?.amount).toBe("5000000");
    const sale = await f.storedSale(response);
    expect(note?.ref).toBe(sale.id);
  });

  test("writes the note through whichever HCS writer the deployment has", async () => {
    // Same rule as the snapshot seller: the note follows the settlement id,
    // and a stub deployment's stub writer is what makes a stub run harmless.
    // Deciding here would put the loudness of a stub in two places.
    const f = fixture();
    await f.handle(request(undefined, proof("not-noted")));
    await Promise.resolve();
    expect(f.notes()).toHaveLength(1);
    expect(f.notes()[0]?.kind).toBe("sold");
  });

  test("concurrent duplicate proofs claim the sale before contacting the facilitator", async () => {
    const entered = Promise.withResolvers<null>();
    const release = Promise.withResolvers<SettleOutcome>();
    const f = fixture({
      gate: {
        ...stubOracleGate(),
        settle: async () => {
          entered.resolve(null);
          return await release.promise;
        },
      },
    });
    const payment = proof("concurrent");
    const first = f.handle(request(undefined, payment));
    await entered.promise;
    const simultaneous = await f.handle(request(undefined, payment));
    expect(simultaneous.status).toBe(409);
    const pending = await f.storedSale(simultaneous);
    expect(pending.status).toBe("pending");
    expect(f.settlements()).toBe(1);
    release.resolve({ ok: true, stubbed: true, transactionId: "stub-once" });
    const delivered = await first;
    expect(delivered.status).toBe(200);
    const replay = await f.handle(request(undefined, payment));
    expect(replay.status).toBe(200);
    expect(f.settlements()).toBe(1);
    expect(f.queries()).toBe(1);
  });

  test("an unknown settlement stays uncertain and cannot be resubmitted", async () => {
    const f = fixture({
      gate: {
        ...stubOracleGate(),
        settle: async () => {
          await Promise.resolve();
          throw new Error("connection lost after submit");
        },
      },
    });
    const payment = proof("uncertain");
    const first = await f.handle(request(undefined, payment));
    expect(first.status).toBe(409);
    const sale = await f.storedSale(first);
    expect(sale.status).toBe("uncertain");
    expect(first.headers.get("payment-response")).toBeNull();
    const replay = await f.handle(request(undefined, payment));
    expect(replay.status).toBe(409);
    expect(f.settlements()).toBe(1);
    expect(f.queries()).toBe(0);
  });

  test("rejected payment is recorded without claiming a settlement", async () => {
    const f = fixture({
      gate: {
        ...stubOracleGate(),
        settle: async () => {
          await Promise.resolve();
          return {
            ok: false,
            error: "Proof expired",
            stubbed: true,
            transactionId: null,
          };
        },
      },
    });
    const payment = proof("rejected");
    const first = await f.handle(request(undefined, payment));
    expect(first.status).toBe(402);
    const sale = await f.storedSale(first);
    expect(sale.status).toBe("rejected");
    expect(first.headers.get("payment-response")).toBeNull();
    const replay = await f.handle(request(undefined, payment));
    expect(replay.status).toBe(402);
    expect(f.settlements()).toBe(1);
    expect(f.queries()).toBe(0);
  });

  test("a failed report preserves its paid sale and never buys or queries again", async () => {
    const f = fixture({
      graph: {
        lendingMarkets: async () => {
          await Promise.resolve();
          throw new Error("provider failure with private diagnostics");
        },
      },
    });
    const payment = proof("delivery-failed");
    const first = await f.handle(request(undefined, payment));
    expect(first.status).toBe(502);
    expect(first.headers.get("payment-response")).not.toBeNull();
    const html = await first.text();
    expect(html).toContain("Paid, report unavailable");
    expect(html).not.toContain("private diagnostics");
    const sale = await f.storedSale(first);
    expect(sale.status).toBe("failed");
    expect(sale.transactionId).not.toBeNull();
    const replay = await f.handle(request(undefined, payment));
    expect(replay.status).toBe(502);
    expect(f.settlements()).toBe(1);
    expect(f.queries()).toBe(1);
  });

  test("provider text is escaped and bounded before becoming report HTML", async () => {
    const snapshot = await stubGraphClient().lendingMarkets("USDC");
    const f = fixture({
      graph: {
        lendingMarkets: async () => {
          await Promise.resolve();
          return {
            ...snapshot,
            markets: snapshot.markets.map((market) => ({
              ...market,
              name: `<script>alert("provider")</script>${"x".repeat(100_000)}`,
            })),
          };
        },
      },
    });
    const response = await f.handle(request(undefined, proof("escaped")));
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(Buffer.byteLength(html)).toBeLessThan(65_536);
  });

  test("malformed or oversized proofs and unsupported requests never settle", async () => {
    const f = fixture();
    const malformed = await f.handle(request(undefined, "not base64"));
    const oversized = await f.handle(request(undefined, "a".repeat(32_772)));
    const post = await f.handle(
      new Request(`${ORIGIN}${X402_DEMO_REPORT_PATH}`, { method: "POST" })
    );
    const variant = await f.handle(
      request(`${X402_DEMO_REPORT_PATH}?symbol=ETH`)
    );
    expect(malformed.status).toBe(400);
    expect(oversized.status).toBe(400);
    expect(post.status).toBe(405);
    expect(variant.status).toBe(400);
    expect(await handleX402Demo(f.services, request("/elsewhere"))).toBeNull();
    expect(f.settlements()).toBe(0);
    expect(f.queries()).toBe(0);
  });
});
