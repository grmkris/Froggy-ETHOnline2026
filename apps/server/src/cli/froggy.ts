#!/usr/bin/env node
/**
 * `froggy`: the command an outside agent runs to buy a task from Froggy.
 *
 * Built for Node 20 and Bun alike, because it runs in whatever sandbox a
 * personal agent has: Hermes' Docker terminal, a Claude Code shell, a laptop.
 * It is a real x402 client whose signer is the person's Froggy wallet: the 402
 * comes back, the wallet endpoint signs a header under the person's mandate,
 * the request is retried with it, and the task id that comes back is polled
 * until the task ends. The agent never holds a key.
 *
 * It signs in the way an MCP client does: `login` sends the person to
 * Froggy's consent page in their browser (or prints the link, with
 * `--manual`, for a sandbox with no browser) and keeps the short-lived
 * tokens that come back in `~/.config/froggy/credentials.json`, mode 600,
 * refreshing them before they expire. `FROGGY_TOKEN` still works for an
 * unattended agent with a token the person minted.
 *
 * Nothing here decides money. A refusal from the wallet is printed in the
 * wallet's words and the command exits non-zero.
 */

import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { once } from "node:events";
import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { Server } from "node:http";
import { homedir, hostname } from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import { createInterface as createPrompt } from "node:readline/promises";
import { setTimeout as sleep } from "node:timers/promises";

import { Schema } from "effect";

const Ticket = Schema.Struct({ id: Schema.String, title: Schema.String });
const Task = Schema.Struct({
  approval: Schema.Array(Ticket),
  error: Schema.NullOr(Schema.String),
  id: Schema.String,
  kind: Schema.String,
  result: Schema.NullOr(Schema.Unknown),
  saleId: Schema.NullOr(Schema.String),
  status: Schema.String,
});
type Task = typeof Task.Type;
const TaskEnvelope = Schema.Struct({ task: Task });
const Signed = Schema.Struct({ header: Schema.String });
const Refusal = Schema.Struct({ error: Schema.String });

/** What a login leaves behind. Never printed. */
const Credentials = Schema.Struct({
  accessToken: Schema.String,
  clientId: Schema.String,
  expiresAt: Schema.Finite,
  refreshToken: Schema.String,
  revocationEndpoint: Schema.String,
  tokenEndpoint: Schema.String,
  url: Schema.String,
  v: Schema.Literals([1]),
});
type Credentials = typeof Credentials.Type;
const Metadata = Schema.Struct({
  authorization_endpoint: Schema.String,
  issuer: Schema.String,
  registration_endpoint: Schema.String,
  revocation_endpoint: Schema.String,
  token_endpoint: Schema.String,
});
const Registered = Schema.Struct({ client_id: Schema.String });
const Issued = Schema.Struct({
  access_token: Schema.String,
  expires_in: Schema.Finite,
  refresh_token: Schema.String,
});
const OAuthError = Schema.Struct({
  error: Schema.String,
  error_description: Schema.optional(Schema.String),
});

const decodeTask = Schema.decodeUnknownResult(TaskEnvelope);
const decodeSigned = Schema.decodeUnknownResult(Signed);
const decodeRefusal = Schema.decodeUnknownResult(Refusal);
const decodeCredentials = Schema.decodeUnknownResult(Credentials);
const decodeMetadata = Schema.decodeUnknownResult(Metadata);
const decodeRegistered = Schema.decodeUnknownResult(Registered);
const decodeIssued = Schema.decodeUnknownResult(Issued);
const decodeOAuthError = Schema.decodeUnknownResult(OAuthError);

/** Where the bearer comes from: the environment, a login, or nowhere yet. */
type Auth =
  | { readonly kind: "none" }
  | { readonly kind: "oauth"; credentials: Credentials }
  | { readonly kind: "static"; readonly token: string };

interface Options {
  readonly auth: Auth;
  readonly json: boolean;
  readonly manual: boolean;
  readonly requestKey: string;
  readonly url: string;
  readonly wait: boolean;
}

interface Parsed {
  readonly args: readonly string[];
  readonly options: Options;
}

