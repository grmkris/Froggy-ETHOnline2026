/** A small seller whose original HTML page opens after an x402 payment. */
import { SaleId } from "@froggy/domain";
import type { Sale } from "@froggy/domain";
import { snapshotHash } from "@froggy/graph";
import type { GraphSnapshot, LendingMarket } from "@froggy/graph";
import {
  describePayment,
  encodeChallengeHeader,
  encodeSettlementHeader,
  paymentFrom,
} from "@froggy/payments";
import type { OracleGate, SettleOutcome } from "@froggy/payments";
import { Schema } from "effect";

import { PRICE_TINYBARS } from "./oracle-route";
import type { Services } from "./services";

export const X402_DEMO_PATH = "/demo/x402";
export const X402_DEMO_REPORT_PATH = `${X402_DEMO_PATH}/report`;
const MAX_HTML_BYTES = 65_536;
const MAX_PAYMENT_HEADER = 32_768;
const SETTLEMENT_TIMEOUT_MS = 15_000;

interface DemoServices extends Pick<Services, "graph" | "oracle" | "store"> {
  readonly environment: Pick<Services["environment"], "appOrigin" | "modes">;
}

const StoredReport = Schema.Struct({
  v: Schema.Literal(1),
  html: Schema.String.check(Schema.isMaxLength(MAX_HTML_BYTES)),
  stubbed: Schema.Boolean,
});
const decodeReport = Schema.decodeUnknownResult(StoredReport);
const PaymentEnvelope = Schema.Struct({
  accepted: Schema.Unknown,
  payload: Schema.Unknown,
  x402Version: Schema.Literal(2),
});
const decodePaymentEnvelope = Schema.decodeUnknownResult(
  Schema.fromJsonString(PaymentEnvelope)
);

const escaped = (value: string, limit = 2000): string =>
  value
    .slice(0, limit)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

