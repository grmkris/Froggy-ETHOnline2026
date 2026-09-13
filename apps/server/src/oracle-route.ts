/** Historical oracle sale reads; new tool purchases use authenticated platform credits. */
import { SaleId } from "@froggy/domain";
import type { Sale } from "@froggy/domain";
import { encodeSettlementHeader, paymentFrom } from "@froggy/payments";
import type { Store } from "@froggy/wallet";
import { Schema } from "effect";

export const SALES_PATH = "/oracle/sales/";

export interface OracleDeps {
  readonly publicUrl: string;
  readonly store: Pick<Store, "sales">;
}

/** New anonymous purchases are retired; old sale credentials remain readable. */
export const retiredSaleResponse = (origin: string): Response =>
  Response.json(
    {
      v: 1,
      code: "platform_credits_required",
      error:
        "Sign in to Froggy and buy platform credits before requesting tools. Anonymous per-resource payments are retired.",
      signIn: origin,
      credits: `${origin}/wallet`,
      mcp: `${origin}/mcp`,
      skill: `${origin}/skill.md`,
    },
    { status: 410, headers: { "cache-control": "no-store" } }
  );

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
  const payment = paymentFrom(request.headers);
  if (payment !== null && payment.length <= 32_768) {
    const seen = await deps.store.sales.byPaymentHash(paymentHash(payment));
    if (
      seen !== null &&
      new URL(seen.resource).pathname === new URL(deps.publicUrl).pathname
    ) {
      return answerFromBook(seen);
    }
  }
  return retiredSaleResponse(new URL(deps.publicUrl).origin);
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
