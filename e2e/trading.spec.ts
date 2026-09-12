import { expect, test } from "@playwright/test";
import { Schema } from "effect";

test("token search uses structured inputs and keeps its result after reload", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
  await page.goto("/services?service=market_search");
  await page.getByLabel("Token name or symbol").fill("frog");
  await page.getByLabel("Maximum results").fill("3");
  const response = page.waitForResponse(
    (value) =>
      value.url().endsWith("/api/services/run") &&
      value.request().method() === "POST"
  );
  await page.getByRole("button", { name: "Try simulated · $0.01" }).click();
  const created = await response;
  const ticket = Schema.decodeUnknownSync(
    Schema.Struct({ id: Schema.String, service: Schema.String })
  )(await created.json());
  expect(ticket.service).toBe("market_search");
  await expect(page.getByLabel("Service tasks")).toContainText("Done");
  await expect(page.getByLabel("Service tasks")).toContainText("DEMO");
  await page.goto(`/services?task=${ticket.id}`);
  const result = page.getByLabel("Selected service task");
  await expect(result).toContainText("frog");
  await result.getByText("Structured provider data").click();
  await expect(result.locator("pre")).toContainText('"provider": "birdeye"');
  await expect(result.locator("pre")).toContainText('"stubbed": true');
  await page.reload();
  await expect(page.getByLabel("Selected service task")).toContainText("Done");
  expect(errors).toEqual([]);
});

test("token research renders launcher and per-source status", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
  await page.goto("/services?service=token_research");
  await page
    .getByLabel("Token address", { exact: true })
    .fill(`0x${"a".repeat(40)}`);
  await page.getByLabel("Cohort window (blocks)").fill("600");
  await page.getByLabel("Holder page budget").fill("5");
  const response = page.waitForResponse(
    (value) =>
      value.url().endsWith("/api/services/run") &&
      value.request().method() === "POST"
  );
  await page.getByRole("button", { name: "Try simulated · $0.01" }).click();
  const created = await response;
  const ticket = Schema.decodeUnknownSync(
    Schema.Struct({ id: Schema.String, service: Schema.String })
  )(await created.json());
  expect(ticket.service).toBe("token_research");
  await expect(page.getByLabel("Service tasks")).toContainText("Done");
  await page.goto(`/services?task=${ticket.id}`);
  const result = page.getByLabel("Selected service task");
  const research = result.getByLabel("Token research result");
  await expect(research).toBeVisible();
  await expect(research).toContainText("Launcher");
  await expect(research).toContainText("Stubbed research");
  await expect(research).toContainText("Unavailable");
  await expect(research).toContainText("GoPlus screen");
  await page.reload();
  await expect(
    page.getByLabel("Selected service task").getByLabel("Token research result")
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("an unsigned swap quote is inspectable on a narrow screen", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/services?service=quote_action");
  // Synthetic fixture identities, never production token configuration.
  await page
    .getByLabel("Wallet address", { exact: true })
    .fill(`0x${"1".repeat(40)}`);
  await page.getByLabel("Input token address").fill(`0x${"2".repeat(40)}`);
  await page.getByLabel("Output token address").fill(`0x${"3".repeat(40)}`);
  await page.getByLabel("Amount in smallest token units").fill("1000000");
  await expect(
    page.getByRole("form", { name: "Request Quote a swap" })
  ).toContainText("no approval or trade is signed");
  const response = page.waitForResponse(
    (value) =>
      value.url().endsWith("/api/services/run") &&
      value.request().method() === "POST"
  );
  await page.getByRole("button", { name: "Try simulated · $0.01" }).click();
  const created = await response;
  const ticket = Schema.decodeUnknownSync(
    Schema.Struct({ id: Schema.String, service: Schema.String })
  )(await created.json());
  await expect(page.getByLabel("Service tasks")).toContainText(
    "No trade was submitted"
  );
  await page.goto(`/services?task=${ticket.id}`);
  const result = page.getByLabel("Selected service task");
  await expect(result).toContainText("Unsigned quote");
  await result.getByText("Structured provider data").click();
  await expect(result.locator("pre")).toContainText('"provider": "uniswap"');
  await expect(result.locator("pre")).toContainText(
    '"independentlySimulated": false'
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("trading-quote-mobile.png"),
  });
  expect(errors).toEqual([]);
});