// Semantic palette shared with packages/ui/src/styles/globals.css. The
// report is standalone HTML, so it does not depend on the SPA stylesheet.
const CSS = `
:root{color-scheme:light;--background:#eff1ec;--card:#fcfdfb;--muted:#f3f5f0;--border:#e2e6df;--foreground:#15201a;--muted-foreground:#6b776f;--primary:#2f7a4c;--brand-soft:#e2efe6;--primary-foreground:#f6fbf7;--drive-agent-soft:#f8f0e2;--drive-agent-foreground:#7a4f10;--ring:var(--primary)}
*{box-sizing:border-box}body{margin:0;color:var(--foreground);background:var(--background);font:16px/1.6 "Avenir Next","Segoe UI",sans-serif}a{color:inherit}a:focus-visible,textarea:focus-visible,summary:focus-visible{outline:3px solid var(--ring);outline-offset:5px}::selection{background:var(--brand-soft)}
.sheet{max-width:1180px;margin:0 auto;padding:36px 48px 56px}.masthead{display:flex;align-items:center;justify-content:space-between;gap:24px;padding-bottom:22px;border-bottom:1px solid var(--foreground)}.brand{font-family:Georgia,"Times New Roman",serif;font-size:29px;letter-spacing:-1px;text-decoration:none;line-height:1.1}.brand span{display:block;margin-top:7px;font:10px/1.2 "Courier New",monospace;letter-spacing:2.5px;text-transform:uppercase}.workspace{font-size:13px;text-underline-offset:5px}.eyebrow{margin:0;font:11px/1.5 "Courier New",monospace;letter-spacing:1.8px;text-transform:uppercase;color:var(--muted-foreground)}
.hero{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(260px,1fr);gap:64px;align-items:start;padding:62px 0 52px}.hero h1,.report-title{font:clamp(44px,5.8vw,78px)/1.04 Georgia,"Times New Roman",serif;letter-spacing:-3.3px;margin:18px 0 24px;font-weight:400}.hero h1 em{font-weight:400;color:var(--primary)}.lede{max-width:510px;font-size:17px;color:var(--muted-foreground)}.seal{display:inline-flex;gap:7px;align-items:center;border:1px solid var(--border);border-radius:999px;padding:5px 10px;font:10px/1.4 "Courier New",monospace;letter-spacing:.4px;background:var(--card)}.seal.stub{background:var(--drive-agent-soft);border-color:var(--drive-agent-soft);color:var(--drive-agent-foreground)}.seal.live{background:var(--brand-soft);color:var(--primary)}.badges{display:flex;gap:8px;flex-wrap:wrap;margin-top:24px}
.offer{position:relative;padding:28px;background:var(--card);border:1px solid var(--border);box-shadow:0 20px 45px -35px var(--foreground)}.offer:before{content:"";display:block;width:46px;height:46px;border-radius:50% 50% 50% 0;background:var(--brand-soft);transform:rotate(-25deg);margin-bottom:36px}.offer h2{font:27px/1.15 Georgia,serif;margin:16px 0}.offer .price{font:38px/1.2 Georgia,serif;margin:22px 0 0}.price small{font:13px/1.5 "Avenir Next","Segoe UI",sans-serif;color:var(--muted-foreground)}.offer p{font-size:14px}.rule{border:0;border-top:1px solid var(--border);margin:23px 0}.button{display:block;background:var(--primary);color:var(--primary-foreground);padding:15px 18px;font-size:14px;font-weight:600;text-align:center;text-decoration:none;border-radius:5px}.button:hover{background:var(--foreground)}.quiet{font-size:12px!important;color:var(--muted-foreground)}
.steps{display:grid;grid-template-columns:repeat(3,1fr);gap:32px;padding:30px 0 38px;border-top:1px solid var(--foreground);border-bottom:1px solid var(--border)}.step-number{font:12px "Courier New",monospace;color:var(--primary)}.steps h3{font-size:16px;margin:10px 0 8px;font-weight:600}.steps p{font-size:13px;margin:0;color:var(--muted-foreground)}.try{display:grid;grid-template-columns:1fr 1fr;gap:36px;padding-top:36px}.try h2{font:24px Georgia,serif;margin:0 0 10px}.try p{font-size:13px;color:var(--muted-foreground)}textarea,pre{width:100%;padding:16px;border:1px solid var(--border);border-radius:5px;background:var(--card);color:var(--foreground);font:12px/1.65 "Courier New",monospace;white-space:pre-wrap;overflow-wrap:anywhere;resize:vertical}textarea{min-height:148px}pre{margin:14px 0 0}details{margin-top:12px}summary{cursor:pointer;font-size:13px;text-underline-offset:4px}
.report-header{padding:44px 0 30px;border-bottom:1px solid var(--border)}.report-title{max-width:820px;margin-bottom:20px}.report-deck{max-width:650px;color:var(--muted-foreground)}.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--border);border:1px solid var(--border);margin:30px 0}.stat{padding:25px;background:var(--card)}.stat strong{display:block;font:40px/1.2 Georgia,serif;letter-spacing:-1.5px;margin:11px 0}.stat small{font-size:12px;color:var(--muted-foreground)}.section-heading{display:flex;align-items:baseline;justify-content:space-between;gap:20px;margin:34px 0 16px}.section-heading h2{font:28px Georgia,serif;margin:0}.section-heading span{font-size:12px;color:var(--muted-foreground)}.table-scroll{overflow-x:auto;border:1px solid var(--border);background:var(--card)}table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:16px;border-bottom:1px solid var(--border);white-space:nowrap}th{font:10px "Courier New",monospace;letter-spacing:.8px;text-transform:uppercase;color:var(--muted-foreground);background:var(--muted)}tbody tr:last-child td{border-bottom:0}td strong{display:block;font-weight:600}td small{color:var(--muted-foreground)}.number{font-variant-numeric:tabular-nums}.low{color:var(--primary);font-weight:600}.index-list{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;padding:0;list-style:none}.index-list li{padding:15px;background:var(--card);border:1px solid var(--border);font-size:12px}.index-list strong{display:block;font-size:13px}.index-list small{display:block;margin-top:5px;color:var(--muted-foreground)}.receipt{margin-top:36px;padding:24px;border-top:1px solid var(--foreground)}.receipt h2{font:23px Georgia,serif;margin:0 0 14px}.receipt dl{display:grid;grid-template-columns:max-content minmax(0,1fr);gap:7px 20px;margin:0;font-size:12px}.receipt dt{color:var(--muted-foreground)}.receipt dd{margin:0;overflow-wrap:anywhere;font-family:"Courier New",monospace}.note{padding:17px 20px;background:var(--brand-soft);font-size:13px;margin:26px 0}.note.stub{background:var(--drive-agent-soft);color:var(--drive-agent-foreground)}footer{display:flex;justify-content:space-between;gap:20px;border-top:1px solid var(--border);margin-top:40px;padding-top:18px;font-size:11px;color:var(--muted-foreground)}
@media(max-width:760px){.sheet{padding:24px}.hero{grid-template-columns:1fr;gap:28px;padding:36px 0}.hero h1,.report-title{letter-spacing:-2px}.offer{padding:24px}.offer:before{display:none}.steps,.stats,.index-list{grid-template-columns:1fr}.try{grid-template-columns:1fr;gap:24px}.steps{gap:22px}.stats{gap:1px}.stat{padding:20px}.stat strong{font-size:35px}.masthead{gap:12px}.workspace{font-size:12px}.section-heading{display:block}.receipt{padding:24px 0}.receipt dl{grid-template-columns:1fr;gap:5px}.receipt dd{margin-bottom:10px}footer{display:block}}
`;