const POLL_MS = 3000;
const WAIT_LIMIT_MS = 15 * 60 * 1000;
const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;
/** Refresh this long before the access token would expire. */
const REFRESH_MARGIN_MS = 60 * 1000;
const ENDED = new Set(["done", "failed", "uncertain"]);
const SCOPES = "brief browse pay services";
const CREDENTIALS_PATH = path.join(
  homedir(),
  ".config",
  "froggy",
  "credentials.json"
);

const usage = `froggy — let Froggy do a paid task for you

  froggy login [--url=<froggy>] [--manual]   sign in with the person's Froggy account
  froggy logout                  revoke this sign-in and forget it
  froggy brief <SYMBOL>          a lending brief: cheapest borrow and best supply
                                 for one token across twelve standardized markets
  froggy ask "<instruction>"     a browse on the person's own Chrome, under their mandate
  froggy status <task id>        where a task is, its result and its receipts
  froggy tasks                   recent tasks
  froggy services                service catalog and prices
  froggy service <name> "<text>"   buy a service (returns a ticket)
  froggy service-status <id>      read a service result
  froggy mcp                     MCP stdio bridge for agent clients

\`login\` opens the person's browser on Froggy's consent page and listens on a
loopback port for the answer; with --manual it prints the link and asks you to
paste the code the page shows. Credentials live in ~/.config/froggy/credentials.json
(mode 600) and refresh themselves. FROGGY_URL names the server when --url is not
given; FROGGY_TOKEN, a token the person minted, overrides the sign-in entirely.
Flags: --json, --no-wait, --idempotency-key=<stable-request-id> (reuse for the
same request).

A task is paid in HBAR from the person's Froggy wallet before it runs; the
receipt and the sale id come back with the task. If the wallet refuses, the
refusal is printed in the wallet's words and nothing is charged.`;

const fail = (message: string): never => {
  console.error(message);
  process.exit(1);
};

const noop = (): void => {
  // A browser that fails to open is not an error: the link is printed too.
};

const flagValue = (flags: ReadonlySet<string>, name: string): string | null =>
  [...flags]
    .find((flag) => flag.startsWith(`${name}=`))
    ?.slice(name.length + 1) ?? null;

const trimUrl = (url: string): string => url.replace(/\/+$/u, "");

// ---------------------------------------------------------------------------
// Credentials on disk
// ---------------------------------------------------------------------------

const loadCredentials = async (): Promise<Credentials | null> => {
  let text: string;
  try {
    text = await readFile(CREDENTIALS_PATH, "utf-8");
  } catch {
    return null;
  }
  try {
    const decoded = decodeCredentials(JSON.parse(text));
    return decoded._tag === "Failure" ? null : decoded.success;
  } catch {
    return null;
  }
};

const saveCredentials = async (credentials: Credentials): Promise<void> => {
  await mkdir(path.dirname(CREDENTIALS_PATH), { mode: 0o700, recursive: true });
  await writeFile(CREDENTIALS_PATH, JSON.stringify(credentials, null, 2), {
    mode: 0o600,
  });
  // `mode` above applies only when the file is created; an existing file keeps
  // whatever it had, so set it every time.
  await chmod(CREDENTIALS_PATH, 0o600);
};

const forgetCredentials = async (): Promise<void> => {
  await rm(CREDENTIALS_PATH, { force: true });
};

const optionsFrom = async (argv: readonly string[]): Promise<Parsed> => {
  const args = argv.filter((a) => !a.startsWith("--"));
  const flags = new Set(argv.filter((a) => a.startsWith("--")));
  const stored = await loadCredentials();
  const url = trimUrl(
    flagValue(flags, "--url") ?? process.env["FROGGY_URL"] ?? stored?.url ?? ""
  );
  const token = process.env["FROGGY_TOKEN"] ?? "";
  let auth: Auth = { kind: "none" };
  if (token !== "") {
    auth = { kind: "static", token };
  } else if (stored !== null && stored.url === url) {
    auth = { credentials: stored, kind: "oauth" };
  }
  return {
    args,
    options: {
      auth,
      json: flags.has("--json"),
      manual: flags.has("--manual"),
      requestKey: flagValue(flags, "--idempotency-key") ?? crypto.randomUUID(),
      url,
      wait: !flags.has("--no-wait"),
    },
  };
};

// ---------------------------------------------------------------------------
// The token endpoint
// ---------------------------------------------------------------------------

