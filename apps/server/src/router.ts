/**
 * The HTTP surface.
 *
 * A hand-written router rather than a framework. The route table is nine
 * entries and a framework would add a dependency, a matching algorithm and a
 * middleware concept to serve them — while the two things this server actually
 * needs from its HTTP layer, a WebSocket upgrade and a streaming response, are
 * exactly the two things frameworks make harder to reach.
 *
 * Split out of `index.ts` so the process lifecycle and the request handling are
 * separately readable: one is about acquiring Chrome and a socket, the other is
 * about answering questions.
 */
import {
  ConversationId,
  AgentConnectionId,
  AgentTokenId,
  OAuthGrantId,
  TaskId,
} from "@froggy/domain";
import type {
  AgentToken,
  DirectoryEntry,
  OAuthGrant,
  UserId,
} from "@froggy/domain";
import type { ProbeSummary } from "@froggy/payments";
import type { AgentDetail } from "@froggy/protocol";
import { HistoryConflictError } from "@froggy/wallet";
import { validateUIMessages } from "ai";
import { Schema } from "effect";

import { serveAgentDoor } from "./agent-door-route";
import { caip10, universalAgentId } from "./agent-identity";
import {
  agentDetail,
  trackAgentInvocation,
  trackAgentRequest,
} from "./agent-invocations";
import {
  agentMayCall,
  looksLikeAgentSecret,
  mintAgentToken,
  requiredScope,
  resolveAgentSecret,
} from "./agents";
import { authenticate, bearerFromRequest } from "./auth";
import { ModelBudgetExhaustedError } from "./budget";
import type { ModelBudget } from "./budget";
import type { ChatRequest } from "./chat";
import { handleChat } from "./chat";
import { serveCli } from "./cli-route";
import { addToDirectory, probeUrl, removeFromDirectory } from "./directory";
import type { AddOutcome } from "./directory";
import type { Environment } from "./environment";
import type { AgentGrants } from "./grants";
import { handleHistory } from "./history-routes";
import type { InteractionRegistry } from "./interactions";
import { digestJob, runScheduledFor } from "./jobs";
import type { JobDeps, JobReport } from "./jobs";
import { handleMcp } from "./mcp";
import type { Notices } from "./notices";
import {
  handleOAuth,
  handleOAuthApi,
  insufficientScope,
  looksLikeAccessToken,
  resolveAccessToken,
  revokeGrant,
  unauthorizedMcp,
} from "./oauth";
import {
  handleOracleRequest,
  handleSaleLookup,
  PRICE_TINYBARS,
  SALES_PATH,
} from "./oracle-route";
import type { PersonPolicies } from "./person-policies";
import { handlePolicyRoutes } from "./policy-routes";
import { handlePurchases } from "./purchase-routes";
import type { ChatRunRegistry } from "./runs";
import { handleDigest, handleSchedules } from "./schedule-routes";
import { handleServices } from "./service-routes";
import type { Services } from "./services";
import type { WorkspaceSession } from "./session";
import { llmText, skillText } from "./skill";
import {
  handleTaskEvents,
  handleTaskGet,
  handleTaskList,
  handleTaskPost,
  handleWalletPay,
} from "./tasks";
import type { TaskCaller, TaskDeps } from "./tasks";
import type { TelegramPager } from "./telegram/pager";
import { handleTrades } from "./trade-routes";
import { renderUnlock } from "./unlock";
import type { UnlockTokens } from "./unlock";
import type { Workspaces } from "./workspaces";
import { handleX402Demo, X402_DEMO_REPORT_PATH } from "./x402-demo";

export const ORACLE_PATH = "/oracle/snapshot";

/**
 * What `POST /api/chat` accepts.
 *
 * `messages` stays `Unknown` on purpose: the shape is the AI SDK's `UIMessage`
 * union, which is large, versioned by the SDK, and validated by the SDK's own
 * conversion on the next line. Re-declaring it here would be a second copy of
 * someone else's type that only ever drifts.
 */
const ChatBody = Schema.Struct({
  crossThreadHistory: Schema.optional(Schema.Boolean),
  v: Schema.Literal(1),
  messages: Schema.Array(Schema.Unknown).check(Schema.isMaxLength(100)),
  conversationId: Schema.optional(ConversationId),
  revision: Schema.optional(Schema.Int),
});
const decodeChatBody = Schema.decodeUnknownResult(ChatBody);
const AgentBody = Schema.Struct({ label: Schema.String });
const decodeAgentBody = Schema.decodeUnknownResult(AgentBody);

const TASKS_PATH = "/api/tasks";

