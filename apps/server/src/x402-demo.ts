/** The former seller landing page now explains account credits; historical reports still replay. */
import type { Sale } from "@froggy/domain";
import { encodeSettlementHeader, paymentFrom } from "@froggy/payments";
import { Schema } from "effect";

import type { Services } from "./services";

export const X402_DEMO_PATH = "/demo/x402";
export const X402_DEMO_REPORT_PATH = `${X402_DEMO_PATH}/report`;
const MAX_HTML_BYTES = 65_536;
type DemoServices = Pick<Services, "store">;
const StoredReport = Schema.Struct({
  v: Schema.Literal(1),
  html: Schema.String.check(Schema.isMaxLength(MAX_HTML_BYTES)),
  stubbed: Schema.Boolean,
});
const decodeReport = Schema.decodeUnknownResult(StoredReport);

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
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>${escaped(title)} · Pond Observatory</title><style>${CSS}</style></head><body><main class="sheet"><header class="masthead"><a class="brand" href="${X402_DEMO_PATH}">Pond Observatory<span>Froggy field reports</span></a><a class="workspace" href="/">Back to Froggy ↗</a></header>${content}<footer><span>Froggy · platform credits</span><span>Fund once. Use credits across tools.</span></footer></main></body></html>`;

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

const landing = (retired: boolean): Response =>
  htmlResponse(
    document(
      "Credits for every Froggy tool",
      `
<section class="hero"><div><p class="eyebrow">Froggy / platform credits</p><h1>Fund once.<br><em>Let the work flow.</em></h1><p class="lede">Buy credits with USDC on Base or native HBAR through x402, then use the same balance for research, browsing, generation and monitoring.</p><div class="badges"><span class="seal">100 credits = $1</span><span class="seal">Your account · your limits</span></div>${retired ? '<p class="note">Individual report payments have retired. Sign in to use Froggy tools with credits. Existing sale records remain available.</p>' : ""}</div>
<aside class="offer"><p class="eyebrow">One balance for your tools</p><h2>Start with<br>your next task.</h2><p>Every account starts at zero. Review a funding quote, choose USDC or HBAR, and confirm the purchase yourself.</p><hr class="rule"><a class="button" href="/wallet">Sign in and buy credits →</a><p class="quiet">Credits are internal and nontransferable. Your cryptocurrency balances remain separate.</p></aside></section>
<section class="steps" aria-label="How credits work"><article><span class="step-number">01 / FUND</span><h3>Choose your currency</h3><p>x402 confirms your USDC or HBAR payment before credits reach your account. Your agent cannot buy credits or change spending limits.</p></article><article><span class="step-number">02 / USE</span><h3>Approve the work</h3><p>Review the catalog price. Froggy reserves that many credits when your tool task starts, within your per-task and daily limits.</p></article><article><span class="step-number">03 / FOLLOW</span><h3>Keep the result and receipt</h3><p>Successful tasks use their reservation. Failed or cancelled tasks release it. An uncertain outcome stays reserved while Froggy reconciles it.</p></article></section>
<section class="try"><article><h2>Use your own agent</h2><p>Connect over MCP and sign in with your Froggy account. The agent can use your existing credits within the scopes you allow.</p><a href="/skill.md">Read the connection instructions ↗</a></article><article><h2>See what is available</h2><p>Research, browser tasks and other Froggy services share the same balance. Availability and prices are shown before you start.</p><a href="/services">Explore tools ↗</a></article></section>`
    ),
    retired ? 410 : 200
  );

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
    return new Response("This page supports GET requests only.", {
      status: 405,
      headers: { allow: "GET" },
    });
  }
  if (url.pathname === X402_DEMO_PATH) {
    return landing(false);
  }
  const payment = paymentFrom(request.headers);
  if (payment !== null && payment.length <= 32_768) {
    const hash = new Bun.CryptoHasher("sha256").update(payment).digest("hex");
    const sale = await services.store.sales.byPaymentHash(hash);
    if (
      sale !== null &&
      new URL(sale.resource).pathname === X402_DEMO_REPORT_PATH
    ) {
      return fromSale(sale);
    }
  }
  return landing(true);
};