test("a simulated trade is reviewed, approved once and recoverable after reload", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/services");
  const desk = page.getByRole("region", { name: "Trading desk", exact: true });
  await desk.getByLabel("Token to spend").fill(`0x${"2".repeat(40)}`);
  await desk.getByLabel("Token to receive").fill(`0x${"3".repeat(40)}`);
  await desk.getByLabel("Input amount · smallest units").fill("1000000");
  await desk.getByLabel("Maximum native fee · wei").fill("1000000000000000");
  await desk
    .getByRole("button", { name: "Prepare trade", exact: true })
    .click();
  const history = desk.getByLabel("Trade history");
  await expect(history).toContainText("Simulated · no funds move");
  await expect(history).toContainText("Simulation passed");
  await history.getByText("Review exact transaction").click();
  await expect(history.locator("pre")).toContainText('"kind": "evm"');
  await history
    .getByRole("button", { name: "Approve this step", exact: true })
    .click();
  await expect(history).toContainText("completed");
  await history.getByText("Audit receipts · 5").click();
  await expect(history).toContainText("trade.approval: exact human approval.");
  await page.reload();
  await expect(page.getByLabel("Trade history")).toContainText("completed");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);
  await desk.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath("trade-execution-mobile.png"),
  });
  expect(errors).toEqual([]);
});

test("a simulated Jupiter native swap uses the Solana wallet and lamport budget", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/services");
  const desk = page.getByRole("region", { name: "Trading desk", exact: true });
  await desk
    .getByLabel("Network & route", { exact: true })
    .selectOption({ label: "Solana · Jupiter swap" });
  await desk.getByLabel("Token to spend").fill("native");
  await desk
    .getByLabel("Token to receive")
    .fill("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
  await desk.getByLabel("Input amount · smallest units").fill("1000000");
  await desk.getByLabel("Maximum native fee · lamports").fill("2500000");
  await expect(desk).toContainText("1 SOL = 1000000000 lamports.");
  await desk
    .getByRole("button", { name: "Prepare trade", exact: true })
    .click();
  const history = desk.getByLabel("Trade history");
  await expect(history).toContainText("Simulated · no funds move");
  await expect(
    page.getByRole("link", { name: "Review trades", exact: true })
  ).toBeVisible();
  await history.getByText("Review exact transaction").click();
  await expect(history.locator("pre")).toContainText('"kind": "solana"');
  await history
    .getByRole("button", { name: "Approve this step", exact: true })
    .click();
  await expect(history).toContainText("completed");
  await desk.getByRole("button", { name: "Stop trading", exact: true }).click();
  await expect(
    desk.getByRole("button", { name: "Prepare trade", exact: true })
  ).toBeDisabled();
  await page.reload();
  await expect(page.getByLabel("Trade history")).toContainText("completed");
  await expect(
    page.getByRole("button", { name: "Resume trading", exact: true })
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);
  await page.getByLabel("Trade history").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath("jupiter-trade-mobile.png"),
  });
  expect(errors).toEqual([]);
});

for (const action of ["deposit", "withdraw"] as const) {
  test(`a simulated Enso ${action} binds the vault and survives reload`, async ({
    page,
  }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => {
      errors.push(error.message);
    });
    await page.setViewportSize({ width: 320, height: 844 });
    await page.goto("/services");
    const desk = page.getByRole("region", {
      name: "Trading desk",
      exact: true,
    });
    await desk
      .getByLabel("Network & route", { exact: true })
      .selectOption(`enso:eip155:1:${action}`);
    await desk
      .getByLabel(
        action === "withdraw" ? "Vault shares to redeem" : "Token to spend"
      )
      .fill(`0x${"2".repeat(40)}`);
    await desk
      .getByLabel(
        action === "deposit" ? "Vault shares to receive" : "Token to receive"
      )
      .fill(`0x${"3".repeat(40)}`);
    await desk.getByLabel("Input amount · smallest units").fill("1000000");
    await desk.getByLabel("Maximum native fee · wei").fill("1000000000000000");
    await desk
      .getByRole("button", { name: "Prepare trade", exact: true })
      .click();
    const history = desk.getByLabel("Trade history");
    await expect(history).toContainText(`Enso · ${action}`);
    await expect(history).toContainText("Simulated · no funds move");
    await history
      .getByRole("button", { name: "Approve this step", exact: true })
      .click();
    await expect(history).toContainText("completed");
    await page.reload();
    await expect(page.getByLabel("Trade history")).toContainText(
      `Enso · ${action}`
    );
    await expect(page.getByLabel("Trade history")).toContainText("completed");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    ).toBe(true);
    await page.getByLabel("Trade history").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath(`enso-${action}-mobile.png`),
    });
    expect(errors).toEqual([]);
  });
}

