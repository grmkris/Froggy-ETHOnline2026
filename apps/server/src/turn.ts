import type { BrowserHandle } from "@froggy/browser";
/**
 * One agent turn, started from any surface.
 *
 * The web chat and a Telegram message start the same loop: the same model,
 * the same tools, the same session and mandate, the same run registry. What
 * differs is only where the words go afterwards — an SSE response, or a
 * Telegram thread — so that is the only part each caller does itself.
 *
 * The run's signal is the abort signal, never a request's. A client hanging
 * up is a detach, not a cancellation; with money in the loop, aborting on
 * socket close would kill a turn between reserving a spend and writing its
 * receipt.
 */
import type { AgentConnectionId, HistoryRun, SessionId } from "@froggy/domain";
import type { TaskOutcome } from "@froggy/protocol";
import {
  APICallError,
  InvalidToolInputError,
  convertToModelMessages,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  toUIMessageStream,
  readUIMessageStream,
} from "ai";
import type { UIMessage, UIMessageChunk, ToolSet } from "ai";
import { Predicate, Schema } from "effect";

import type { ModelBudget } from "./budget";
import type { ToolSurface } from "./capabilities";
import { canUseTool, connectionScopes } from "./capabilities";
import { detached } from "./detached";
import { acceptHistory, checkpointHistory, historyTools } from "./history";
import type { HistoryInput } from "./history";
import { internalHistoryTool } from "./history-retrieval";
import { createModel } from "./model";
import type { Notices } from "./notices";
import { composeInstructions } from "./prompt";
import type { PromptSurface } from "./prompt";
import { researchTaskContext } from "./research-task-context";
import type { ChatRun, ChatRunRegistry } from "./runs";
import { isTimezone } from "./schedules";
import type { Services } from "./services";
import type { WorkspaceSession } from "./session";
import { buildTools } from "./tools";
import type { UnlockTokens } from "./unlock";
import type { Workspaces } from "./workspaces";

/**
 * Twelve steps.
 *
 * Enough for look-then-pay-then-explain with room to recover from a mistake;
 * short enough that a doom loop costs a few cents rather than an afternoon.
 */
const STEP_CAP = 12;

interface PaidSettings {
  maxOutputTokens?: number;
}

/** What a saved tool error may say. Long enough for a validator's complaint, not a page. */
const ERROR_TEXT_CAP = 1000;
const capped = (text: string): string =>
  text.length <= ERROR_TEXT_CAP ? text : `${text.slice(0, ERROR_TEXT_CAP)}…`;

/** Standard Schema issues, as the SDK attaches them to a refused tool input. */
const Issues = Schema.Array(
  Schema.Struct({
    message: Schema.String,
    path: Schema.optional(
      Schema.Array(
        Schema.Union([
          Schema.String,
          Schema.Number,
          Schema.Struct({ key: Schema.Union([Schema.String, Schema.Number]) }),
        ])
      )
    ),
  })
);
const decodeRefusal = Schema.decodeUnknownResult(
  Schema.Struct({ cause: Issues })
);
const issueText = (issue: (typeof Issues.Type)[number]): string => {
  const path = (issue.path ?? [])
    .map((segment) =>
      Predicate.hasProperty(segment, "key")
        ? String(segment.key)
        : String(segment)
    )
    .join(".");
  return path === "" ? issue.message : `${path}: ${issue.message}`;
};

/**
 * What a failed step says in the saved message.
 *
 * The SDK's default is "An error occurred.", which is what the model read on
 * every replay while the validator's actual complaint was thrown away, and
 * what the person read under a tool card. An argument the schema refused is
 * now named with its path, and a tool's own refusal is kept as written; those
 * are already in the execution record. A provider failure stays generic: its
 * response body is not for the person.
 */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- the SDK hands the raw thrown value in as `unknown`; naming it is this function's whole job.
export const streamErrorText = (error: unknown): string => {
  if (InvalidToolInputError.isInstance(error)) {
    const refusal = decodeRefusal(error.cause);
    const detail =
      refusal._tag === "Success"
        ? refusal.success.cause.map(issueText).join("; ")
        : error.message;
    return capped(
      `Invalid arguments for ${error.toolName}: ${detail}. Fix them and call the tool again.`
    );
  }
  if (APICallError.isInstance(error)) {
    return "Froggy didn't answer that one. Send it again.";
  }
  return error instanceof Error && error.message !== ""
    ? capped(error.message)
    : "An error occurred.";
};

export interface TurnDeps {
  readonly reportOutcome?: ((outcome: TaskOutcome) => void) | undefined;
  readonly connectionId?: AgentConnectionId | null;
  readonly surface?: ToolSurface;
  readonly paidBrowse?: {
    readonly beforeStep: (promptBytes: number) => Promise<void>;
    readonly afterStep: (usage: {
      readonly inputTokens?: number | undefined;
      readonly outputTokens?: number | undefined;
    }) => Promise<void>;
  };