/** Every JSON response this server sends. Named so the shapes stay enumerable. */
type ResponseBody =
  | AgentDetail
  | { readonly error: string }
  | {
      readonly hederaAccounts: "host" | "own";
      readonly modes: Environment["modes"];
      readonly runtime: string;
      readonly status: string;
      readonly trading: {
        readonly enso: Environment["trading"]["ensoMode"];
        readonly jupiter: Environment["trading"]["jupiterMode"];
        readonly pons: Environment["trading"]["ponsMode"];
        readonly pump: Environment["trading"]["pumpMode"];
        readonly uniswap: Environment["trading"]["uniswapMode"];
      };
    }
  | { readonly deleted: true }
  | { readonly asked: true }
  | {
      readonly outcome: JobReport["outcome"];
      readonly reason: string | null;
      readonly spentUsdMicros: number;
      readonly summary: string;
    }
  | {
      readonly code: string;
      readonly expiresAt: number;
      readonly link: string | null;
    }
  | { readonly paired: boolean; readonly since: number | null }
  | { readonly entries: readonly DirectoryEntry[] }
  | { readonly removed: boolean }
  | AddOutcome
  | ProbeSummary
  | { readonly receipts: WorkspaceSession["history"] }
  | { readonly stopped: boolean }
  | {
      readonly agents: readonly AgentToken[];
      readonly grants: readonly OAuthGrant[];
    }
  | { readonly revoked: boolean }
  | {
      readonly secret: string;
      readonly skill: string;
      readonly token: AgentToken;
    }
  | Awaited<ReturnType<WorkspaceSession["walletSummary"]>>;

const json = (body: ResponseBody, status = 200): Response =>
  Response.json(body, { headers: { "cache-control": "no-store" }, status });

export interface RouterDeps {
  readonly budget: ModelBudget;
  readonly environment: Environment;
  /** One-time links to unlocked pages, opened by the shared browser. */
  readonly unlocks: UnlockTokens;
  readonly grants: AgentGrants;
  readonly interactions: InteractionRegistry;
  /** What a scheduled run needs; the digest test runs one on demand. */
  readonly jobs: JobDeps;
  /** Where the agent's unprompted messages go. */
  readonly notices: Notices;
  readonly oracleUrl: string;
  readonly pager: TelegramPager;
  /** Each person's own Privy policy, when this deployment mints them. */
  readonly policies?: Pick<PersonPolicies, "adjust" | "current">;
  readonly runs: ChatRunRegistry;
  readonly services: Services;
  readonly workspaces: Workspaces;
}

/** Telegram pairing: whether there is one, mint a code, or drop it. */
const handleTelegram = async (
  deps: RouterDeps,
  request: Request,
  userId: UserId
): Promise<Response> => {
  if (request.method === "POST") {
    if (deps.pager.mode === "stub") {
      return json(
        { error: "Telegram is not configured on this deployment." },
        404
      );
    }
    const minted = deps.pager.codes.mint(userId);
    return json({
      code: minted.code,
      expiresAt: minted.expiresAt,
      link: deps.pager.link(minted.code),
    });
  }
  if (request.method === "DELETE") {
    await deps.services.store.telegram.unpair(userId);
    return json({ paired: false, since: null });
  }
  const pairing = await deps.services.store.telegram.forUser(userId);
  return json({ paired: pairing !== null, since: pairing?.since ?? null });
};

/**
 * Refuse in one shape, for every reason.
 *
 * No token, an expired token and a token for a user we cannot parse all
 * produce this — a caller learns that they are not authenticated and nothing
 * about which half of their guess was wrong.
 */
const UNAUTHORIZED = { error: "Sign in to use this." } as const;

/**
 * Serve the built SPA, with any unknown path falling back to `index.html`.
 *
 * Empty `staticDirectory` means development, where Vite serves the client and
 * proxies here — so an unmatched path is a genuine 404 rather than a route the
 * client will recognise.
 */
const serveStatic = async (
  directory: string,
  pathname: string
): Promise<Response> => {
  if (directory === "") {
    return json({ error: "Not found." }, 404);
  }
  const file = Bun.file(
    `${directory}${pathname === "/" ? "/index.html" : pathname}`
  );
  if (await file.exists()) {
    return new Response(file);
  }
  return new Response(Bun.file(`${directory}/index.html`));
};

