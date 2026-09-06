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
 * Nothing here decides money. A refusal from the wallet is printed in the
 * wallet's words and the command exits non-zero.
 */

import { createInterface } from "node:readline";
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

const decodeTask = Schema.decodeUnknownResult(TaskEnvelope);
const decodeSigned = Schema.decodeUnknownResult(Signed);
const decodeRefusal = Schema.decodeUnknownResult(Refusal);

interface Options {
  readonly json: boolean;
  readonly requestKey: string;
  readonly token: string;
  readonly url: string;
  readonly wait: boolean;
}

interface Parsed {
  readonly args: readonly string[];
  readonly options: Options;
}

const POLL_MS = 3000;
const WAIT_LIMIT_MS = 15 * 60 * 1000;
const ENDED = new Set(["done", "failed", "uncertain"]);

const usage = `froggy — let Froggy do a paid task for you

  froggy brief <SYMBOL>          a lending brief: cheapest borrow and best supply
                                 for one token across twelve standardized markets
  froggy ask "<instruction>"     a browse on the person's own Chrome, under their mandate
  froggy status <task id>        where a task is, its result and its receipts
  froggy tasks                   recent tasks
  froggy services                service catalog and prices
  froggy service <name> "<text>"   buy a service (returns a ticket)
  froggy service-status <id>      read a service result
  froggy mcp                     MCP stdio bridge for agent clients

Environment: FROGGY_URL (the Froggy server), FROGGY_TOKEN (the agent token the
person minted in Froggy's settings). Flags: --json, --no-wait,
--idempotency-key=<stable-request-id> (reuse for the same request).

A task is paid in HBAR from the person's Froggy wallet before it runs; the
receipt and the sale id come back with the task. If the wallet refuses, the
refusal is printed in the wallet's words and nothing is charged.`;

const fail = (message: string): never => {
  console.error(message);
  process.exit(1);
};

const optionsFrom = (argv: readonly string[]): Parsed => {
  const url = process.env["FROGGY_URL"] ?? "";
  const token = process.env["FROGGY_TOKEN"] ?? "";
  const args = argv.filter((a) => !a.startsWith("--"));
  const flags = new Set(argv.filter((a) => a.startsWith("--")));
  return {
    args,
    options: {
      json: flags.has("--json"),
      requestKey:
        [...flags]
          .find((flag) => flag.startsWith("--idempotency-key="))
          ?.slice("--idempotency-key=".length) ?? crypto.randomUUID(),
      token,
      url: url.replace(/\/+$/u, ""),
      wait: !flags.has("--no-wait"),
    },
  };
};

const api = async (
  options: Options,
  path: string,
  init: Omit<RequestInit, "headers"> & {
    readonly headers?: Record<string, string>;
  } = {}
): Promise<Response> =>
  await fetch(`${options.url}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${options.token}`,
      "content-type": "application/json",
      ...init.headers,
    },
  });

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
        const response = await api(options, "/api/mcp", {
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
  const { args, options } = optionsFrom(process.argv.slice(2));
  const [command, ...rest] = args;
  if (command === undefined || command === "help" || command === "--help") {
    console.log(usage);
    return;
  }
  if (options.url === "" || options.token === "") {
    return fail(
      "Set FROGGY_URL and FROGGY_TOKEN first; the person gets both from Froggy's settings."
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