test("vault positions fund a separately approved swap only after withdrawal confirmation", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/services");
  const desk = page.getByRole("region", { name: "Trading desk", exact: true });
  await desk
    .getByRole("button", { name: "Refresh positions", exact: true })
    .click();
  await expect(desk).toContainText("Simulated · no wallet funds");
  await desk
    .getByRole("button", { name: "Prepare withdrawal", exact: true })
    .click();
  await expect(desk.getByLabel("Vault shares to redeem")).toHaveValue(
    `0x${"3".repeat(40)}`
  );
  await expect(desk.getByLabel("Input amount · smallest units")).toHaveValue(
    "1000000"
  );
  await desk.getByLabel("Maximum native fee · wei").fill("1000000000000000");
  await desk
    .getByRole("button", { name: "Prepare trade", exact: true })
    .click();
  const history = desk.getByLabel("Trade history");
  await expect(
    history.getByRole("button", { name: "Use proceeds in a swap", exact: true })
  ).toHaveCount(0);
  await history
    .getByRole("button", { name: "Approve this step", exact: true })
    .click();
  await expect(history).toContainText("completed");
  await history
    .getByRole("button", { name: "Use proceeds in a swap", exact: true })
    .click();
  await expect(desk).toContainText("Use confirmed withdrawal proceeds");
  await expect(desk.getByLabel("Token to spend")).toBeDisabled();
  await expect(desk.getByLabel("Token to spend")).toHaveValue(
    `0x${"2".repeat(40)}`
  );
  await desk.getByLabel("Token to receive").fill(`0x${"6".repeat(40)}`);
  await desk.getByLabel("Maximum native fee · wei").fill("1000000000000000");
  await desk
    .getByRole("button", { name: "Prepare trade", exact: true })
    .click();
  await expect(history).toContainText("Uniswap · swap");
  await expect(history).toContainText("Funded from confirmed withdrawal");
  await history
    .getByRole("button", { name: "Approve this step", exact: true })
    .click();
  await expect(history.getByText("completed", { exact: true })).toHaveCount(2);
  await page.reload();
  await expect(
    page.getByLabel("Trade history").getByText("completed", { exact: true })
  ).toHaveCount(2);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);
  await page.getByLabel("Trade history").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath("withdrawal-proceeds-mobile.png"),
  });
  expect(errors).toEqual([]);
});

for (const buy of [true, false]) {
  test(`a simulated Pump ${buy ? "buy" : "sell"} shows phase and actual input after reload`, async ({
    page,
  }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => {
      errors.push(error.message);
    });
    await page.setViewportSize({ width: 320, height: 844 });
    await page.goto("/services");
    const desk = page.getByRole("region", {
      name: "Trading desk",
      exact: true,
    });
    await desk
      .getByLabel("Network & route", { exact: true })
      .selectOption({ label: "Solana · Pump swap" });
    const mint = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
    await desk.getByLabel("Token to spend").fill(buy ? "native" : mint);
    await desk.getByLabel("Token to receive").fill(buy ? mint : "native");
    await desk.getByLabel("Input amount · smallest units").fill("1000000");
    await desk.getByLabel("Maximum native fee · lamports").fill("2500000");
    await desk
      .getByRole("button", { name: "Prepare trade", exact: true })
      .click();
    const history = desk.getByLabel("Trade history");
    await expect(history).toContainText("Simulated · no funds move");
    await expect(history).toContainText("Approved phase: bonding curve");
    await expect(history).toContainText("Maximum input");
    await history
      .getByRole("button", { name: "Approve this step", exact: true })
      .click();
    await expect(history).toContainText("Actual input used: 1000000");
    await expect(history).toContainText("completed");
    await page.reload();
    await expect(page.getByLabel("Trade history")).toContainText(
      "Actual input used: 1000000"
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    ).toBe(true);
    await page.getByLabel("Trade history").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath("pump-trade-mobile.png"),
    });
    expect(errors).toEqual([]);
  });
}