/** A turn from the web chat. */
type ChatIngress = { -readonly [K in keyof ChatRequest]: ChatRequest[K] };
const handleChatPost = async (
  deps: RouterDeps,
  request: Request,
  workspace: Awaited<ReturnType<Workspaces["hydrate"]>>,
  userId: UserId
): Promise<Response> => {
  const sessionId = workspace.session.id;
  const decoded = decodeChatBody(await request.json());
  if (decoded._tag === "Failure") {
    return json({ error: "Malformed chat request." }, 400);
  }
  deps.workspaces.touch(userId);
  try {
    const input: ChatIngress = {
      messages: await validateUIMessages({
        messages: decoded.success.messages,
      }),
      sessionId,
    };
    if (decoded.success.conversationId !== undefined) {
      input.conversationId = decoded.success.conversationId;
    }
    if (decoded.success.crossThreadHistory !== undefined) {
      input.crossThreadHistory = decoded.success.crossThreadHistory;
    }
    if (decoded.success.revision !== undefined) {
      input.revision = decoded.success.revision;
    }
    return await handleChat(
      {
        browser: workspace.browser,
        budget: deps.budget,
        notices: deps.notices,
        oracleUrl: deps.oracleUrl,
        runs: deps.runs,
        services: deps.services,
        session: workspace.session,
        unlocks: deps.unlocks,
        workspaces: deps.workspaces,
      },
      input
    );
  } catch (error) {
    // The day's turns are spent. Said as a status the client can read and a
    // sentence the person can, before any model call was made.
    if (error instanceof HistoryConflictError) {
      return json({ error: error.message }, 409);
    }
    if (error instanceof ModelBudgetExhaustedError) {
      return json({ error: error.message }, 429);
    }
    throw error;
  }
};

const UrlBody = Schema.Struct({ url: Schema.String });
const decodeUrlBody = Schema.decodeUnknownResult(UrlBody);

/**
 * The directory: list, probe, add, remove.
 *
 * Probing pays nothing and changes nothing. Adding is the one write that
 * makes a stranger payable, and it is a person's click, never a tool.
 */
const handleDirectory = async (
  deps: RouterDeps,
  request: Request,
  userId: UserId,
  pathname: string
): Promise<Response> => {
  const directoryDeps = {
    services: deps.services,
    workspaces: deps.workspaces,
  };
  if (pathname === "/api/directory/probe" && request.method === "POST") {
    const decoded = decodeUrlBody(await request.json());
    if (decoded._tag === "Failure") {
      return json({ error: "Malformed probe request." }, 400);
    }
    return json(await probeUrl(directoryDeps, decoded.success.url));
  }
  if (pathname === "/api/directory" && request.method === "POST") {
    const decoded = decodeUrlBody(await request.json());
    if (decoded._tag === "Failure") {
      return json({ error: "Malformed directory request." }, 400);
    }
    const outcome = await addToDirectory(
      directoryDeps,
      userId,
      decoded.success.url
    );
    return json(outcome, outcome.kind === "added" ? 200 : 422);
  }
  if (pathname.startsWith("/api/directory/") && request.method === "DELETE") {
    const id = pathname.slice("/api/directory/".length);
    const removed = await removeFromDirectory(directoryDeps, userId, id);
    return json({ removed }, removed ? 200 : 404);
  }
  if (pathname === "/api/directory") {
    return json({ entries: await deps.services.store.directory.list(userId) });
  }
  return json({ error: "Not found." }, 404);
};

/** The digest, reminders and scheduled runs: a person's, never an agent token's. */
const handleScheduling = async (
  deps: RouterDeps,
  request: Request,
  userId: UserId,
  pathname: string
): Promise<Response | null> => {
  if (pathname === "/api/digest") {
    return await handleDigest(deps.services.store, request, userId);
  }
  // "Send a test now": the same unattended turn the ticker runs at the hour,
  // delivered the same way, so a person can see the digest land before the
  // hour comes round. Busy is a report too, not an error.
  if (pathname === "/api/digest/test" && request.method === "POST") {
    const report = await runScheduledFor(
      deps.jobs,
      userId,
      digestJob(deps.oracleUrl)
    );
    return json({
      outcome: report.outcome,
      reason: report.reason,
      spentUsdMicros: report.spentUsdMicros,
      summary: report.summary,
    });
  }
  return await handleSchedules(deps.services.store, request, userId, pathname);
};

const oauthDeps = (deps: RouterDeps) => ({
  appOrigin: deps.environment.appOrigin,
  store: deps.services.store,
});

/**
 * Who is calling: a person with a Privy token, an agent with a legacy `fgy_`
 * secret the person minted, or an agent with an `fga_` access token a
 * grant issued. Both agent kinds reach the same short list of routes; the
 * grant is further held to the scopes the person left on.
 */