const document = (title: string, content: string): string =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>${escaped(title)} · Pond Observatory</title><style>${CSS}</style></head><body><main class="sheet"><header class="masthead"><a class="brand" href="${X402_DEMO_PATH}">Pond Observatory<span>Froggy field reports</span></a><a class="workspace" href="/">Back to Froggy ↗</a></header>${content}<footer><span>Pond Observatory · a Froggy x402 demonstration</span><span>One resource. One approved purchase.</span></footer></main></body></html>`;

const htmlResponse = (
  html: string,
  status = 200,
  headers = new Headers()
): Response => {
  if (Buffer.byteLength(html) > MAX_HTML_BYTES) {
    throw new Error("The demo report exceeded its response limit.");
  }
  headers.set("content-type", "text/html; charset=utf-8");
  headers.set("cache-control", "no-store");
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "no-referrer");
  return new Response(html, { headers, status });
};

const paymentBadge = (stubbed: boolean): string =>
  stubbed
    ? '<span class="seal stub">STUB · simulated payment</span>'
    : '<span class="seal live">Live Hedera payment</span>';

const challengeFor = (services: DemoServices) => {
  const issued = services.oracle.challenge({
    description:
      "Pond Observatory USDC lending report: market rates, liquidity and index provenance.",
    units: PRICE_TINYBARS,
    url: new URL(
      X402_DEMO_REPORT_PATH,
      services.environment.appOrigin
    ).toString(),
  });
  return {
    ...issued,
    resource: {
      ...issued.resource,
      mimeType: "text/html",
      serviceName: "Pond Observatory",
    },
  };
};

const landing = (services: DemoServices, locked: boolean): Response => {
  const challenge = challengeFor(services);
  const [offer] = challenge.accepts;
  const { url } = challenge.resource;
  const paymentStubbed = services.oracle.mode === "stub";
  const price = `${Number(offer?.amount ?? PRICE_TINYBARS) / 100_000_000} HBAR`;
  const network = offer?.network ?? services.environment.modes.hedera;
  const prompt = `Open ${url} in the shared browser and buy the USDC lending report for at most $0.05. Ask me to approve the purchase, then explain the result.`;
  const example = JSON.stringify(
    {
      url,
      method: "GET",
      purpose: "Read the USDC lending report",
      idempotencyKey: "pond-report-1",
      maxUsdMicros: 50_000,
    },
    null,
    2
  );
  const headers = new Headers({ "x-froggy-stubbed": String(paymentStubbed) });
  if (locked) {
    headers.set("payment-required", encodeChallengeHeader(challenge));
  }
  return htmlResponse(
    document(
      locked ? "Payment required" : "USDC field report",
      `