const errorText = async (response: Response): Promise<string> => {
  const body: unknown = await response.json().catch(() => null);
  const decoded = decodeOAuthError(body);
  if (decoded._tag === "Failure") {
    return `status ${response.status}`;
  }
  const { error, error_description: description } = decoded.success;
  return description === undefined ? error : `${error}: ${description}`;
};

const postForm = async (
  endpoint: string,
  fields: Record<string, string>
): Promise<Response> =>
  await fetch(endpoint, {
    body: new URLSearchParams(fields).toString(),
    headers: { "content-type": "application/x-www-form-urlencoded" },
    method: "POST",
  });

/** A new pair from the token endpoint, or the reason there is none. */
const redeem = async (
  tokenEndpoint: string,
  fields: Record<string, string>
): Promise<typeof Issued.Type | string> => {
  const response = await postForm(tokenEndpoint, fields);
  if (!response.ok) {
    return await errorText(response);
  }
  const decoded = decodeIssued(await response.json());
  return decoded._tag === "Failure"
    ? "the token endpoint answered without tokens"
    : decoded.success;
};

/** Rotate the refresh token; null when Froggy will not, which means sign in again. */
const refreshCredentials = async (
  current: Credentials
): Promise<Credentials | null> => {
  const issued = await redeem(current.tokenEndpoint, {
    client_id: current.clientId,
    grant_type: "refresh_token",
    refresh_token: current.refreshToken,
  });
  if (!(issued instanceof Object)) {
    console.error(
      `Could not refresh the sign-in (${issued}); run: froggy login`
    );
    return null;
  }
  const next: Credentials = {
    ...current,
    accessToken: issued.access_token,
    expiresAt: Date.now() + issued.expires_in * 1000,
    refreshToken: issued.refresh_token,
  };
  await saveCredentials(next);
  return next;
};

/** The bearer for the next request, refreshed first when it is about to expire. */
const bearer = async (auth: Auth): Promise<string> => {
  if (auth.kind === "static") {
    return auth.token;
  }
  if (auth.kind === "none") {
    return fail(
      "Not signed in. Run `node froggy.mjs login --url=<froggy>` (add --manual without a browser), or set FROGGY_TOKEN."
    );
  }
  if (auth.credentials.expiresAt - REFRESH_MARGIN_MS <= Date.now()) {
    const refreshed = await refreshCredentials(auth.credentials);
    if (refreshed !== null) {
      auth.credentials = refreshed;
    }
  }
  return auth.credentials.accessToken;
};

