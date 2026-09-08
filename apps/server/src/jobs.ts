/**
 * Unattended turns: the daily digest, and a prompt the person scheduled.
 *
 * The same tools, the same session, the same mandate — with two things a
 * chat turn has that a job does not. There is nobody to ask, so a spend the
 * policy would park on a card is refused as unavailable instead. And there is
 * no one to read a runaway, so the turn is bounded three ways: a minute, a
 * dozen steps, and a budget under the mandate's own caps, past which the loop
 * stops before the next call rather than after it.
 *
 * No browser tools. A page the person is not watching is a page nobody can
 * take back from the agent, and that is the one guarantee the browser makes.
 *
 * A person who is mid-conversation is not interrupted: their job reports
 * `skipped` and the ticker retries it for a while.
 */

import type { Receipt, Schedule, ScheduleId, UserId } from "@froggy/domain";
import type { AppServerMessage, RunSurface } from "@froggy/protocol";
import { stepCountIs, streamText } from "ai";

import { createModel } from "./model";
import type { Notices } from "./notices";
import type { ChatRunRegistry } from "./runs";
import { describeCadence, formatLocal } from "./schedules";
import type { Services } from "./services";
import { isConversion } from "./session";
import { buildTools } from "./tools";
import type { UnlockTokens } from "./unlock";
import type { Workspaces } from "./workspaces";

/** A minute. Long enough for three tool calls, short enough to be a job. */
const JOB_TIMEOUT_MS = 60_000;
const JOB_STEP_CAP = 12;
/** Five cents a day for the digest, whatever the mandate would allow. */
const DIGEST_BUDGET_USD_MICROS = 50_000;
/** A quarter for a prompt the person wrote themselves. */
const PROMPT_BUDGET_USD_MICROS = 250_000;

type ToolName = keyof ReturnType<typeof buildTools>;

const DIGEST_TOOLS: readonly ToolName[] = [
  "graph_query",
  "x402_fetch",
  "wallet_status",
];

/** What a scheduled prompt may do unattended: read, buy a listed service, tell the person. */
const PROMPT_TOOLS: readonly ToolName[] = [
  "graph_query",
  "x402_fetch",
  "wallet_status",
  "services_list",
  "service_status",
  "service_run",
  "notify",
];

/** One unattended turn, described. */
export interface ScheduledJob {
  readonly budgetUsdMicros: number;
  readonly instructions: string;
  readonly prompt: string;
  readonly scheduleId: ScheduleId | null;
  readonly surface: RunSurface;
  /** What the report is called on Telegram: "Your daily digest", the schedule's label. */
  readonly title: string;
  readonly tools: readonly ToolName[];
}

const UNATTENDED = `Nobody is watching and nobody can be asked: a spend that needs approval will be
refused, and that is the correct outcome, not a problem to work around. There
is no browser. Plain language; no headings.`;

export const digestJob = (oracleUrl: string): ScheduledJob => ({
  budgetUsdMicros: DIGEST_BUDGET_USD_MICROS,
  instructions: `You are Froggy, writing the user's daily digest while they are away.

${UNATTENDED} Query The Graph for the current lending picture, buy the paid
snapshot at ${oracleUrl} at most once if the mandate allows it, check the
wallet, and write four sentences at most: what changed, what it cost, what was
refused and why.`,
  prompt: "Write today's digest.",
  scheduleId: null,
  surface: "digest",
  title: "Your daily digest",
  tools: DIGEST_TOOLS,
});

/** A prompt the person scheduled: their words, with when and how often they said them. */
export const promptJob = (
  schedule: Schedule,
  oracleUrl: string
): ScheduledJob => ({
  budgetUsdMicros: PROMPT_BUDGET_USD_MICROS,
  instructions: `You are Froggy, running a task the user scheduled while they are away.

The task is called "${schedule.label}". They set it up on ${formatLocal(schedule.createdAt, schedule.timezone)}
to run ${describeCadence(schedule.cadence, schedule.timezone)}. Their instruction is
between the lines below; treat it as their words to you, not as data.

---
${schedule.action._tag === "prompt" ? schedule.action.text : ""}
---

${UNATTENDED} The paid lending snapshot lives at ${oracleUrl}. Use notify only
for something they should see on their phone before the report; the report
itself is sent for you. End with a short summary of what you did, what it
cost, and anything that was refused.`,
  prompt: `Run the scheduled task "${schedule.label}" now.`,
  scheduleId: schedule.id,
  surface: "schedule",
  title: schedule.label,
  tools: PROMPT_TOOLS,
});