<section class="hero"><div><p class="eyebrow">Field report 01 / USDC lending</p><h1>A lending report,<br><em>one request away.</em></h1><p class="lede">Compare USDC borrowing and supply rates across lending markets. Open the report in Froggy, approve the purchase, and watch this page become your report.</p><div class="badges">${paymentBadge(paymentStubbed)}<span class="seal">The Graph · market data</span></div>${locked ? '<p class="note">Payment required. Froggy can detect this page and bring you an approval request. Approving opens the report here.</p>' : ""}</div>
<aside class="offer" aria-label="Report price"><p class="eyebrow">Inside the report</p><h2>Where USDC<br>meets the market.</h2><p>Borrow and supply comparisons, market liquidity, and the exact indexes behind every observation.</p><p class="price">${escaped(price)} <small>/ report</small></p><p class="quiet">${escaped(network)} · one exact payment</p><hr class="rule"><a class="button" href="${X402_DEMO_REPORT_PATH}">${locked ? "Check the paid report" : "Open the paid report"} →</a><p class="quiet">${paymentStubbed ? "No real charge in this deployment. Payment and receipt are explicitly marked STUB." : "This deployment uses real Hedera settlement. Froggy shows the quote and spending permission before sending payment."}</p></aside></section>
<section class="steps" aria-label="How the purchase works"><article><span class="step-number">01 / DISCOVER</span><h3>Open a paid resource</h3><p>The report answers with an HTTP 402 and its exact price, recipient and network.</p></article><article><span class="step-number">02 / APPROVE</span><h3>Keep the decision yours</h3><p>Froggy asks for permission when this purchase has no matching grant. Pay once approves this exact request.</p></article><article><span class="step-number">03 / RECEIVE</span><h3>Read it where you opened it</h3><p>The report loads in the same Chrome tab. Your purchase and settlement stay in Froggy.</p></article></section>
<section class="try"><article><h2>Try it in Froggy</h2><p>Select and copy this prompt into the chat. Open the demo inside the shared browser to exercise detection.</p><textarea readonly aria-label="Froggy chat prompt">${escaped(prompt, 8192)}</textarea></article><article><h2>Try it from Claude Code</h2><p>With Froggy connected over MCP, call <code>froggy_x402_request</code> with these arguments.</p><details><summary>Show the MCP request</summary><pre>${escaped(example, 12_000)}</pre><p>Approve the ticket in Froggy. Retrieve it with <code>froggy_x402_status</code> and <code>{"purchaseId":"the returned id"}</code>. Keep the same idempotency key when retrying.</p></details></article></section>`
    ),
    locked ? 402 : 200,
    headers
  );
};

const dollars = (amount: number): string =>
  new Intl.NumberFormat("en-US", {
    notation: "compact",
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 1,
  }).format(amount);
const apr = (amount: number): string => `${amount.toFixed(2)}%`;

const marketRow = (market: LendingMarket, index: number): string =>
  `<tr><td><strong>${escaped(market.name, 120)}</strong><small>${escaped(market.chain, 40)} · ${escaped(market.protocol, 60)}</small></td><td class="number ${index === 0 ? "low" : ""}">${apr(market.borrowApr)}</td><td class="number">${apr(market.supplyApr)}</td><td class="number">${dollars(market.totalSupplyUsd)}</td><td class="number">${dollars(market.totalBorrowUsd)}</td><td class="number">${market.blockNumber}</td></tr>`;

const report = (
  services: DemoServices,
  sale: Sale,
  snapshot: GraphSnapshot
): string => {
  const markets = snapshot.markets
    .slice(0, 24)
    .toSorted((a, b) => a.borrowApr - b.borrowApr);
  const [borrow] = markets;
  const [supply] = [...markets].toSorted((a, b) => b.supplyApr - a.supplyApr);
  if (borrow === undefined || supply === undefined) {
    throw new Error("No usable USDC markets were returned.");
  }
  const dataStubbed =
    snapshot.stubbed || services.environment.modes.graph === "stub";
  const paymentStubbed = sale.stubbed || services.oracle.mode === "stub";
  const fresh = snapshot.deployments.filter(
    (entry) => entry.status === "fresh"
  ).length;
  const captured = new Date(snapshot.capturedAt).toISOString();
  const indexes = snapshot.deployments
    .slice(0, 12)
    .map(
      (entry) =>
        `<li><strong>${escaped(entry.label, 100)}</strong>${escaped(entry.chain, 40)} · ${escaped(entry.status, 30)}<small>${entry.blockNumber === null ? "No indexed block" : `Block ${entry.blockNumber}`} · ${entry.marketCount} markets</small>${entry.note === null ? "" : `<small>${escaped(entry.note, 240)}</small>`}</li>`
    )
    .join("");
  return document(
    "Your USDC lending report",
    `
