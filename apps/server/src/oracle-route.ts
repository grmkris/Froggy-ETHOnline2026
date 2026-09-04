/**
 * `GET /oracle/snapshot` — the thing we sell.
 *
 * Hedera's track asks for a live x402-gated service *and* an agent that pays
 * one. This is the first half, and it is deliberately not a toy endpoint: what
 * it sells is the packed cross-protocol lending answer the agent would
 * otherwise have to assemble itself, which is what makes The Graph load-bearing
 * for the *payment* rather than a sidebar next to it.
 *
 * Priced per query rather than per seat — the track lists metering as worth
 * extra points, and a flat fee would not be a meter.
 */

import { describeCheapestBorrow, snapshotHash } from "@froggy/graph";
import type { GraphClient } from "@froggy/graph";
import type { OracleGate } from "@froggy/payments";

/** 0.05 HBAR in tinybars. Small enough to run the demo repeatedly. */
const PRICE_TINYBARS = "5000000";

export interface OracleDeps {
  readonly gate: OracleGate;
  readonly graph: GraphClient;
  readonly publicUrl: string;
}

export const handleOracleRequest = async (
  deps: OracleDeps,
  request: Request
): Promise<Response> => {
  const url = new URL(request.url);
  const symbol = url.searchParams.get("symbol") ?? "USDC";
  const resource = {
    description: `Cross-protocol ${symbol} lending snapshot, cheapest borrow first.`,
    units: PRICE_TINYBARS,
    url: deps.publicUrl,
  };

  const payment = request.headers.get("x-payment");
  if (payment === null) {
    const challenge = deps.gate.challenge(resource);
    return Response.json(challenge, {
      headers: { "cache-control": "no-store" },
      status: 402,
    });
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

  // Queried *after* settlement so the buyer pays for a fresh answer rather than
  // one that was assembled before they committed to buying it.
  const snapshot = await deps.graph.lendingMarkets(symbol);
  const headers = new Headers({ "cache-control": "no-store" });
  if (settled.transactionId !== null) {
    // The x402 convention for handing the settlement back to the payer, and
    // what the agent puts on its receipt.
    headers.set("x-payment-response", settled.transactionId);
  }

  return Response.json(
    {
      answer: describeCheapestBorrow(snapshot),
      capturedAt: snapshot.capturedAt,
      markets: snapshot.markets,
      snapshotHash: snapshotHash(snapshot),
      source: snapshot.source,
      stubbed: snapshot.stubbed || settled.stubbed,
    },
    { headers }
  );
};
