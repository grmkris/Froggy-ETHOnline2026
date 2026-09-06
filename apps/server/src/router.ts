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

import { AgentTokenId, DigestSchedule } from "@froggy/domain";
import type { AgentToken, DirectoryEntry, UserId } from "@froggy/domain";
import type { ProbeSummary } from "@froggy/payments";
import { Schema } from "effect";

import {
  agentMayCall,
  looksLikeAgentSecret,
  mintAgentToken,
  resolveAgentSecret,
} from "./agents";
import { authenticate, bearerFromRequest } from "./auth";
import { ModelBudgetExhaustedError } from "./budget";
import type { ModelBudget } from "./budget";
import { handleChat } from "./chat";
import type { ChatRequest } from "./chat";
import { serveCli } from "./cli-route";
import { addToDirectory, probeUrl, removeFromDirectory } from "./directory";
import type { AddOutcome } from "./directory";
import type { Environment } from "./environment";
import type { AgentGrants } from "./grants";
import type { InteractionRegistry } from "./interactions";
import {
  handleOracleRequest,
  handleSaleLookup,
  SALES_PATH,
} from "./oracle-route";
import type { ChatRunRegistry } from "./runs";
import type { Services } from "./services";
import type { WorkspaceSession } from "./session";
import { GENERIC_SKILL, skillText } from "./skill";
import {
  handleTaskEvents,
  handleTaskGet,
  handleTaskList,
  handleTaskPost,
  handleWalletPay,
} from "./tasks";
import type { TaskCaller, TaskDeps } from "./tasks";
import type { TelegramPager } from "./telegram/pager";
import { renderUnlock } from "./unlock";
import type { UnlockTokens } from "./unlock";
import type { Workspaces } from "./workspaces";

export const ORACLE_PATH = "/oracle/snapshot";

/**
 * What `POST /api/chat` accepts.
 *
 * `messages` stays `Unknown` on purpose: the shape is the AI SDK's `UIMessage`
 * union, which is large, versioned by the SDK, and validated by the SDK's own
 * conversion on the next line. Re-declaring it here would be a second copy of
 * someone else's type that only ever drifts.
 */
const ChatBody = Schema.Struct({ messages: Schema.Array(Schema.Unknown) });
const decodeChatBody = Schema.decodeUnknownResult(ChatBody);
const AgentBody = Schema.Struct({ label: Schema.String });
const decodeAgentBody = Schema.decodeUnknownResult(AgentBody);

const TASKS_PATH = "/api/tasks";
const decodeDigest = Schema.decodeUnknownResult(DigestSchedule);

/** Every JSON response this server sends. Named so the shapes stay enumerable. */
type ResponseBody =
  | { readonly error: string }
  | {
      readonly modes: Environment["modes"];
      readonly runtime: string;
      readonly status: string;
    }
  | { readonly deleted: true }
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
  | DigestSchedule
  | { readonly frozen: true }
  | { readonly receipts: WorkspaceSession["history"] }
  | { readonly stopped: boolean }
  | { readonly agents: readonly AgentToken[] }
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
  readonly oracleUrl: string;
  readonly pager: TelegramPager;
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