<header class="report-header"><p class="eyebrow">Field report 01 / purchase complete</p><h1 class="report-title">USDC, across<br>the lending landscape.</h1><p class="report-deck">A point-in-time comparison of borrowing rates, supply rates and liquidity, with the index behind each observation.</p><div class="badges">${paymentBadge(paymentStubbed)}${dataStubbed ? '<span class="seal stub">STUB · recorded Graph fixture</span>' : '<span class="seal live">Live Graph observations</span>'}<span class="seal">${escaped(captured)}</span></div></header>
${dataStubbed || paymentStubbed ? `<p class="note stub"><strong>STUB demonstration.</strong> ${paymentStubbed ? "No real payment was made. " : "The payment was real. "}${dataStubbed ? "These market observations are a recorded fixture, not current rates." : "Market observations come from the live Graph integration."}</p>` : '<p class="note">Payment settled. This report is stored against the sale, so presenting the same proof retrieves the same report without another settlement.</p>'}
<section class="stats" aria-label="Market observations"><article class="stat"><p class="eyebrow">Lowest observed borrow</p><strong>${apr(borrow.borrowApr)}</strong><small>${escaped(borrow.name, 120)} · ${escaped(borrow.chain, 40)}</small></article><article class="stat"><p class="eyebrow">Highest observed supply</p><strong>${apr(supply.supplyApr)}</strong><small>${escaped(supply.name, 120)} · ${escaped(supply.chain, 40)}</small></article><article class="stat"><p class="eyebrow">Markets compared</p><strong>${markets.length.toString().padStart(2, "0")}</strong><small>${dataStubbed ? "Recorded fixture · block 0" : `${fresh} of ${snapshot.deployments.length} indexes fresh`}</small></article></section>
<section><div class="section-heading"><h2>The market sheet</h2><span>USDC · lowest borrowing APR first</span></div><div class="table-scroll" role="region" aria-label="USDC lending market comparison" tabindex="0"><table><thead><tr><th scope="col">Market / network</th><th scope="col">Borrow APR</th><th scope="col">Supply APR</th><th scope="col">Supplied</th><th scope="col">Borrowed</th><th scope="col">Indexed block</th></tr></thead><tbody>${markets.map(marketRow).join("")}</tbody></table></div><p class="quiet">Rates are observations at the indexed blocks shown. They do not include an assessment of protocol risk, collateral requirements or transaction costs.</p></section>
<section><div class="section-heading"><h2>Where the observations came from</h2><span>${escaped(snapshot.source, 300)}</span></div><ul class="index-list">${indexes}</ul></section>
<section class="receipt" aria-label="Purchase receipt"><h2>A receipt, kept with the report.</h2><dl><dt>Sale</dt><dd>${sale.id}</dd><dt>Payment</dt><dd>${Number(sale.amount) / 100_000_000} HBAR · ${escaped(sale.network, 80)}</dd><dt>Transaction</dt><dd>${escaped(sale.transactionId ?? "No transaction reference returned", 256)}</dd><dt>Snapshot hash</dt><dd>${snapshotHash(snapshot)}</dd><dt>Captured</dt><dd>${escaped(captured)}</dd></dl><p class="quiet"><a href="/oracle/sales/${sale.id}">Open the durable sale record ↗</a></p></section>`
  );
};

const saleHeaders = (sale: Sale): Headers => {
  const headers = new Headers({
    "x-froggy-sale": sale.id,
    "x-froggy-stubbed": String(sale.stubbed),
  });
  if (
    sale.transactionId !== null &&
    (sale.status === "settled" ||
      sale.status === "delivered" ||
      sale.status === "failed")
  ) {
    const [namespace, reference, ...rest] = sale.network.split(":");
    if (
      namespace !== undefined &&
      namespace !== "" &&
      reference !== undefined &&
      reference !== "" &&
      rest.length === 0
    ) {
      const value = encodeSettlementHeader({
        network: `${namespace}:${reference}`,
        transactionId: sale.transactionId,
      });
      headers.set("payment-response", value);
      headers.set("x-payment-response", value);
    }
  }
  return headers;
};

const statusPage = (
  title: string,
  message: string,
  status: number,
  sale?: Sale
): Response =>
  htmlResponse(
    document(
      title,
      `<section class="report-header"><p class="eyebrow">Pond Observatory / purchase status</p><h1 class="report-title">${escaped(title)}</h1><p class="report-deck">${escaped(message, 1000)}</p>${sale === undefined ? "" : `<p class="quiet">Sale <code>${sale.id}</code> · ${escaped(sale.status)}. <a href="/oracle/sales/${sale.id}">Read the stored sale</a>.</p>`}<p><a href="${X402_DEMO_PATH}">Return to the report description</a></p></section>`
    ),
    status,
    sale === undefined ? undefined : saleHeaders(sale)
  );

const fromSale = (sale: Sale): Response => {
  if (sale.status === "delivered") {
    const decoded = decodeReport(sale.result);
    return decoded._tag === "Success"
      ? htmlResponse(decoded.success.html, 200, saleHeaders(sale))
      : statusPage(
          "Report unavailable",
          "The stored report cannot be read. Do not pay again; the sale preserves your settlement.",
          502,
          sale
        );
  }
  switch (sale.status) {
    case "pending":
    case "uncertain": {
      return statusPage(
        "Payment needs confirmation",
        "The payment is pending or its outcome is uncertain. This proof will not be submitted again. Keep the sale reference while the payment is reconciled.",
        409,
        sale
      );
    }
    case "rejected": {
      return statusPage(
        "Payment was rejected",
        sale.error ?? "The facilitator did not accept this payment.",
        402,
        sale
      );
    }
    case "failed": {
      return statusPage(
        "Paid, report unavailable",
        "Payment settled, but the report could not be assembled. The sale preserves the payment; do not buy another report to retry this request.",
        502,
        sale
      );
    }
    case "settled": {
      return statusPage(
        "Your report is being prepared",
        "Payment settled and the report is being assembled. Keep the sale reference; do not pay again.",
        409,
        sale
      );
    }
    default: {
      return statusPage(
        "Report unavailable",
        "The recorded payment state cannot be read. Keep the sale reference and do not pay again.",
        503,
        sale
      );
    }
  }
};

const settleWithDeadline = async (
  gate: OracleGate,
  payment: string,
  requirements: Parameters<OracleGate["settle"]>[1]
): Promise<SettleOutcome> => {
  const deadline = Promise.withResolvers<SettleOutcome>();
  const timer = setTimeout(() => {
    deadline.reject(new Error("Settlement deadline elapsed."));
  }, SETTLEMENT_TIMEOUT_MS);
  try {
    return await Promise.race([
      gate.settle(payment, requirements),
      deadline.promise,
    ]);
  } finally {
    clearTimeout(timer);
  }
};

const deliver = async (
  services: DemoServices,
  sale: Sale
): Promise<Response> => {
  try {
    const snapshot = await services.graph.lendingMarkets("USDC");
    const html = report(services, sale, snapshot);
    if (Buffer.byteLength(html) > MAX_HTML_BYTES) {
      throw new Error("The demo report exceeded its response limit.");
    }
    const stubbed =
      sale.stubbed ||
      snapshot.stubbed ||
      services.environment.modes.graph === "stub";
    const delivered: Sale = {
      ...sale,
      deliveredAt: Date.now(),
      result: { v: 1, html, stubbed },
      status: "delivered",
      stubbed,
    };
    await services.store.sales.update(sale.id, {
      deliveredAt: delivered.deliveredAt,
      result: delivered.result,
      status: delivered.status,
      stubbed,
    });
    return fromSale(delivered);
  } catch {
    const failed: Sale = {
      ...sale,
      error: "The USDC lending report could not be assembled after payment.",
      status: "failed",
    };
    await services.store.sales.update(sale.id, {
      error: failed.error,
      status: failed.status,
    });
    return fromSale(failed);
  }
};

const purchaseReport = async (
  services: DemoServices,
  payment: string
): Promise<Response> => {
  if (
    payment.length > MAX_PAYMENT_HEADER ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(
      payment
    ) ||
    decodePaymentEnvelope(Buffer.from(payment, "base64").toString("utf-8"))
      ._tag === "Failure"
  ) {
    return statusPage(
      "Payment header not accepted",
      "Send a bounded x402 v2 payment envelope.",
      400
    );
  }
  const challenge = challengeFor(services);
  const [requirements] = challenge.accepts;
  if (requirements === undefined) {
    return statusPage(
      "Payment unavailable",
      "This deployment has no payment offer for the report.",
      503
    );
  }
  const described = describePayment(payment);
  const sale: Sale = {
    amount: requirements.amount,
    asset: requirements.asset,
    at: Date.now(),
    deliveredAt: null,
    error: null,
    id: SaleId.generate(),
    network: requirements.network,
    payer: described.payer,
    paymentHash: new Bun.CryptoHasher("sha256").update(payment).digest("hex"),
    resource: challenge.resource.url,
    result: null,
    status: "pending",
    stubbed: services.oracle.mode === "stub",
    transactionId: described.transactionId,
  };
  // The unique proof claim precedes the facilitator, including across server
  // processes. A lost response leaves a durable state that cannot charge again.
  const recorded = await services.store.sales.record(sale);
  if (!recorded.created) {
    return recorded.sale.resource === sale.resource
      ? fromSale(recorded.sale)
      : statusPage(
          "Payment belongs to another resource",
          "This proof is already recorded for a different purchase and will not be settled again.",
          409
        );
  }
  let settled: SettleOutcome;
  try {
    settled = await settleWithDeadline(services.oracle, payment, requirements);
  } catch {
    const uncertain: Sale = {
      ...sale,
      error:
        "The facilitator did not return a conclusive settlement result. This proof must not be resubmitted.",
      status: "uncertain",
    };
    await services.store.sales.update(sale.id, {
      error: uncertain.error,
      status: uncertain.status,
    });
    return fromSale(uncertain);
  }
  if (!settled.ok) {
    const rejected: Sale = {
      ...sale,
      error: (settled.error ?? "Payment rejected by the facilitator.").slice(
        0,
        500
      ),
      status: "rejected",
      stubbed: settled.stubbed,
      transactionId: null,
    };
    await services.store.sales.update(sale.id, {
      error: rejected.error,
      status: rejected.status,
      stubbed: rejected.stubbed,
      transactionId: null,
    });
    return fromSale(rejected);
  }
  const accepted: Sale = {
    ...sale,
    status: "settled",
    stubbed: settled.stubbed || services.oracle.mode === "stub",
    transactionId: settled.transactionId ?? described.transactionId,
  };
  await services.store.sales.update(sale.id, {
    status: accepted.status,
    stubbed: accepted.stubbed,
    transactionId: accepted.transactionId,
  });
  return await deliver(services, accepted);
};

/** Public seller routes. All payment authority still lives in the buyer's coordinator. */
export const handleX402Demo = async (
  services: DemoServices,
  request: Request
): Promise<Response | null> => {
  const url = new URL(request.url);
  if (
    url.pathname !== X402_DEMO_PATH &&
    url.pathname !== X402_DEMO_REPORT_PATH
  ) {
    return null;
  }
  if (request.method !== "GET") {
    return new Response("This report supports GET requests only.", {
      status: 405,
      headers: { allow: "GET" },
    });
  }
  if (url.search !== "") {
    return statusPage(
      "Unknown report variant",
      "This report has one fixed USDC resource. Remove query parameters before requesting it.",
      400
    );
  }
  if (url.pathname === X402_DEMO_PATH) {
    return landing(services, false);
  }
  const payment = paymentFrom(request.headers);
  return payment === null
    ? landing(services, true)
    : await purchaseReport(services, payment);
};