const callerOf = async (
  deps: RouterDeps,
  request: Request,
  pathname: string
): Promise<{ readonly caller: TaskCaller } | Response> => {
  const token = bearerFromRequest(request);
  if (token === null) {
    return json(UNAUTHORIZED, 401);
  }
  // An outside agent reaches tasks and the wallet's signing endpoint and
  // nothing else; a token cannot approve, raise a cap, add a payee or change
  // the mandate, however it asks.
  if (looksLikeAgentSecret(token)) {
    const agent = await resolveAgentSecret(
      deps.services.store,
      token,
      Date.now()
    );
    if (agent === null) {
      return json(UNAUTHORIZED, 401);
    }
    if (!agentMayCall(pathname, request.method)) {
      return json({ error: "An agent token cannot do this." }, 403);
    }
    return {
      caller: {
        agentTokenId: agent.token.id,
        grantId: null,
        scopes: null,
        userId: agent.userId,
      },
    };
  }
  if (looksLikeAccessToken(token)) {
    const resolved = await resolveAccessToken(
      deps.services.store,
      token,
      Date.now()
    );
    if (resolved === null) {
      return json(UNAUTHORIZED, 401);
    }
    if (!agentMayCall(pathname, request.method)) {
      return json({ error: "An agent token cannot do this." }, 403);
    }
    const scopes = new Set(resolved.grant.scopes);
    const needed = requiredScope(pathname, request.method);
    if (needed !== null && !scopes.has(needed)) {
      return await trackAgentRequest(
        deps.services,
        {
          agentTokenId: null,
          grantId: resolved.grant.id,
          scopes,
          userId: resolved.userId,
        },
        needed === "pay" ? "pay" : "task",
        needed === "pay" ? "wallet.pay" : "services.run",
        "POST",
        async () => await Promise.resolve(insufficientScope(needed))
      );
    }
    return {
      caller: {
        agentTokenId: null,
        grantId: resolved.grant.id,
        scopes,
        userId: resolved.userId,
      },
    };
  }
  const person = await authenticate(deps.services, token);
  if (person === null) {
    return json(UNAUTHORIZED, 401);
  }
  // Fire-and-forget, once per user. Nothing here waits on Privy.
  deps.grants.note(person, token);
  return {
    caller: { agentTokenId: null, grantId: null, scopes: null, userId: person },
  };
};

/**
 * `/mcp` and `/api/mcp`, one handler. A 401 here says where the resource
 * metadata is, which is how an MCP client finds the authorization server.
 */
const handleMcpRoute = async (
  deps: RouterDeps,
  request: Request,
  pathname: string
): Promise<Response> => {
  const resolved = await callerOf(deps, request, pathname);
  if (resolved instanceof Response) {
    return resolved.status === 401
      ? unauthorizedMcp(
          deps.environment.appOrigin,
          bearerFromRequest(request) !== null
        )
      : resolved;
  }
  const workspace = await deps.workspaces.hydrate(resolved.caller.userId);
  return await handleMcp(
    deps.services,
    workspace.session,
    resolved.caller,
    request
  );
};

const TASK_EVENTS = /^\/api\/tasks\/(?<id>[^/]+)\/events$/u;
const TASK_ONE = /^\/api\/tasks\/(?<id>[^/]+)$/u;

/** Tasks and the wallet's signing endpoint: the routes an agent token may reach. */
const handleTasks = async (
  deps: RouterDeps,
  request: Request,
  workspace: Awaited<ReturnType<Workspaces["hydrate"]>>,
  caller: TaskCaller,
  pathname: string
): Promise<Response | null> => {
  const taskDeps: TaskDeps = {
    budget: deps.budget,
    interactions: deps.interactions,
    notices: deps.notices,
    oracleUrl: deps.oracleUrl,
    runs: deps.runs,
    services: deps.services,
    tasksUrl: `${deps.environment.appOrigin}${TASKS_PATH}`,
    unlocks: deps.unlocks,
    workspaces: deps.workspaces,
  };
  if (pathname === "/api/services" || pathname.startsWith("/api/services/")) {
    return await handleServices(
      deps.services,
      workspace.session,
      caller,
      request
    );
  }
  const { userId } = caller;
  if (pathname === TASKS_PATH && request.method === "POST") {
    return await handleTaskPost(taskDeps, request, workspace, caller);
  }
  if (pathname === TASKS_PATH && request.method === "GET") {
    return await trackAgentRequest(
      deps.services,
      caller,
      "task",
      "tasks.list",
      "GET",
      async () =>
        await handleTaskList(
          taskDeps,
          workspace,
          userId,
          new URL(request.url).searchParams.get("idempotencyKey")
        )
    );
  }
  const events = TASK_EVENTS.exec(pathname)?.groups?.["id"];
  if (events !== undefined && request.method === "GET") {
    return await trackAgentInvocation(
      deps.services,
      caller,
      "task",
      "tasks.events",
      async (invocation) => {
        const response = await handleTaskEvents(
          taskDeps,
          workspace,
          userId,
          events
        );
        invocation.outcome = response.ok ? "ok" : "error";
        invocation.taskId = response.ok && TaskId.is(events) ? events : null;
        return response;
      }
    );
  }
  const one = TASK_ONE.exec(pathname)?.groups?.["id"];
  if (one !== undefined && request.method === "GET") {
    return await trackAgentRequest(
      deps.services,
      caller,
      "task",
      "tasks.get",
      "GET",
      async () => await handleTaskGet(taskDeps, workspace, userId, one)
    );
  }
  if (pathname === "/api/wallet/pay" && request.method === "POST") {
    return await handleWalletPay(taskDeps, request, workspace, caller);
  }
  return null;
};