/** A turn from the web chat. Refused while frozen; started otherwise. */
const handleChatPost = async (
  deps: RouterDeps,
  request: Request,
  workspace: Awaited<ReturnType<Workspaces["hydrate"]>>,
  userId: UserId
): Promise<Response> => {
  const sessionId = workspace.session.id;
  // A frozen wallet does not start turns. The policy engine would refuse
  // every spend anyway; refusing the turn is what stops the agent burning
  // model budget narrating refusals against a wallet it cannot use.
  if (workspace.session.currentMandate.frozen) {
    return json({ frozen: true }, 423);
  }
  const decoded = decodeChatBody(await request.json());
  if (decoded._tag === "Failure") {
    return json({ error: "Malformed chat request." }, 400);
  }
  deps.workspaces.touch(userId);
  try {
    return await handleChat(
      {
        browser: workspace.browser,
        budget: deps.budget,
        oracleUrl: deps.oracleUrl,
        runs: deps.runs,
        services: deps.services,
        session: workspace.session,
        unlocks: deps.unlocks,
        workspaces: deps.workspaces,
      },
      {
        // SAFETY: the envelope is decoded above; the elements are the AI SDK's
        // `UIMessage` union, which `convertToModelMessages` validates on the
        // very next hop. Restating that union here would be a second copy of a
        // type the SDK owns and versions.
        messages: decoded.success
          .messages as unknown as ChatRequest["messages"],
        sessionId,
      }
    );
  } catch (error) {
    // The day's turns are spent. Said as a status the client can read and a
    // sentence the person can, before any model call was made.
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

/** The digest schedule: read it, or replace it. */
const handleDigest = async (
  deps: RouterDeps,
  request: Request,
  userId: UserId
): Promise<Response> => {
  if (request.method !== "PUT") {
    return json(await deps.services.store.digest.load(userId));
  }
  const decoded = decodeDigest(await request.json());
  if (decoded._tag === "Failure") {
    return json({ error: "Malformed digest schedule." }, 400);
  }
  await deps.services.store.digest.save(userId, decoded.success);
  return json(decoded.success);
};

/** Who is calling: a person with a Privy token, or an agent with a token the person minted. */
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
    return { caller: { agentTokenId: agent.token.id, userId: agent.userId } };
  }
  const person = await authenticate(deps.services, token);
  if (person === null) {
    return json(UNAUTHORIZED, 401);
  }
  // Fire-and-forget, once per user. Nothing here waits on Privy.
  deps.grants.note(person, token);
  return { caller: { agentTokenId: null, userId: person } };
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
    oracleUrl: deps.oracleUrl,
    runs: deps.runs,
    services: deps.services,
    tasksUrl: `${deps.environment.appOrigin}${TASKS_PATH}`,
    unlocks: deps.unlocks,
    workspaces: deps.workspaces,
  };
  const { userId } = caller;
  if (pathname === TASKS_PATH && request.method === "POST") {
    return await handleTaskPost(taskDeps, request, workspace, caller);
  }
  if (pathname === TASKS_PATH && request.method === "GET") {
    return await handleTaskList(taskDeps, workspace, userId);
  }
  const events = TASK_EVENTS.exec(pathname)?.groups?.["id"];
  if (events !== undefined && request.method === "GET") {
    return await handleTaskEvents(taskDeps, workspace, userId, events);
  }
  const one = TASK_ONE.exec(pathname)?.groups?.["id"];
  if (one !== undefined && request.method === "GET") {
    return await handleTaskGet(taskDeps, workspace, userId, one);
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
  if (pathname === "/api/agents" && request.method === "GET") {
    return json({ agents: await deps.services.store.agents.list(userId) });
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
    // The skill with this person's server and token filled in: the one paste
    // that connects an agent. The secret is in it, and shown this once.
    return json(
      {
        secret: minted.secret,
        skill: skillText({
          token: minted.secret,
          url: deps.environment.appOrigin,
        }),
        token: minted.token,
      },
      201
    );
  }
  if (pathname.startsWith("/api/agents/") && request.method === "DELETE") {
    const id = pathname.slice("/api/agents/".length);
    if (!AgentTokenId.is(id)) {
      return json({ revoked: false }, 404);
    }
    await deps.services.store.agents.revoke(userId, id);
    return json({ revoked: true });
  }
  return null;
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

  const tasks = await handleTasks(deps, request, workspace, caller, pathname);
  if (tasks !== null) {
    return tasks;
  }
  const agents = await handleAgents(deps, request, userId, pathname);
  if (agents !== null) {
    return agents;
  }

  if (pathname === "/api/chat" && request.method === "POST") {
    return await handleChatPost(deps, request, workspace, userId);
  }

  if (pathname === "/api/chat/stop" && request.method === "POST") {
    return json({ stopped: deps.runs.abort(sessionId) });
  }

  // The AI SDK's transport resumes at `/api/chat/<chat id>/stream`. That id is
  // the client's own, generated by `useChat`, and it is deliberately not what
  // resolves the run: the caller's token is. Trusting the path would let one
  // signed-in user resume another's turn by guessing an id.
  if (/^\/api\/chat\/[^/]+\/stream$/u.test(pathname)) {
    const replay = deps.runs.get(sessionId)?.replay() ?? null;
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

  if (pathname === "/api/digest") {
    return await handleDigest(deps, request, userId);
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
    units: "5000000",
    url: deps.oracleUrl,
  }).accepts;
  return {
    description:
      "A live cross-protocol lending snapshot from The Graph, sold per query over x402 on Hedera testnet and settled through a facilitator. Every settlement leaves a public note on a Hedera Consensus Service topic.",
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
          ],
    source: "https://github.com/grmkris/agentic-wallet",
    version: 1,
  };
};

export const handleRequest = async (
  deps: RouterDeps,
  request: Request
): Promise<Response> => {
  const { pathname } = new URL(request.url);

  if (pathname === "/health") {
    return json({
      modes: deps.environment.modes,
      runtime: "bun",
      status: "ok",
    });
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

  // The CLI an outside agent curls, and the skill that tells it to. Both
  // public: they contain no secret until a person's settings fill one in.
  if (pathname === "/froggy-cli.js" && request.method === "GET") {
    return await serveCli();
  }
  if (pathname === "/froggy/SKILL.md" && request.method === "GET") {
    return new Response(GENERIC_SKILL, {
      headers: { "content-type": "text/markdown; charset=utf-8" },
    });
  }

  // The service card: what this server sells, how it is paid, where the
  // trail is. Plain JSON anyone can curl before they pay.
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

  const api = await handleApi(deps, request, pathname);
  if (api !== null) {
    return api;
  }

  return await serveStatic(deps.environment.staticDirectory, pathname);
};
