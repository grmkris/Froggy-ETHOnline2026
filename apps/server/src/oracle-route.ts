/**
 * `GET /oracle/snapshot` — the thing we sell — and the book it is sold in.
 *
 * Hedera's track asks for a live x402-gated service *and* an agent that pays
 * one. This is the first half, and it is deliberately not a toy endpoint: what
 * it sells is the packed cross-protocol lending answer the agent would
 * otherwise have to assemble itself, which is what makes The Graph load-bearing
 * for the *payment* rather than a sidebar next to it.
 *
 * The order is proof, book, work. A payment proof is settled, then written to
 * the sales book with its hash, then the answer is fetched. So:
 *
 *   - the same proof presented twice finds its sale and gets the same answer
 *     back, without the facilitator being asked to settle it again;
 *   - an answer that fails after the money moved is a `failed` sale with the
 *     settlement on it, answered 502, not a 500 with a debit and no record;
 *   - anyone holding a sale id can fetch what it bought at `/oracle/sales/:id`.
 *
 * Priced per query rather than per seat — the track lists metering as worth
 * extra points, and a flat fee would not be a meter.
 */

import { SaleId } from "@froggy/domain";
import type { Sale } from "@froggy/domain";
import { describeCheapestBorrow, snapshotHash } from "@froggy/graph";
import type { GraphClient } from "@froggy/graph";
import {
  describePayment,
  encodeChallengeHeader,
  encodeSettlementHeader,
  paymentFrom,
} from "@froggy/payments";
import type { HcsWriter, OracleGate } from "@froggy/payments";
import type { Store } from "@froggy/wallet";
import { Schema } from "effect";

import { detached } from "./detached";

/** 0.05 HBAR in tinybars. Small enough to run the demo repeatedly. One place, so the card and the 402 cannot disagree. */
export const PRICE_TINYBARS = "5000000";

export const SALES_PATH = "/oracle/sales/";

export interface OracleDeps {
  readonly gate: OracleGate;
  readonly graph: GraphClient;
  readonly hcs: HcsWriter;
  readonly now?: () => number;
  readonly publicUrl: string;
  readonly store: Pick<Store, "sales">;
}

/**
 * What a sale delivers, as stored and as read back. Decoded on replay so a
 * document written by an older version is refused rather than half-served.
 */
const OracleAnswer = Schema.Struct({
  answer: Schema.String,
  capturedAt: Schema.Finite,
  markets: Schema.Array(
    Schema.Struct({
      blockNumber: Schema.Finite,
      borrowApr: Schema.Finite,
      chain: Schema.String,
      deploymentId: Schema.String,
      inputTokenSymbol: Schema.String,
      name: Schema.String,
      protocol: Schema.String,
      supplyApr: Schema.Finite,
      totalBorrowUsd: Schema.Finite,
      totalSupplyUsd: Schema.Finite,
    })
  ),
  snapshotHash: Schema.String,
  source: Schema.String,
  stubbed: Schema.Boolean,
});
type OracleAnswer = typeof OracleAnswer.Type;
const decodeOracleAnswer = Schema.decodeUnknownResult(OracleAnswer);

/** The proof's fingerprint: what the book is keyed on. Never the proof itself. */
const paymentHash = (paymentHeader: string): string =>
  new Bun.CryptoHasher("sha256").update(paymentHeader).digest("hex");

/**
 * The book stores the network as text; the settlement envelope wants CAIP-2.
 * A stored value that is not one is a row this version cannot vouch for, so
 * the header is left off rather than encoded wrong.
 */
const caip2 = (network: string): `${string}:${string}` | null => {
  const [namespace, reference, ...rest] = network.split(":");
  if (
    namespace === undefined ||
    reference === undefined ||
    namespace === "" ||
    reference === "" ||
    rest.length > 0
  ) {
    return null;
  }
  return `${namespace}:${reference}`;
};

const settlementHeaders = (sale: Sale): Headers => {
  const headers = new Headers({ "cache-control": "no-store" });
  const network = caip2(sale.network);
  if (sale.transactionId !== null && network !== null) {
    // The x402 convention for handing the settlement back to the payer: the
    // base64 `SettleResponse` envelope, which is what the agent — ours or
    // anyone's — puts on its receipt.
    const settlement = encodeSettlementHeader({
      network,
      transactionId: sale.transactionId,
    });
    headers.set("x-payment-response", settlement);
    headers.set("payment-response", settlement);
  }
  headers.set("x-froggy-sale", sale.id);
  return headers;
};

/** What a sale looks like to whoever asks about it: status and result, never the proof. */
const saleView = (sale: Sale) => ({
  amount: sale.amount,
  asset: sale.asset,
  at: sale.at,
  deliveredAt: sale.deliveredAt,
  error: sale.error,
  id: sale.id,
  network: sale.network,
  result: sale.result,
  status: sale.status,
  stubbed: sale.stubbed,
  transactionId: sale.transactionId,
});

/**
 * Answer from the book. A delivered sale is its result; a failed one says so
 * with the settlement still attached; a sale still being worked says come
 * back, because two arrivals of one proof must not both fetch.
 */