/** The tokens a person hands to outside agents: list, mint, revoke. */
const handleAgents = async (
  deps: RouterDeps,
  request: Request,
  userId: UserId,
  pathname: string
): Promise<Response | null> => {
  // The person granted the agent a signature in the browser; read it now
  // rather than on the next reload. Nothing waits on Privy here either.
  if (pathname === "/api/agent-signer/refresh" && request.method === "POST") {
    const token = bearerFromRequest(request);
    if (token === null) {
      return json(UNAUTHORIZED, 401);
    }
    deps.grants.refresh(userId, token);
    return json({ asked: true }, 202);
  }
  if (pathname === "/api/agents" && request.method === "GET") {
    const [agents, grants] = await Promise.all([
      deps.services.store.agents.list(userId),
      deps.services.store.oauth.grants.list(userId),
    ]);
    return json({ agents, grants });
  }
  if (pathname === "/api/agents" && request.method === "POST") {
    const decoded = decodeAgentBody(await request.json().catch(() => null));
    if (decoded._tag === "Failure") {
      return json({ error: 'Send {"label": "Hermes"}.' }, 400);
    }
    const minted = await mintAgentToken(
      deps.services.store,
      userId,
      decoded.success.label,
      Date.now()
    );
    // The secret, shown this once and in its own field; the skill beside it
    // carries the person's server and no token, so it can be pasted anywhere.
    return json(
      {
        secret: minted.secret,
        skill: skillText({ url: deps.environment.appOrigin }),
        token: minted.token,
      },
      201
    );
  }
  if (pathname.startsWith("/api/agents/") && request.method === "GET") {
    const decoded = Schema.decodeUnknownResult(AgentConnectionId)(
      pathname.slice("/api/agents/".length)
    );
    if (decoded._tag === "Failure") {
      return json({ error: "No such agent." }, 404);
    }
    const detail = await agentDetail(
      deps.services.store,
      userId,
      decoded.success
    );
    return detail === null
      ? json({ error: "No such agent." }, 404)
      : json(detail);
  }
  // Disconnect, by id prefix: a legacy token or an OAuth grant, one button.
  if (pathname.startsWith("/api/agents/") && request.method === "DELETE") {
    const id = pathname.slice("/api/agents/".length);
    if (AgentTokenId.is(id)) {
      await deps.services.store.agents.revoke(userId, id);
      return json({ revoked: true });
    }
    if (OAuthGrantId.is(id)) {
      const revoked = await revokeGrant(
        deps.services.store,
        userId,
        id,
        Date.now()
      );
      return json({ revoked }, revoked ? 200 : 404);
    }
    return json({ revoked: false }, 404);
  }
  return null;
};

/** The web chat: a turn, a stop, and the AI SDK's resume. */
const handleChatRoutes = async (
  deps: RouterDeps,
  request: Request,
  workspace: Awaited<ReturnType<Workspaces["hydrate"]>>,
  pathname: string
): Promise<Response | null> => {
  const sessionId = workspace.session.id;
  if (pathname === "/api/chat" && request.method === "POST") {
    return await handleChatPost(deps, request, workspace, workspace.userId);
  }

  if (pathname === "/api/chat/stop" && request.method === "POST") {
    const stopped = deps.runs.abort(sessionId);
    await deps.services.purchases.cancelAll(
      workspace.userId,
      workspace.browser
    );
    return json({ stopped });
  }

  // The authenticated owner and requested conversation must both match.
  if (/^\/api\/chat\/[^/]+\/stream$/u.test(pathname)) {
    const active = deps.runs.get(sessionId);
    const activeRecord =
      active === null
        ? null
        : await deps.services.store.history.get(workspace.userId, active.id);
    const requested = pathname.split("/").at(3);
    const replay =
      activeRecord?.kind === "run" && activeRecord.conversationId === requested
        ? (active?.replay() ?? null)
        : null;
    // 204 rather than an empty 200: `useChat({resume:true})` reads "nothing to
    // resume" from the status, and an empty body would look like a stream that
    // ended the instant it opened.
    if (replay === null) {
      return new Response(null, { status: 204 });
    }
    return new Response(replay.pipeThrough(new TextEncoderStream()), {
      headers: { "content-type": "text/event-stream" },
    });
  }
  return null;
};