const send = async (
  options: Options,
  route: string,
  init: Omit<RequestInit, "headers"> & {
    readonly headers?: Record<string, string>;
  },
  token: string
): Promise<Response> =>
  await fetch(`${options.url}${route}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...init.headers,
    },
  });

/** A request under the current bearer; a 401 on a sign-in earns one refresh and one retry. */
const api = async (
  options: Options,
  route: string,
  init: Omit<RequestInit, "headers"> & {
    readonly headers?: Record<string, string>;
  } = {}
): Promise<Response> => {
  const first = await send(options, route, init, await bearer(options.auth));
  if (first.status !== 401 || options.auth.kind !== "oauth") {
    return first;
  }
  const refreshed = await refreshCredentials(options.auth.credentials);
  if (refreshed === null) {
    return first;
  }
  options.auth.credentials = refreshed;
  return await send(options, route, init, refreshed.accessToken);
};

// ---------------------------------------------------------------------------
// login and logout
// ---------------------------------------------------------------------------

const discover = async (url: string): Promise<typeof Metadata.Type> => {
  const response = await fetch(`${url}/.well-known/oauth-authorization-server`);
  if (!response.ok) {
    return fail(
      `${url} does not describe an authorization server (${response.status}). Is that the Froggy URL?`
    );
  }
  const decoded = decodeMetadata(await response.json());
  if (decoded._tag === "Failure") {
    return fail(`${url} answered metadata this CLI cannot read.`);
  }
  return decoded.success;
};

/** The stored client for this server, or a fresh registration. */
const clientFor = async (
  url: string,
  metadata: typeof Metadata.Type,
  stored: Credentials | null
): Promise<string> => {
  if (stored !== null && stored.url === url) {
    return stored.clientId;
  }
  const response = await fetch(metadata.registration_endpoint, {
    body: JSON.stringify({
      client_name: `froggy CLI on ${hostname()}`,
      redirect_uris: ["http://127.0.0.1/callback", `${url}/oauth/manual`],
      token_endpoint_auth_method: "none",
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  if (!response.ok) {
    return fail(
      `Froggy refused to register this CLI: ${await errorText(response)}`
    );
  }
  const decoded = decodeRegistered(await response.json());
  if (decoded._tag === "Failure") {
    return fail("Froggy registered the CLI without a client id.");
  }
  return decoded.success.client_id;
};

const openBrowser = (url: string): void => {
  let command = "xdg-open";
  let args = [url];
  if (process.platform === "darwin") {
    command = "open";
  } else if (process.platform === "win32") {
    command = "cmd";
    args = ["/c", "start", "", url];
  }
  try {
    const child = spawn(command, args, { detached: true, stdio: "ignore" });
    child.on("error", noop);
    child.unref();
  } catch {
    // No browser here; the link is printed either way.
  }
};

interface Callback {
  readonly redirectUri: string;
  readonly server: Server;
  readonly waitForCode: () => Promise<string>;
}

/** What one redirect earned: the code, or why not, and the sentence the tab shows. */
interface CallbackOutcome {
  readonly code: string | null;
  readonly error: string;
  readonly page: string;
}

const judgeCallback = (
  url: URL,
  expectedState: string,
  issuer: string
): CallbackOutcome => {
  if (url.searchParams.get("state") !== expectedState) {
    return {
      code: null,
      error: "The callback carried another state.",
      page: "This sign-in did not start here. Close this window.",
    };
  }
  if (url.searchParams.get("iss") !== issuer) {
    return {
      code: null,
      error: "The callback was not from the server you signed in to.",
      page: "This answer came from somewhere else. Close this window.",
    };
  }
  const code = url.searchParams.get("code");
  if (code === null) {
    const error = url.searchParams.get("error") ?? "without a code";
    return {
      code: null,
      error: `Froggy answered ${error}.`,
      page: "Froggy did not sign you in. Close this window.",
    };
  }
  return {
    code,
    error: "",
    page: "Signed in to Froggy. You can close this window.",
  };
};

/** One loopback listener on a free port, answering the single redirect it is for. */
const listenForCallback = async (
  expectedState: string,
  issuer: string
): Promise<Callback> => {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (address === null || !(address instanceof Object)) {
    return fail("Could not open a loopback port for the sign-in.");
  }
  // The request handler judges the redirect and raises one of two events on
  // the server; `once` below turns them into the code or a rejection. Node
  // 20 has no `Promise.withResolvers`, and this needs no promise of its own.
  server.on("request", (request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (url.pathname !== "/callback") {
      response.statusCode = 404;
      response.end();
      return;
    }
    response.setHeader("content-type", "text/html; charset=utf-8");
    const outcome = judgeCallback(url, expectedState, issuer);
    response.end(`<p>${outcome.page}</p>`);
    if (outcome.code === null) {
      server.emit("error", new Error(outcome.error));
    } else {
      server.emit("callback", outcome.code);
    }
  });
  const waitForCode = async (): Promise<string> => {
    const raised: readonly unknown[] = await once(server, "callback");
    return Schema.decodeUnknownSync(Schema.String)(raised[0]);
  };
  return {
    redirectUri: `http://127.0.0.1:${address.port}/callback`,
    server,
    waitForCode,
  };
};

const askForCode = async (): Promise<string> => {
  const prompt = createPrompt({ input: process.stdin, output: process.stdout });
  const answer = await prompt.question("Paste the code the page shows: ");
  prompt.close();
  return answer.trim();
};

const timeout = async (): Promise<never> => {
  await sleep(LOGIN_TIMEOUT_MS);
  throw new Error("Nobody signed in within five minutes.");
};

