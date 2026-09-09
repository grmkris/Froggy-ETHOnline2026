import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { detectChrome } from "../../packages/browser/src/chrome-detect";
import { CloudBrowser } from "../../packages/browser/src/cloud";
import type { CloudBrowserRecord } from "../../packages/browser/src/cloud";

// Local Chromium and fixture HTTP only. No provider key, wallet or settlement.
const profileDirectory = await mkdtemp(join(tmpdir(), "froggy-cloud-cdp-"));
const executable = detectChrome()?.path;
if (!executable) throw new Error("No Chromium");
const paidRequests: { path: string; proof: string | null }[] = [];
const page = Bun.serve({
  port: 0,
  fetch: (request) => {
    const path = new URL(request.url).pathname;
    const proof = request.headers.get("payment-signature");
    paidRequests.push({ path, proof });
    if (path === "/paid" || path === "/paid-redirect") {
      if (!proof)
        return new Response("payment fixture", {
          status: 402,
          headers: {
            "payment-required": "fixture-challenge",
            "content-type": "text/html",
          },
        });
      if (path === "/paid-redirect")
        return new Response(null, {
          status: 302,
          headers: { location: "/landing" },
        });
      return new Response(
        '<title>Unlocked</title><img src="/pixel">paid fixture',
        {
          headers: {
            "content-type": "text/html",
            "payment-response": "fixture-settlement",
          },
        }
      );
    }
    return new Response(
      path === "/popup"
        ? "<title>Popup</title><button onclick=\"window.opener.document.title='Returned';window.close()\">Return</button>"
        : '<title>Cloud CDP check</title><input aria-label="Name"><button onclick="window.open(\'/popup\')">Open popup</button>',
      { headers: { "content-type": "text/html" } }
    );
  },
});
const process = Bun.spawn(
  [
    executable,
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--remote-debugging-port=0",
    `--user-data-dir=${profileDirectory}`,
    "about:blank",
  ],
  { stdout: "ignore", stderr: "ignore" }
);
let browser: CloudBrowser | undefined;
try {
  let metadata: { webSocketDebuggerUrl: string } | null = null;
  for (let i = 0; i < 40; i++) {
    try {
      const [port] = (
        await readFile(join(profileDirectory, "DevToolsActivePort"), "utf8")
      ).split("\n");
      metadata = await (
        await fetch(`http://127.0.0.1:${port}/json/version`)
      ).json();
      break;
    } catch {
      await Bun.sleep(100);
    }
  }
  if (!metadata) throw new Error("CDP unavailable");
  const info = {
    id: "00000000-0000-4000-8000-000000000001",
    status: "active" as const,
    cdpUrl: metadata.webSocketDebuggerUrl,
    liveUrl: null,
    timeoutAt: new Date(Date.now() + 60000).toISOString(),
  };
  let record: CloudBrowserRecord | null = null;
  browser = new CloudBrowser({
    profileDirectory,
    blockPrivateNetwork: false,
    userKey: "local-check",
    load: async () => record,
    save: async (r) => {
      record = r;
    },
    api: {
      profile: async () => "00000000-0000-4000-8000-000000000002",
      create: async () => info,
      get: async () => info,
      stop: async () => {},
      deleteProfile: async () => {},
    },
  });
  await browser.agentNavigate(`http://127.0.0.1:${page.port}`);
  const first = await browser.agentSnapshot();
  console.log(
    JSON.stringify({ state: browser.state(), snapshot: first.snapshot.text })
  );
  await browser.agentClick("@e2");
  await Bun.sleep(300);
  console.log("popup", (await browser.agentSnapshot()).snapshot.text);
  await browser.agentClick("@e1");
  await Bun.sleep(300);
  console.log(
    "opener after return",
    (await browser.agentSnapshot()).snapshot.text
  );
  await browser.takePage();
  console.log("takeover", browser.state().cloud?.control);
  let rejected = false;
  try {
    await browser.agentType("should be refused");
  } catch {
    rejected = true;
  }
  console.log("agent refused while human", rejected);
  await browser.handleClientMessage({ v: 1, type: "browser.resume" });
  await browser.agentNavigate(`http://127.0.0.1:${page.port}/popup`);
  console.log("resume", browser.state().status);
  await browser.agentNavigate(`http://127.0.0.1:${page.port}/paid`);
  await Bun.sleep(300);
  const pending = await browser.pendingPayment();
  if (!pending) throw new Error("First GET 402 was not observed");
  const paid = await browser.replayPayment({
    id: pending.id,
    paymentHeader: "fixture-proof",
  });
  console.log(
    "payment",
    JSON.stringify({
      sent: paid.sent,
      status: paid.status,
      settlement: paid.paymentResponse,
    })
  );
  await Bun.sleep(300);
  if (paidRequests.some((r) => r.proof && r.path !== "/paid"))
    throw new Error("Proof leaked beyond approved request");
  await browser.agentNavigate(`http://127.0.0.1:${page.port}/paid-redirect`);
  await Bun.sleep(300);
  const redirect = await browser.pendingPayment();
  if (!redirect) throw new Error("Redirect fixture not observed");
  const redirected = await browser.replayPayment({
    id: redirect.id,
    paymentHeader: "redirect-fixture-proof",
  });
  await Bun.sleep(300);
  if (paidRequests.some((r) => r.path === "/landing" && r.proof))
    throw new Error("Proof leaked into redirect");
  console.log(
    "redirect isolated",
    JSON.stringify({
      sent: redirected.sent,
      status: redirected.status,
      error: redirected.error,
    })
  );
} finally {
  await browser?.close();
  process.kill();
  await process.exited;
  page.stop(true);
  await rm(profileDirectory, { recursive: true, force: true });
}