const browserViewer = async (
  workspace: Awaited<ReturnType<Workspaces["hydrate"]>>,
  caller: TaskCaller
): Promise<Response> => {
  if (caller.agentTokenId !== null || caller.grantId !== null) {
    return json({ error: "Only the browser owner may open its viewer." }, 403);
  }
  const url = (await workspace.browser.viewer?.()) ?? null;
  return Response.json(
    { v: 1, url },
    {
      headers: {
        "cache-control": "no-store",
        "referrer-policy": "no-referrer",
      },
    }
  );
};

/**
 * What a person has granted: tokens to outside agents, and the policy their own
 * agent signs under.
 *
 * `userId` is the authenticated person and is the only thing deciding whose
 * anything is touched. Nothing in either request body names a policy or a
 * person, and nothing here should ever be changed so that it does.
 */
const handleGranted = async (
  deps: RouterDeps,
  request: Request,
  userId: UserId,
  pathname: string
): Promise<Response | null> => {
  const agents = await handleAgents(deps, request, userId, pathname);
  if (agents !== null) {
    return agents;
  }
  return await handlePolicyRoutes(
    {
      appId: deps.services.environment.privyAppId,
      appSecret: deps.services.environment.privyAppSecret,
      pins: deps.services.environment.personPolicyPins,
      policies: deps.policies ?? null,
    },
    request,
    userId,
    pathname
  );
};

const handleApi = async (
  deps: RouterDeps,
  request: Request,
  pathname: string
): Promise<Response | null> => {
  if (!pathname.startsWith("/api/")) {
    return null;
  }

  // Every `/api` route is a route into somebody's workspace — their mandate,
  // their receipts, their agent. There is no anonymous read here, so the check
  // is at the top of the group rather than repeated per route, where the next
  // route added would be the one that forgot it.
  const resolved = await callerOf(deps, request, pathname);
  if (resolved instanceof Response) {
    return resolved;
  }
  const { caller } = resolved;
  const { userId } = caller;
  const workspace = await deps.workspaces.hydrate(userId);
  const sessionId = workspace.session.id;

  if (pathname === "/api/browser/viewer" && request.method === "GET") {
    return await browserViewer(workspace, caller);
  }

  const trade = await handleTrades(deps.services, workspace, caller, request);
  if (trade !== null) {
    return trade;
  }

  const purchase = await handlePurchases(
    deps.services,
    deps.runs,
    workspace,
    caller,
    request
  );
  if (purchase !== null) {
    return purchase;
  }

  const tasks = await handleTasks(deps, request, workspace, caller, pathname);
  if (tasks !== null) {
    return tasks;
  }
  // Both are "what this person has granted": the tokens they hand to outside
  // agents, and the policy their own agent signs under. Dispatched together so
  // adding the second did not add a branch to a function already at its limit.
  const granted = await handleGranted(deps, request, userId, pathname);
  if (granted !== null) {
    return granted;
  }
  // The consent decision and the client's name for the page. A person's
  // Privy token only: `agentMayCall` never lists `/api/oauth`, so no agent,
  // legacy or granted, can consent on the person's behalf.
  const oauth = await handleOAuthApi(
    oauthDeps(deps),
    request,
    userId,
    pathname
  );
  if (oauth !== null) {
    return oauth;
  }

  const history = await handleHistory(deps.services.store, request, userId);
  if (history !== null) {
    return history;
  }

  const chat = await handleChatRoutes(deps, request, workspace, pathname);
  if (chat !== null) {
    return chat;
  }

  const scheduling = await handleScheduling(deps, request, userId, pathname);
  if (scheduling !== null) {
    return scheduling;
  }

  if (pathname === "/api/telegram") {
    return await handleTelegram(deps, request, userId);
  }

  if (pathname.startsWith("/api/directory")) {
    return await handleDirectory(deps, request, userId, pathname);
  }

  if (pathname === "/api/me" && request.method === "DELETE") {
    // Their run stops, their browser closes, their profile and their records
    // go. The ledger's spend rows stay: money that moved is not a preference.
    deps.runs.abort(sessionId);
    await deps.services.trades.stopAndRevoke(userId);
    await deps.services.launches.cancelAll(userId);
    await deps.services.purchases.cancelAll(userId, workspace.browser);
    await deps.workspaces.forget(userId);
    await deps.services.store.forget(userId);
    return json({ deleted: true });
  }

  if (pathname === "/api/receipts") {
    return json({ receipts: await workspace.session.recentReceipts() });
  }

  if (pathname === "/api/wallet") {
    return json(await workspace.session.walletSummary());
  }

  return json({ error: "Not found." }, 404);
};