const login = async (options: Options): Promise<void> => {
  const { url } = options;
  if (url === "") {
    return fail("Which Froggy? froggy login --url=https://your-froggy.example");
  }
  const metadata = await discover(url);
  const clientId = await clientFor(url, metadata, await loadCredentials());
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const state = randomBytes(16).toString("base64url");
  const callback = options.manual
    ? null
    : await listenForCallback(state, metadata.issuer);
  const redirectUri = callback?.redirectUri ?? `${url}/oauth/manual`;
  const authorize = new URL(metadata.authorization_endpoint);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("client_id", clientId);
  authorize.searchParams.set("redirect_uri", redirectUri);
  authorize.searchParams.set("code_challenge", challenge);
  authorize.searchParams.set("code_challenge_method", "S256");
  authorize.searchParams.set("scope", SCOPES);
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("resource", `${url}/mcp`);
  console.error(
    `Open this link and click Allow:\n\n  ${authorize.toString()}\n`
  );
  let code: string;
  try {
    if (callback === null) {
      code = await askForCode();
    } else {
      openBrowser(authorize.toString());
      code = await Promise.race([callback.waitForCode(), timeout()]);
    }
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Sign-in failed.");
  } finally {
    callback?.server.close();
  }
  const issued = await redeem(metadata.token_endpoint, {
    client_id: clientId,
    code,
    code_verifier: verifier,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
    resource: `${url}/mcp`,
  });
  if (!(issued instanceof Object)) {
    return fail(`Froggy did not exchange the code: ${issued}`);
  }
  await saveCredentials({
    accessToken: issued.access_token,
    clientId,
    expiresAt: Date.now() + issued.expires_in * 1000,
    refreshToken: issued.refresh_token,
    revocationEndpoint: metadata.revocation_endpoint,
    tokenEndpoint: metadata.token_endpoint,
    url,
    v: 1,
  });
  console.error(`Signed in to ${url}. Credentials: ${CREDENTIALS_PATH}`);
};

const logout = async (): Promise<void> => {
  const stored = await loadCredentials();
  if (stored === null) {
    console.error("Not signed in.");
    return;
  }
  try {
    await postForm(stored.revocationEndpoint, {
      token: stored.refreshToken,
      token_type_hint: "refresh_token",
    });
  } catch {
    // Unreachable server: the file goes anyway, and the tokens expire.
  }
  await forgetCredentials();
  console.error(`Signed out of ${stored.url}.`);
};

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

/** The server's task envelope, or a loud exit: an unreadable answer is not a task. */
const taskOf = async (response: Response): Promise<Task> => {
  const body: unknown = await response.json();
  const decoded = decodeTask(body);
  if (decoded._tag === "Failure") {
    return fail(`Unexpected answer from Froggy: ${JSON.stringify(body)}`);
  }
  return decoded.success.task;
};

/** POST the task, pay the 402 with the person's wallet, POST again. */
const submit = async (
  options: Options,
  body: Record<string, string>
): Promise<Task> => {
  const idempotencyKey = options.requestKey;
  const first = await api(options, "/api/tasks", {
    body: JSON.stringify({ ...body, idempotencyKey }),
    method: "POST",
  });
  if (first.status !== 402) {
    if (!first.ok) {
      return fail(`Froggy answered ${first.status}: ${await first.text()}`);
    }
    return await taskOf(first);
  }
  const challenge: unknown = await first.json();
  const signed = await api(options, "/api/wallet/pay", {
    body: JSON.stringify({ challenge }),
    method: "POST",
  });
  const signedBody: unknown = await signed.json();
  if (!signed.ok) {
    // The wallet's refusal in its own words when the body carries one.
    const refusal = decodeRefusal(signedBody);
    const reason =
      refusal._tag === "Failure"
        ? `status ${signed.status}`
        : refusal.success.error;
    return fail(`The wallet did not pay: ${reason}`);
  }
  const header = decodeSigned(signedBody);
  if (header._tag === "Failure") {
    return fail("The wallet answered without a payment header.");
  }
  const paid = await api(options, "/api/tasks", {
    body: JSON.stringify({ ...body, idempotencyKey }),
    headers: { "x-payment": header.success.header },
    method: "POST",
  });
  if (!paid.ok) {
    return fail(`Froggy did not accept the payment: ${await paid.text()}`);
  }
  return await taskOf(paid);
};

const show = (task: Task, options: Options): void => {
  if (options.json) {
    console.log(JSON.stringify(task, null, 2));
    return;
  }
  console.log(`task ${task.id} (${task.kind}): ${task.status}`);
  for (const ticket of task.approval) {
    console.log(`  waiting for the person to answer: ${ticket.title}`);
  }
  if (task.approval.length > 0) {
    console.log("  Approve in Froggy: the web workspace or the Telegram card.");
  }
  if (task.error !== null) {
    console.log(`  ${task.error}`);
  }
  if (task.status === "done" && task.result !== null) {
    console.log(JSON.stringify(task.result, null, 2));
  }
  if (task.saleId !== null) {
    console.log(`  sale ${task.saleId}`);
  }
};