  readonly browser: BrowserHandle;
  /** Turns and steps per person per day. Refuses before any model call. */
  readonly budget?: ModelBudget;
  readonly instructions?: string;
  readonly activeTools?: readonly string[];
  readonly budgetUsdMicros?: number;
  readonly interactive?: boolean;
  readonly shouldStop?: () => boolean;
  /** Where the `notify` tool's message goes. */
  readonly notices: Notices;
  readonly oracleUrl: string;
  readonly runs: ChatRunRegistry;
  readonly services: Services;
  readonly session: WorkspaceSession;
  /** Steps a turn may take. A paid browse buys a fixed number; chat keeps the default. */
  readonly stepCap?: number;
  readonly unlocks: UnlockTokens;
  readonly workspaces: Workspaces;
}

export interface TurnInput extends HistoryInput {
  readonly sessionId: SessionId;
  /** The person's IANA zone as the caller knows it: the browser's, or a schedule's. */
  readonly timezone?: string | undefined;
}

/**
 * Everything the person themselves wrote this conversation, joined.
 *
 * The tools use it to tell an address the person typed from one the model
 * produced. Only text parts of user messages: a tool result or an assistant
 * message quoting an address does not make it the person's.
 */
const userTextOf = (messages: readonly UIMessage[]): string =>
  messages
    .filter((message) => message.role === "user")
    .flatMap((message) => message.parts)
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("\n");

/** The room the words land in: the web chat and Telegram share a tool surface, not a reader. */
const promptSurfaceOf = (
  surface: ToolSurface,
  source: NonNullable<HistoryInput["source"]>
): PromptSurface => {
  if (surface !== "chat") {
    return surface;
  }
  return source === "telegram" ? "telegram" : "web";
};

