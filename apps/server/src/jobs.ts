/**
 * The daily digest: one unattended turn per person per day.
 *
 * The same tools, the same session, the same mandate — with two things a
 * chat turn has that a job does not. There is nobody to ask, so a spend the
 * policy would park on a card is refused as unavailable instead. And there is
 * no one to read a runaway, so the turn is bounded three ways: a minute, a
 * dozen steps, and a budget under the mandate's own caps, past which the loop
 * stops before the next call rather than after it.
 *
 * A person who is mid-conversation is not interrupted: their job waits for
 * the next tick inside the hour, and is skipped if the hour passes.
 */

import type { Receipt, UserId } from "@froggy/domain";
import type { AppServerMessage } from "@froggy/protocol";
import { stepCountIs, streamText } from "ai";

import { createModel } from "./model";
import type { ChatRunRegistry } from "./runs";
import type { Services } from "./services";
import { isConversion } from "./session";
import { buildTools } from "./tools";
import type { UnlockTokens } from "./unlock";
import type { Workspaces } from "./workspaces";

/** A minute. Long enough for three tool calls, short enough to be a job. */
const JOB_TIMEOUT_MS = 60_000;
const JOB_STEP_CAP = 12;
/** Five cents a day, whatever the mandate would allow. */
const JOB_BUDGET_USD_MICROS = 50_000;

const JOB_TOOLS = ["graph_query", "x402_fetch", "wallet_status"] as const;

const jobPrompt = (oracleUrl: string): string =>
  `You are Froggy, writing the user's daily digest while they are away.

Nobody is watching and nobody can be asked: a spend that needs approval will be
refused, and that is the correct outcome, not a problem to work around. Query
The Graph for the current lending picture, buy the paid snapshot at ${oracleUrl}
at most once if the mandate allows it, check the wallet, and write four
sentences at most: what changed, what it cost, what was refused and why. Plain
language; no headings.`;

export interface DigestReport {
  readonly at: number;
  readonly outcome: "aborted" | "finished" | "skipped";
  readonly receipts: readonly Receipt[];
  readonly reason: string | null;
  readonly spentUsdMicros: number;
  readonly summary: string;
  readonly userId: UserId;
}

/** Where a finished digest goes. A log today; a Telegram thread when paired. */
export interface DigestSink {
  readonly deliver: (report: DigestReport) => Promise<void>;
}

export interface JobDeps {
  readonly now?: () => number;
  readonly oracleUrl: string;
  /** The tab is told a turn began that it did not start, and offered a reload. */
  readonly publishApp: (userId: UserId, message: AppServerMessage) => void;
  readonly runs: ChatRunRegistry;
  readonly services: Services;
  readonly sink: DigestSink;
  readonly unlocks: UnlockTokens;
  readonly workspaces: Workspaces;
}

/** What the digest paid: settled receipts, less the USDC that only became HBAR. */
const spentIn = (receipts: readonly Receipt[]): number =>
  receipts
    .filter(
      (receipt) => receipt.settlement !== undefined && !isConversion(receipt)
    )
    .reduce((total, receipt) => total + receipt.intent.usdMicros, 0);

/**
 * Run one person's digest now. Resolves to the report, which has also been
 * delivered; never rejects, because a scheduler that dies on one person's
 * bad day takes everyone else's digest with it.
 */
export const runDailyFor = async (
  deps: JobDeps,
  userId: UserId
): Promise<DigestReport> => {
  const now = deps.now ?? Date.now;
  const workspace = await deps.workspaces.hydrate(userId);
  const { session } = workspace;
  const skip = async (reason: string): Promise<DigestReport> => {
    const report: DigestReport = {
      at: now(),
      outcome: "skipped",
      receipts: [],
      reason,
      spentUsdMicros: 0,
      summary: "",
      userId,
    };
    await deps.sink.deliver(report);
    return report;
  };
  if (deps.runs.get(session.id) !== null) {
    return await skip("a turn is already running");
  }

  const run = deps.runs.start(session.id);
  deps.publishApp(userId, {
    runId: run.id,
    surface: "digest",
    type: "run.started",
    v: 1,
  });
  const timer = setTimeout(() => {
    run.abort();
  }, JOB_TIMEOUT_MS);
  const mine = (): readonly Receipt[] =>
    session.history.filter((receipt) => receipt.runId === run.id);

  let summary = "";
  let outcome: DigestReport["outcome"] = "finished";
  let reason: string | null = null;
  try {
    // Streamed rather than generated in one call, because the scripted model
    // that runs without a key only speaks the streaming half of the SDK, and
    // a job must run exactly as a chat turn does or its evidence means less.
    const result = streamText({
      abortSignal: run.signal,
      activeTools: [...JOB_TOOLS],
      instructions: jobPrompt(deps.oracleUrl),
      model: createModel(deps.services.environment, {
        oracleUrl: deps.oracleUrl,
      }),
      prompt: "Write today's digest.",
      stopWhen: [
        stepCountIs(JOB_STEP_CAP),
        // Judged between steps, so the loop stops before the next call
        // rather than after a call that overshot. One paid request per
        // digest is the tool's rule, not a stop: stopping here would end
        // the turn before the summary it paid for.
        () => spentIn(mine()) >= JOB_BUDGET_USD_MICROS,
      ],
      tools: buildTools({
        browser: workspace.browser,
        interactive: false,
        run,
        services: deps.services,
        session,
        unlocks: deps.unlocks,
        workspaces: deps.workspaces,
      }),
    });
    summary = await result.text;
  } catch (error) {
    outcome = "aborted";
    const message = error instanceof Error ? error.message : "unknown error";
    reason = run.signal.aborted ? "stopped after a minute" : message;
  } finally {
    clearTimeout(timer);
    deps.runs.settle(session.id, run);
  }

  const receipts = mine();
  const report: DigestReport = {
    at: now(),
    outcome,
    receipts,
    reason,
    spentUsdMicros: spentIn(receipts),
    summary,
    userId,
  };
  await deps.sink.deliver(report);
  return report;
};
