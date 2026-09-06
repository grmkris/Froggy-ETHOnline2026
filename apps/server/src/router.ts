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

import { DigestSchedule } from "@froggy/domain";
import type { DirectoryEntry, UserId } from "@froggy/domain";
import type { ProbeSummary } from "@froggy/payments";
import { Schema } from "effect";

import { authenticate, bearerFromRequest } from "./auth";
import { ModelBudgetExhaustedError } from "./budget";
import type { ModelBudget } from "./budget";
import { handleChat } from "./chat";
import type { ChatRequest } from "./chat";
import { addToDirectory, probeUrl, removeFromDirectory } from "./directory";
import type { AddOutcome } from "./directory";
import type { Environment } from "./environment";
import type { AgentGrants } from "./grants";
import { handleOracleRequest } from "./oracle-route";
import type { ChatRunRegistry } from "./runs";
import type { Services } from "./services";
import type { WorkspaceSession } from "./session";
import type { TelegramPager } from "./telegram/pager";
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
  | Awaited<ReturnType<WorkspaceSession["walletSummary"]>>;

const json = (body: ResponseBody, status = 200): Response =>
  Response.json(body, { headers: { "cache-control": "no-store" }, status });

export interface RouterDeps {
  readonly budget: ModelBudget;
  readonly environment: Environment;
  readonly grants: AgentGrants;
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
  const token = bearerFromRequest(request);
  const userId = await authenticate(deps.services, token);
  if (userId === null || token === null) {
    return json(UNAUTHORIZED, 401);
  }
  // Fire-and-forget, once per user. Nothing here waits on Privy.
  deps.grants.note(userId, token);
  const workspace = await deps.workspaces.hydrate(userId);
  const sessionId = workspace.session.id;

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

  if (pathname === ORACLE_PATH) {
    return await handleOracleRequest(
      {
        gate: deps.services.oracle,
        graph: deps.services.graph,
        hcs: deps.services.hcs,
        publicUrl: deps.oracleUrl,
      },
      request
    );
  }

  const api = await handleApi(deps, request, pathname);
  if (api !== null) {
    return api;
  }

  return await serveStatic(deps.environment.staticDirectory, pathname);
};