export const startTurn = async (deps: TurnDeps, input: TurnInput) => {
  const { userId } = deps.session;
  // Before the run is registered: a refused turn must not abort the one
  // that is already running, and must cost no model call.
  const accepted = await acceptHistory(
    deps.services.store.history,
    userId,
    input
  );
  try {
    deps.budget?.begin(userId);
  } catch (error) {
    await checkpointHistory(
      deps.services.store.history,
      userId,
      accepted.run,
      null,
      "failed",
      error instanceof Error ? error.message : "Turn refused"
    );
    throw error;
  }
  const run = deps.runs.start(input.sessionId, accepted.run.id);
  // The same tool set goes to the conversion and to the model: a tool's
  // `toModelOutput` is applied by the conversion, so the two must agree.
  const surface = deps.surface ?? (deps.paidBrowse ? "browse" : "chat");
  const scopes = await connectionScopes(
    deps.services.store,
    userId,
    deps.connectionId ?? null
  );
  const toolDeps = {
    surface,
    reportOutcome: deps.reportOutcome,
    allowedTools: deps.activeTools,
    connectionId: deps.connectionId ?? null,
    browser: deps.browser,
    paidBrowse: deps.paidBrowse !== undefined,
    interactive: deps.interactive ?? true,
    notices: deps.notices,
    run,
    services: deps.services,
    session: deps.session,
    unlocks: deps.unlocks,
    userText: userTextOf(accepted.messages),
    workspaces: deps.workspaces,
  };
  const tools = historyTools(
    {
      ...buildTools(
        deps.budgetUsdMicros === undefined
          ? toolDeps
          : { ...toolDeps, budgetUsdMicros: deps.budgetUsdMicros }
      ),
      history_search: internalHistoryTool(
        deps.services.store,
        userId,
        accepted.run.conversationId,
        input.crossThreadHistory === true
      ),
    },
    deps.services.store,
    userId,
    accepted.run,
    () => {
      run.abort();
    }
  );
  const paidSettings: PaidSettings = {};
  if (deps.paidBrowse !== undefined) {
    paidSettings.maxOutputTokens = 2048;
  }
  const taskContext = await researchTaskContext(
    deps.services.store,
    userId,
    accepted.messages
  ).catch(
    () =>
      "\nSaved browser task status could not be loaded. Do not infer its outcome.\n"
  );
  // The zone the caller knows beats the one the last schedule was set in;
  // neither is a reason to fail a turn.
  const timezone =
    input.timezone !== undefined && isTimezone(input.timezone)
      ? input.timezone
      : await deps.services.store.schedules
          .timezoneFor(userId)
          .catch(() => null);
  const promptSurface = promptSurfaceOf(surface, input.source ?? "web");
  let result: ReturnType<typeof streamText<ToolSet>>;
  try {
    result = streamText<ToolSet>({
      abortSignal: run.signal,
      instructions: composeInstructions({
        situation: { at: Date.now(), timezone, surface: promptSurface },
        toolSurface: surface,
        taskContext,
        instructions: deps.instructions,
        own: deps.session.ownEvmAddresses(),
        appOrigin: deps.services.environment.appOrigin,
      }),
      activeTools: Object.keys(tools).filter(
        (name) =>
          canUseTool(name, surface, scopes) &&
          (deps.activeTools === undefined || deps.activeTools.includes(name))
      ),
      ...paidSettings,
      messages: await convertToModelMessages(accepted.messages, { tools }),
      model: createModel(deps.services.environment, {
        oracleUrl: deps.oracleUrl,
      }),
      maxRetries: deps.paidBrowse === undefined ? 2 : 0,
      prepareStep: async ({ messages, instructions }) => {
        await deps.paidBrowse?.beforeStep(
          Buffer.byteLength(JSON.stringify({ messages, instructions })) + 65_536
        );
      },
      onStepEnd: async ({ usage }) => {
        deps.budget?.step(userId);
        await deps.paidBrowse?.afterStep(usage);
      },
      // Judged between steps, so a day's steps run out before the next call
      // rather than after one that overshot.
      stopWhen: [
        stepCountIs(deps.stepCap ?? STEP_CAP),
        () =>
          (deps.budget?.exhausted(userId) ?? false) ||
          (deps.shouldStop?.() ?? false),
      ],
      tools,
    });
  } catch (error) {
    await checkpointHistory(
      deps.services.store.history,
      userId,
      accepted.run,
      null,
      "failed",
      error instanceof Error ? error.message : "Could not start the model"
    );
    deps.runs.settle(input.sessionId, run);
    throw error;
  }

  const stream = toUIMessageStream({
    generateMessageId: () => accepted.run.assistantMessageId,
    messageMetadata: ({ part }) =>
      part.type === "start"
        ? {
            at: accepted.run.createdAt,
            runId: run.id,
            conversationId: accepted.run.conversationId,
          }
        : undefined,
    onError: streamErrorText,
    sendReasoning: false,
    sendSources: true,
    stream: result.stream,
  });
  const [visible, snapshots] = stream.tee();
  let failure: string | null = null;
  let latest: UIMessage | null = null;
  let queue = Promise.resolve();
  const heartbeat = setInterval(() => {
    const previous = queue;
    queue = (async () => {
      await previous;
      try {
        await checkpointHistory(
          deps.services.store.history,
          userId,
          accepted.run,
          null,
          "running"
        );
      } catch {
        failure =
          "History could not be saved. Inspect this run before retrying.";
        run.abort();
      }
    })();
  }, 10_000);
  const saved = (async () => {
    let checkpointAt = 0;
    try {
      for await (const snapshot of readUIMessageStream({
        stream: snapshots,
        onError: () => {
          failure = "The model stream failed.";
        },
      })) {
        latest = snapshot;
        if (Date.now() - checkpointAt >= 1000) {
          await checkpointHistory(
            deps.services.store.history,
            userId,
            accepted.run,
            latest,
            "running"
          );
          checkpointAt = Date.now();
        }
      }
      clearInterval(heartbeat);
      await queue;
      let status: HistoryRun["status"] = run.signal.aborted
        ? "stopped"
        : "completed";
      if (failure !== null) {
        status = "failed";
      }
      await checkpointHistory(
        deps.services.store.history,
        userId,
        accepted.run,
        latest,
        status,
        failure
      );
    } catch (error) {
      run.abort();
      throw error;
    } finally {
      clearInterval(heartbeat);
    }
  })();
  // A reader is attached immediately. The outward stream waits for the durable
  // terminal write before closing; save failure is a stream failure, never success.
  detached("history recorder", async () => {
    await saved;
  });
  const uiStream = visible.pipeThrough(
    new TransformStream<UIMessageChunk, UIMessageChunk>({
      transform(chunk, controller) {
        controller.enqueue(chunk);
      },
      async flush() {
        await saved;
      },
    })
  );
  return { run, result, uiStream, history: accepted.run, saved };
};

type Turn = Awaited<ReturnType<typeof startTurn>>;

/** The turn as the web client reads it, with the run id stamped on the message. */
export const uiStreamOf = (turn: Turn) => turn.uiStream;

/**
 * Keep the loop alive and the replay buffer filled, whoever is listening.
 *
 * Without a reader on the recorded branch the model loop stalls the moment
 * the tab closes, and the turn finishes truncated. Settling is guarded by the
 * registry so a superseded run cannot evict its successor.
 */
export const recordTurn = (
  deps: Pick<TurnDeps, "runs">,
  sessionId: SessionId,
  run: ChatRun,
  sse: ReadableStream<string>
): void => {
  detached("turn recorder", async () => {
    try {
      await run.record(sse);
    } finally {
      deps.runs.settle(sessionId, run);
    }
  });
};

/** The SSE text of a turn, for a recorder with no HTTP response to tee from. */
export const sseOf = (turn: Turn): ReadableStream<string> => {
  const response = createUIMessageStreamResponse({ stream: uiStreamOf(turn) });
  const { body } = response;
  if (body === null) {
    return new ReadableStream<string>({
      start(controller) {
        controller.close();
      },
    });
  }
  return body.pipeThrough(new TextDecoderStream());
};