for (const buy of [true, false]) {
  test(`a simulated Pons ${buy ? "buy" : "sell"} shows phase and actual input after reload`, async ({
    page,
  }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => {
      errors.push(error.message);
    });
    await page.setViewportSize({ width: 320, height: 844 });
    await page.goto("/services");
    const desk = page.getByRole("region", {
      name: "Trading desk",
      exact: true,
    });
    await desk
      .getByLabel("Network & route", { exact: true })
      .selectOption({ label: "Robinhood · Pons" });
    const mint = "0x2222222222222222222222222222222222222222";
    const quote = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
    await desk.getByLabel("Token to spend").fill(buy ? quote : mint);
    await desk.getByLabel("Token to receive").fill(buy ? mint : quote);
    await desk.getByLabel("Input amount · smallest units").fill("1000000");
    await desk.getByLabel("Maximum native fee · wei").fill("2500000");
    await desk
      .getByRole("button", { name: "Prepare trade", exact: true })
      .click();
    const history = desk.getByLabel("Trade history");
    await expect(history).toContainText("Simulated · no funds move");
    await expect(history).toContainText("Approved phase: bonding curve");
    await expect(history).toContainText("Maximum input");
    await expect(history).toContainText("Minimum at full input");
    await expect(history).toContainText("Unused input is refunded.");
    await history
      .getByRole("button", { name: "Approve this step", exact: true })
      .click();
    await expect(history).toContainText("Actual input used: 1000000");
    await expect(history).toContainText("completed");
    await page.reload();
    await expect(page.getByLabel("Trade history")).toContainText(
      "Actual input used: 1000000"
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    ).toBe(true);
    await page.getByLabel("Trade history").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath("pons-trade-mobile.png"),
    });
    expect(errors).toEqual([]);
  });
}

test("a listing watch shows fixed capacity and stays stopped after a mobile reload", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/services?service=watch_launches");
  await page.getByLabel("Duration (minutes)").fill("5");
  await page.getByLabel("Minimum reported liquidity").fill("100");
  await page.getByLabel("Listing source (optional)").fill("pump");
  await page.getByRole("button", { name: "Try simulated · $0.01" }).click();
  const watches = page.getByRole("region", {
    name: "Listing watches",
    exact: true,
  });
  await expect(watches).toContainText("5-minute listing watch");
  await expect(watches).toContainText("Simulated");
  await expect(watches).toContainText("/ 10 polls used");
  await expect(watches).toContainText("Coverage gaps:");
  await expect(watches).toContainText("Coverage is incomplete");
  await watches.getByRole("button", { name: "Stop watch" }).click();
  await expect(watches).toContainText("cancelled");
  await page.reload();
  await expect(watches).toContainText("cancelled");
  await expect(watches.getByRole("button", { name: "Stop watch" })).toHaveCount(
    0
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);
  await watches.screenshot({
    path: testInfo.outputPath("launch-watch-mobile.png"),
  });
  expect(errors).toEqual([]);
});

test("a human authorizes and revokes a bounded Pons watch rule on mobile", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/services?service=watch_launches");
  await page
    .getByRole("form", { name: "Request Watch token listings" })
    .getByLabel("Network", { exact: true })
    .selectOption("eip155:4663");
  await page.getByLabel("Duration (minutes)").fill("5");
  await page.getByRole("button", { name: "Try simulated · $0.01" }).click();
  await expect(
    page.getByRole("region", { name: "Listing watches", exact: true })
  ).toContainText("5-minute listing watch");
  await page.goto("/services");
  const rules = page.getByRole("region", {
    name: "Trading rules",
    exact: true,
  });
  await rules
    .getByLabel("Rule network & route")
    .selectOption("eip155:4663:pons:swap");
  const form = rules.getByRole("form", { name: "Create trading rule" });
  await form.getByLabel("Rule name").fill("Mobile Pons watch rule");
  await expect(
    form.getByLabel("Automatic launch watch").locator("option")
  ).toHaveCount(2);
  await form.getByLabel("Automatic launch watch").selectOption({ index: 1 });
  await expect(form.getByText("Research requirements")).toBeVisible();
  await form.getByLabel("Require research checks before signing").check();
  await expect(
    form.getByLabel("Require reviewed Pons token template")
  ).toBeChecked();
  await form
    .getByLabel("Maximum entry input · base units", { exact: true })
    .fill("100");
  await form
    .getByLabel("Total entry input · base units", { exact: true })
    .fill("200");
  await form
    .getByLabel("Maximum native fee per trade · base units", { exact: true })
    .fill("10");
  await form
    .getByLabel("Total native fees · base units", { exact: true })
    .fill("40");
  await form.getByLabel("Maximum entries", { exact: true }).fill("2");
  await form
    .getByRole("button", { name: "Authorize this trading rule" })
    .click();
  await expect(
    rules.getByRole("heading", { name: "Mobile Pons watch rule" })
  ).toBeVisible();
  await expect(rules).toContainText("Authorized until expiry");
  await expect(rules).toContainText("Research:");
  await expect(rules).toContainText("template");
  await page.reload();
  await expect(
    rules.getByRole("heading", { name: "Mobile Pons watch rule" })
  ).toBeVisible();
  await rules.getByRole("button", { name: "Revoke rule" }).click();
  await expect(rules).toContainText("Revoked");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);
  await rules.screenshot({
    path: testInfo.outputPath("trading-rule-mobile.png"),
  });
  expect(errors).toEqual([]);
});