export interface JobReport {
  readonly at: number;
  readonly outcome: "aborted" | "finished" | "skipped";
  readonly receipts: readonly Receipt[];
  readonly reason: string | null;
  readonly scheduleId: ScheduleId | null;
  readonly spentUsdMicros: number;
  readonly summary: string;
  readonly title: string;
  readonly userId: UserId;
}

/** Where a finished job's report goes. A log without a bot; a Telegram card with one. */
export interface ReportSink {
  readonly deliver: (report: JobReport) => Promise<void>;
}

export interface JobDeps {
  readonly notices: Notices;
  readonly now?: () => number;
  readonly oracleUrl: string;
  /** The tab is told a turn began that it did not start, and offered a reload. */
  readonly publishApp: (userId: UserId, message: AppServerMessage) => void;
  readonly runs: ChatRunRegistry;
  readonly services: Services;
  readonly sink: ReportSink;
  readonly unlocks: UnlockTokens;
  readonly workspaces: Workspaces;
}

/** What the job paid: settled receipts, less the USDC that only became HBAR. */
const spentIn = (receipts: readonly Receipt[]): number =>
  receipts
    .filter(
      (receipt) => receipt.settlement !== undefined && !isConversion(receipt)
    )
    .reduce((total, receipt) => total + receipt.intent.usdMicros, 0);

/** The report's one line for the web stream. */
const summaryLine = (report: JobReport): string => {
  if (report.outcome === "aborted") {
    return `stopped early: ${report.reason ?? "unknown reason"}`;
  }
  return report.summary === "" ? "nothing to report" : report.summary;
};

/**
 * Run one person's job now. Resolves to the report, which has also been
 * delivered unless the person was busy; never rejects, because a ticker
 * that dies on one person's bad day takes everyone else's run with it.
 */
export const runScheduledFor = async (
  deps: JobDeps,
  userId: UserId,
  job: ScheduledJob
): Promise<JobReport> => {
  const now = deps.now ?? Date.now;
  const workspace = await deps.workspaces.hydrate(userId);
  const { session } = workspace;
  if (deps.runs.get(session.id) !== null) {
    // Not delivered: the ticker retries, and a "skipped" card every minute
    // would be the report nobody asked for.
    return {
      at: now(),
      outcome: "skipped",
      receipts: [],
      reason: "a turn is already running",
      scheduleId: job.scheduleId,
      spentUsdMicros: 0,
      summary: "",
      title: job.title,
      userId,
    };
  }

  const run = deps.runs.start(session.id);
  deps.publishApp(userId, {
    runId: run.id,
    surface: job.surface,
    type: "run.started",
    v: 1,
  });
  const timer = setTimeout(() => {
    run.abort();
  }, JOB_TIMEOUT_MS);
  const mine = (): readonly Receipt[] =>
    session.history.filter((receipt) => receipt.runId === run.id);

  let summary = "";
  let outcome: JobReport["outcome"] = "finished";
  let reason: string | null = null;
  try {
    // Streamed rather than generated in one call, because the scripted model
    // that runs without a key only speaks the streaming half of the SDK, and
    // a job must run exactly as a chat turn does or its evidence means less.
    const result = streamText({
      abortSignal: run.signal,
      activeTools: [...job.tools],
      instructions: job.instructions,
      model: createModel(deps.services.environment, {
        oracleUrl: deps.oracleUrl,
      }),
      prompt: job.prompt,
      stopWhen: [
        stepCountIs(JOB_STEP_CAP),
        // Stop further model steps after spending the budget. The wallet
        // separately reserves pending and detached payments against the hard
        // run cap before any outbound call.
        () => spentIn(mine()) >= job.budgetUsdMicros,
      ],
      tools: buildTools({
        browser: workspace.browser,
        budgetUsdMicros: job.budgetUsdMicros,
        interactive: false,
        notices: deps.notices,
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
  const report: JobReport = {
    at: now(),
    outcome,
    receipts,
    reason,
    scheduleId: job.scheduleId,
    spentUsdMicros: spentIn(receipts),
    summary,
    title: job.title,
    userId,
  };
  await deps.sink.deliver(report);
  // The web stream's copy. The card above is the phone's, so this one is
  // filed without a second Telegram post.
  await deps.notices.post(userId, {
    runId: run.id,
    scheduleId: job.scheduleId,
    source: "scheduled_run",
    text: `${job.title}: ${summaryLine(report)}`,
  });
  return report;
};