const status = async (options: Options, id: string): Promise<Task> => {
  const response = await api(options, `/api/tasks/${id}`);
  if (!response.ok) {
    return fail(`Froggy answered ${response.status}: ${await response.text()}`);
  }
  return await taskOf(response);
};

/** Poll until the task ends or the wait runs out; say each change once. */
const follow = async (
  options: Options,
  task: Task,
  started: number,
  last: string
): Promise<Task> => {
  const line = `${task.status}${task.approval.map((t) => ` ${t.title}`).join("")}`;
  if (line !== last && !options.json) {
    console.log(`… ${line}`);
  }
  if (ENDED.has(task.status) || Date.now() - started >= WAIT_LIMIT_MS) {
    return task;
  }
  await sleep(POLL_MS);
  return await follow(options, await status(options, task.id), started, line);
};

const serviceCommand = async (
  options: Options,
  command: string,
  rest: readonly string[]
): Promise<boolean> => {
  switch (command) {
    case "mcp": {
      const lines = createInterface({
        input: process.stdin,
        crlfDelay: Infinity,
      });
      for await (const line of lines) {
        if (line.length > 16_000) {
          console.error("MCP input too large");
          continue;
        }
        const response = await api(options, "/mcp", {
          method: "POST",
          headers: {
            accept: "application/json, text/event-stream",
            "mcp-protocol-version": "2025-11-25",
          },
          body: line,
        });
        if (response.status === 202) {
          continue;
        }
        if (!response.ok) {
          console.error(`Froggy MCP returned ${response.status}`);
          process.exitCode = 1;
          break;
        }
        console.log(await response.text());
      }
      return true;
    }
    case "services": {
      const response = await api(options, "/api/services");
      console.log(await response.text());
      if (!response.ok) {
        process.exitCode = 1;
      }
      return true;
    }
    case "service": {
      const [service, ...words] = rest;
      const response = await api(options, "/api/services/run", {
        method: "POST",
        body: JSON.stringify({
          v: 1,
          service,
          prompt: words.join(" "),
          idempotencyKey: options.requestKey,
        }),
      });
      console.log(await response.text());
      if (!response.ok) {
        process.exitCode = 1;
      }
      return true;
    }
    case "service-status": {
      const response = await api(
        options,
        `/api/services/tasks/${encodeURIComponent(rest[0] ?? "")}`
      );
      console.log(await response.text());
      if (!response.ok) {
        process.exitCode = 1;
      }
      return true;
    }
    default: {
      return false;
    }
  }
};

const main = async (): Promise<void> => {
  const { args, options } = await optionsFrom(process.argv.slice(2));
  const [command, ...rest] = args;
  if (command === undefined || command === "help" || command === "--help") {
    console.log(usage);
    return;
  }
  if (command === "login") {
    await login(options);
    return;
  }
  if (command === "logout") {
    await logout();
    return;
  }
  if (options.url === "") {
    return fail(
      "Which Froggy? Run `node froggy.mjs login --url=<froggy>` once, or set FROGGY_URL."
    );
  }
  if (await serviceCommand(options, command, rest)) {
    return;
  }
  let task: Task;
  switch (command) {
    case "brief": {
      const symbol = rest[0] ?? "USDC";
      task = await submit(options, { kind: "brief", symbol });
      break;
    }
    case "ask": {
      const instruction = rest.join(" ").trim();
      if (instruction === "") {
        return fail(
          'Say what to do: froggy ask "find the cheapest USB-C hub on example.shop"'
        );
      }
      task = await submit(options, { instruction, kind: "browse" });
      break;
    }
    case "status": {
      const [id] = rest;
      if (id === undefined) {
        return fail("Which task? froggy status <task id>");
      }
      show(await status(options, id), options);
      return;
    }
    case "tasks": {
      const response = await api(options, "/api/tasks");
      console.log(await response.text());
      return;
    }
    default: {
      return fail(usage);
    }
  }
  const final = options.wait
    ? await follow(options, task, Date.now(), "")
    : task;
  show(final, options);
  if (final.status === "failed" || final.status === "uncertain") {
    process.exit(1);
  }
};

await main();