test("a Uniswap rule can require a holder-concentration cap without launcher predicates", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
  await page.goto("/services");
  const rules = page.getByRole("region", {
    name: "Trading rules",
    exact: true,
  });
  await rules
    .getByLabel("Rule network & route")
    .selectOption("eip155:8453:uniswap:swap");
  const form = rules.getByRole("form", { name: "Create trading rule" });
  await form.getByLabel("Rule name").fill("Base concentration rule");
  await form
    .getByLabel("Authorized input asset")
    .fill("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
  await form
    .getByLabel("Authorized output token")
    .fill("0x4200000000000000000000000000000000000006");
  await expect(form.getByText("Research requirements")).toBeVisible();
  await expect(form.getByText("Exits are never gated.")).toBeVisible();
  await expect(
    form.getByLabel("Require reviewed Pons token template")
  ).toHaveCount(0);
  await expect(
    form.getByLabel(
      "Forbid deployer or fee-recipient buys in the launch window"
    )
  ).toHaveCount(0);
  await expect(form.getByLabel("Insider window · blocks")).toHaveCount(0);
  await form.getByLabel("Require research checks before signing").check();
  await form
    .getByLabel("Max top-holder share · basis points", { exact: true })
    .fill("4000");
  await form
    .getByLabel("Maximum entry input · base units", { exact: true })
    .fill("100");
  await form
    .getByLabel("Total entry input · base units", { exact: true })
    .fill("200");
  await form
    .getByLabel("Maximum native fee per trade · base units", { exact: true })
    .fill("10");
  await form
    .getByLabel("Total native fees · base units", { exact: true })
    .fill("40");
  await form.getByLabel("Maximum entries", { exact: true }).fill("2");
  await form
    .getByRole("button", { name: "Authorize this trading rule" })
    .click();
  await expect(
    rules.getByRole("heading", { name: "Base concentration rule" })
  ).toBeVisible();
  await expect(rules).toContainText("Research: top 10 ≤ 4000 bps");
  await expect(rules).not.toContainText("template");
  expect(errors).toEqual([]);
});

test("a bare address paste is looked up for free and nothing is bought", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
  await page.goto("/chat");
  await page
    .getByRole("textbox", { name: "Message" })
    .fill("0x8Cc232c9EB25b4b20ee448106858e3B6281708C2");
  await page.getByRole("button", { name: "Send", exact: true }).click();

  const log = page.getByRole("log");
  // One free read, named as a sentence, with the address classified per network.
  await expect(log.getByText("Looked up 0x8Cc2…08C2 for free")).toBeVisible({
    timeout: 20_000,
  });
  await expect(log.getByText("Wallet, not a token")).toBeVisible({
    timeout: 20_000,
  });
  await expect(log.getByText(/Base: wallet/u)).toBeVisible();
  await expect(log.getByText(/Robinhood: wallet/u)).toBeVisible();

  // The scripted model then asks, as the instructions tell a real one to.
  await expect(
    log.locator('[data-streamdown="strong"]', { hasText: "bought nothing" })
  ).toBeVisible({ timeout: 20_000 });
  await expect(
    page.getByRole("button", { exact: true, name: "Send" })
  ).toBeVisible({ timeout: 20_000 });

  // No paid tool ran: no service ticket, no web search, no paid fetch.
  await expect(log.getByText(/Requested /u)).toHaveCount(0);
  await expect(log.getByText(/settling your payment/u)).toHaveCount(0);
  // A turn that reaches no money tool files no receipt at all.
  await expect(page.getByLabel(/^Receipt:/u)).toHaveCount(0);
  expect(errors).toEqual([]);
});