const answerFromBook = (sale: Sale): Response => {
  const headers = settlementHeaders(sale);
  switch (sale.status) {
    case "pending":
    case "uncertain": {
      return Response.json(
        {
          error:
            sale.error ??
            "Settlement is pending or uncertain. Do not pay again.",
          saleId: sale.id,
          status: sale.status,
        },
        { headers, status: 409 }
      );
    }
    case "rejected": {
      return Response.json(
        {
          error: sale.error ?? "The payment was rejected.",
          saleId: sale.id,
          status: sale.status,
        },
        { headers, status: 402 }
      );
    }
    case "delivered": {
      const stored = decodeOracleAnswer(sale.result);
      if (stored._tag === "Failure") {
        return Response.json(
          {
            error: "The stored answer is no longer readable.",
            saleId: sale.id,
          },
          { headers, status: 502 }
        );
      }
      return Response.json(
        { ...stored.success, replayed: true, saleId: sale.id },
        { headers }
      );
    }
    case "failed": {
      return Response.json(
        {
          error: sale.error ?? "The answer could not be assembled.",
          saleId: sale.id,
          settled: true,
        },
        { headers, status: 502 }
      );
    }
    case "settled": {
      return Response.json(
        {
          error: "This payment is being answered. Ask again in a moment.",
          saleId: sale.id,
        },
        { headers, status: 409 }
      );
    }
    default: {
      return Response.json({ error: "Unknown sale state." }, { status: 500 });
    }
  }
};

export const handleOracleRequest = async (
  deps: OracleDeps,
  request: Request
): Promise<Response> => {
  const now = deps.now ?? Date.now;
  const url = new URL(request.url);
  const symbol = url.searchParams.get("symbol") ?? "USDC";
  const resource = {
    description: `Cross-protocol ${symbol} lending snapshot, cheapest borrow first.`,
    units: PRICE_TINYBARS,
    url: deps.publicUrl,
  };

  const payment = paymentFrom(request.headers);
  if (payment === null) {
    const challenge = deps.gate.challenge(resource);
    // Body for v1 buyers, header for v2 ones; the same challenge either way.
    return Response.json(challenge, {
      headers: {
        "cache-control": "no-store",
        "payment-required": encodeChallengeHeader(challenge),
      },
      status: 402,
    });
  }

  // The book first. A proof we have seen is answered from what it bought,
  // before the facilitator could be asked to settle it a second time.
  const hash = paymentHash(payment);
  const seen = await deps.store.sales.byPaymentHash(hash);
  if (seen !== null) {
    return answerFromBook(seen);
  }

  const [requirements] = deps.gate.challenge(resource).accepts;
  if (requirements === undefined) {
    return Response.json(
      { error: "No payment requirements." },
      { status: 500 }
    );
  }

  const settled = await deps.gate.settle(payment, requirements);
  if (!settled.ok) {
    // 402 again, not 400: the request was well-formed, the payment was not
    // accepted, and a client that retries with a better payment is behaving
    // correctly rather than repeating a mistake.
    return Response.json(
      { error: settled.error ?? "Payment was not settled." },
      { status: 402 }
    );
  }

  // The money moved. The book is written before anything else can fail.
  const described = describePayment(payment);
  const recorded = await deps.store.sales.record({
    amount: requirements.amount,
    asset: requirements.asset,
    at: now(),
    deliveredAt: null,
    error: null,
    id: SaleId.generate(),
    network: requirements.network,
    payer: described.payer,
    paymentHash: hash,
    resource: `${deps.publicUrl}?symbol=${symbol}`,
    result: null,
    status: "settled",
    stubbed: settled.stubbed,
    transactionId: settled.transactionId,
  });
  if (!recorded.created) {
    // Lost a race with the same proof arriving twice within one settlement.
    return answerFromBook(recorded.sale);
  }
  const { sale } = recorded;

  if (sale.transactionId !== null) {
    // The public note. Not awaited: the buyer paid and is owed an answer now;
    // the note is for whoever audits later.
    const { transactionId } = sale;
    detached("hcs sale note", async () => {
      await deps.hcs.record({
        amount: requirements.amount,
        asset: requirements.asset,
        at: now(),
        kind: "sold",
        network: requirements.network,
        ref: sale.id,
        transactionId,
      });
    });
  }

  // Queried *after* settlement so the buyer pays for a fresh answer rather than
  // one that was assembled before they committed to buying it — and inside a
  // catch, because a fetch that fails now has already been paid for.
  try {
    const snapshot = await deps.graph.lendingMarkets(symbol);
    const result: OracleAnswer = {
      answer: describeCheapestBorrow(snapshot),
      capturedAt: snapshot.capturedAt,
      markets: snapshot.markets,
      snapshotHash: snapshotHash(snapshot),
      source: snapshot.source,
      stubbed: snapshot.stubbed || settled.stubbed,
    };
    await deps.store.sales.update(sale.id, {
      deliveredAt: now(),
      result,
      status: "delivered",
    });
    return Response.json(
      { ...result, saleId: sale.id },
      { headers: settlementHeaders(sale) }
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "the answer could not be assembled";
    await deps.store.sales.update(sale.id, {
      error: message,
      status: "failed",
    });
    return Response.json(
      { error: message, saleId: sale.id, settled: true },
      { headers: settlementHeaders(sale), status: 502 }
    );
  }
};

/** `GET /oracle/sales/:id`: what a sale bought. The id is the credential. */
export const handleSaleLookup = async (
  deps: Pick<OracleDeps, "store">,
  id: string
): Promise<Response> => {
  if (!SaleId.is(id)) {
    return Response.json({ error: "Not a sale id." }, { status: 404 });
  }
  const sale = await deps.store.sales.byId(id);
  if (sale === null) {
    return Response.json({ error: "No such sale." }, { status: 404 });
  }
  return Response.json(saleView(sale), {
    headers: { "cache-control": "no-store" },
  });
};