interface ServiceCard {
  /**
   * Where an outside agent gets the tool that buys these. Not an x402 field;
   * it sits beside `facilitator` and `hcsTopic` for the same reason those do,
   * which is that an agent that finds this card should be able to find
   * everything it needs from here without being told.
   */
  readonly agentDoor: {
    readonly install: string;
    readonly url: string;
  };
  readonly description: string;
  readonly facilitator: string;
  readonly hcsTopic: string | null;
  readonly name: string;
  readonly resources: readonly {
    readonly asset: string;
    readonly description: string;
    readonly method: "GET";
    readonly network: string;
    readonly payTo: string;
    readonly price: string;
    readonly scheme: "exact";
    readonly url: string;
  }[];
  readonly source: string;
  readonly version: 1;
}

const serviceCard = (deps: RouterDeps): ServiceCard => {
  const { environment } = deps;
  const [requirement] = deps.services.oracle.challenge({
    description: "Cross-protocol USDC lending snapshot, cheapest borrow first.",
    units: PRICE_TINYBARS,
    url: deps.oracleUrl,
  }).accepts;
  const doorUrl = `${environment.appOrigin}/froggy-mcp.js`;
  return {
    agentDoor: {
      install: `curl -fsSL ${doorUrl} -o froggy-mcp.js && claude mcp add froggy -e FROGGY_HEDERA_ACCOUNT_ID=0.0.x -e FROGGY_HEDERA_PRIVATE_KEY=0x... -- node ./froggy-mcp.js`,
      url: doorUrl,
    },
    description: `A live cross-protocol lending snapshot from The Graph, sold per query over x402 on ${environment.hederaNetwork === "hedera:mainnet" ? "Hedera mainnet" : "Hedera testnet"} and settled through a facilitator. Every settlement leaves a public note on a Hedera Consensus Service topic.`,
    facilitator: environment.hederaFacilitatorUrl,
    hcsTopic:
      environment.hederaHcsTopicId === "" ? null : environment.hederaHcsTopicId,
    name: "Froggy lending oracle",
    resources:
      requirement === undefined
        ? []
        : [
            {
              asset: requirement.asset,
              description:
                "GET with ?symbol=USDC. Answers 402 with an x402 v2 challenge; a paid request returns the snapshot and the settlement in the payment-response header.",
              method: "GET",
              network: requirement.network,
              payTo: requirement.payTo,
              price: requirement.amount,
              scheme: "exact",
              url: deps.oracleUrl,
            },
            {
              asset: requirement.asset,
              description:
                "The Pond Observatory report: market rates, liquidity and index provenance, as a page rather than a payload. Same challenge, same settlement.",
              method: "GET",
              network: requirement.network,
              payTo: requirement.payTo,
              price: requirement.amount,
              scheme: "exact",
              url: new URL(
                X402_DEMO_REPORT_PATH,
                environment.appOrigin
              ).toString(),
            },
          ],
    source: "https://github.com/grmkris/Froggy-ETHOnline2026",
    version: 1,
  };
};

/**
 * The x402 discovery document, in the shape the specification gives it.
 *
 * `/.well-known/x402.json` is our own card and carries fields x402 has no
 * opinion about — a price, a facilitator, a topic, now a door. This is the
 * other thing: the standard listing, so a directory or another agent can read
 * us without knowing anything about Froggy. Both are built from the same
 * challenge as the 402 itself, so none of the three can drift apart.
 *
 * The identifier is HCS-14, computed from the facts printed beside it. It is
 * a claim about a derivation a reader can repeat, not a registration.
 */
const discoveryDocument = (deps: RouterDeps) => {
  const card = serviceCard(deps);
  const { environment } = deps;
  const facts = {
    name: "froggy-lending-oracle",
    nativeId: caip10(environment.hederaNetwork, environment.hederaPayTo),
    protocol: "x402",
    registry: "froggy",
    skills: [],
    version: "1.0.0",
  };
  const accepts = card.resources.map((resource) => ({
    amount: resource.price,
    asset: resource.asset,
    network: resource.network,
    payTo: resource.payTo,
    scheme: resource.scheme,
  }));
  return {
    agent: { facts, id: universalAgentId(facts), standard: "HCS-14" },
    items: card.resources.map((resource, index) => ({
      accepts: accepts[index] === undefined ? [] : [accepts[index]],
      lastUpdated: new Date().toISOString(),
      resource: resource.url,
      type: "http",
      x402Version: 2,
    })),
    pagination: {
      limit: card.resources.length,
      offset: 0,
      total: card.resources.length,
    },
    x402Version: 2,
  };
};

const handleInstallation = async (
  origin: string,
  request: Request,
  pathname: string
): Promise<Response | null> => {
  // Public installation documents contain the configured origin, never secrets.
  if (pathname === "/froggy-cli.js" && request.method === "GET") {
    return await serveCli();
  }
  if (pathname === "/froggy-mcp.js" && request.method === "GET") {
    return await serveAgentDoor();
  }
  if (
    ["/llm.md", "/skill.md", "/froggy/SKILL.md"].includes(pathname) &&
    request.method === "GET"
  ) {
    const render = pathname === "/llm.md" ? llmText : skillText;
    return new Response(render({ url: origin }), {
      headers: { "content-type": "text/markdown; charset=utf-8" },
    });
  }

  return null;
};

export const handleRequest = async (
  deps: RouterDeps,
  request: Request
): Promise<Response> => {
  const { pathname } = new URL(request.url);

  if (pathname === "/health") {
    return json({
      /** Whether people get Hedera accounts of their own, or pay from the host pocket. */
      hederaAccounts: deps.environment.hederaAccounts ? "own" : "host",
      modes: deps.environment.modes,
      trading: {
        enso: deps.environment.trading.ensoMode,
        jupiter: deps.environment.trading.jupiterMode,
        pons: deps.environment.trading.ponsMode,
        pump: deps.environment.trading.pumpMode,
        uniswap: deps.environment.trading.uniswapMode,
      },
      runtime: "bun",
      status: "ok",
    });
  }

  const demo = await handleX402Demo(deps.services, request);
  if (demo !== null) {
    return demo;
  }

  // Outside the `/api` group on purpose: Telegram authenticates with its
  // secret header, which the adapter checks, not with a Privy token.
  if (pathname === "/telegram/webhook" && request.method === "POST") {
    return await deps.pager.webhook(request);
  }

  // The shared Chrome opens this with no token: the link is the credential,
  // it works once, and it expires. See unlock.ts.
  if (pathname.startsWith("/unlocked/") && request.method === "GET") {
    return renderUnlock(deps.unlocks.take(pathname.slice("/unlocked/".length)));
  }

  const installation = await handleInstallation(
    deps.environment.appOrigin,
    request,
    pathname
  );
  if (installation !== null) {
    return installation;
  }

  // The service card: what this server sells, how it is paid, where the
  // trail is. Plain JSON anyone can curl before they pay.
  if (pathname === "/discovery/resources") {
    return Response.json(discoveryDocument(deps), {
      headers: { "cache-control": "public, max-age=300" },
    });
  }
  if (pathname === "/.well-known/x402.json") {
    return Response.json(serviceCard(deps), {
      headers: { "cache-control": "public, max-age=300" },
    });
  }

  if (pathname === ORACLE_PATH) {
    return await handleOracleRequest(
      {
        gate: deps.services.oracle,
        graph: deps.services.graph,
        hcs: deps.services.hcs,
        publicUrl: deps.oracleUrl,
        store: deps.services.store,
      },
      request
    );
  }

  // What a sale bought, for the buyer that holds its id. No token: the id
  // is unguessable and names nothing about who paid.
  if (pathname.startsWith(SALES_PATH) && request.method === "GET") {
    return await handleSaleLookup(
      { store: deps.services.store },
      pathname.slice(SALES_PATH.length)
    );
  }

  // The authorization server's public endpoints: metadata, registration,
  // token and revocation. Open by design (an MCP client has no credential
  // yet), CORS `*` on these and nothing else.
  const oauth = await handleOAuth(oauthDeps(deps), request, pathname);
  if (oauth !== null) {
    return oauth;
  }

  // The MCP endpoint, at its public path and the older `/api` one.
  if (pathname === "/mcp" || pathname === "/api/mcp") {
    return await handleMcpRoute(deps, request, pathname);
  }

  const api = await handleApi(deps, request, pathname);
  if (api !== null) {
    return api;
  }

  return await serveStatic(deps.environment.staticDirectory, pathname);
};
