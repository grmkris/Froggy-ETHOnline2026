#!/usr/bin/env node
/**
 * The second door: what an outside agent installs.
 *
 * A stateless newline-delimited JSON-RPC server on stdin and stdout, built
 * for Node so it runs in whatever sandbox a personal agent has. It is not the
 * person's door: there is no account here, no OAuth, no mandate and no
 * balance of ours. The caller pays from their own Hedera account with their
 * own key, which arrives in this process's environment and never leaves it.
 *
 * Three views: what's for sale, buy it, check the receipt. Two of them cost
 * nothing and need no key, so a caller who has just installed this and
 * configured nothing can still see something real.
 *
 * The transport is written out rather than taken from an SDK for the reason
 * recorded in docs/decisions/0012: the SDK's server helpers bring Zod, and
 * Effect Schema is this repository's contract language.
 *
 * stdout is the protocol. Every diagnostic goes to stderr, because a stray
 * log line on stdout is a parse error at the other end.
 */

import { createInterface } from "node:readline";

import { Schema } from "effect";

import { readDoor } from "./config";
import { buyTool, catalogueTool, receiptTool } from "./tools";
import type { ToolDeps, ToolResult } from "./tools";

const Envelope = Schema.Struct({
  jsonrpc: Schema.Literals(["2.0"]),
  id: Schema.optional(Schema.Union([Schema.String, Schema.Finite])),
  method: Schema.String,
  params: Schema.optional(Schema.Unknown),
});
const Call = Schema.Struct({
  name: Schema.String,
  arguments: Schema.optional(Schema.Unknown),
});
const BuyArguments = Schema.Struct({
  arguments: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  service: Schema.String,
});
const Initialize = Schema.Struct({
  protocolVersion: Schema.optional(Schema.String),
});
const ReceiptArguments = Schema.Struct({
  network: Schema.optional(Schema.String),
  settlement: Schema.String,
});
const decodeEnvelope = Schema.decodeUnknownResult(Envelope);
const decodeCall = Schema.decodeUnknownResult(Call);
const decodeBuy = Schema.decodeUnknownResult(BuyArguments);
const decodeReceipt = Schema.decodeUnknownResult(ReceiptArguments);
const decodeInitialize = Schema.decodeUnknownResult(Initialize);

const VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"];

/**
 * Written out rather than derived, so what a caller reads is what was meant.
 * Three tools is the whole surface; a fourth would mean this has stopped
 * being a door onto Froggy and started being a second product.
 */
const TOOLS = [
  {
    name: "froggy_catalogue",
    description:
      "List what Froggy sells over x402 on Hedera: what each service is, what it costs, on which network and in which asset, which facilitator settles it, and which consensus topic carries the receipts. Costs nothing and needs no account or key.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: "froggy_buy",
    description:
      "Buy one of those services, paying from your own Hedera account. Takes the price from the seller's challenge, signs a transfer with your key, and returns what was bought plus the settlement id. Spends real money. Refuses in plain words when your account is short, when the seller offers a network this door cannot pay, or when the settlement path is unavailable; it never substitutes a different facilitator.",
    inputSchema: {
      type: "object",
      properties: {
        service: {
          type: "string",
          description:
            "A service from froggy_catalogue, matched by name or URL, or the full URL of any x402 resource.",
        },
        arguments: {
          type: "object",
          additionalProperties: { type: "string" },
          description: "Query arguments for the request, such as symbol=USDC.",
        },
      },
      required: ["service"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  {
    name: "froggy_receipt",
    description:
      "Check whether a settlement really happened: the transfer as the Hedera ledger recorded it, and the matching public note on the consensus topic. Costs nothing, needs no key, and works for any settlement, including ones you did not make.",
    inputSchema: {
      type: "object",
      properties: {
        settlement: {
          type: "string",
          description:
            "A Hedera transaction id, as froggy_buy returns it: 0.0.x@seconds.nanos or 0.0.x-seconds-nanos.",
        },
        network: {
          type: "string",
          enum: ["hedera:mainnet", "hedera:testnet"],
          description: "Defaults to the network this door is configured for.",
        },
      },
      required: ["settlement"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
  },
];

const INSTRUCTIONS = [
  "Froggy sells data and tasks over the x402 payment protocol on Hedera, and this door lets you buy them with your own Hedera account. There is no signup, no API key and no subscription: the price is in the seller's challenge and the payment is a transfer you sign.",
  "Start with froggy_catalogue, which is free. froggy_buy spends real money from the account in FROGGY_HEDERA_ACCOUNT_ID. froggy_receipt checks any settlement against the public ledger and is also free.",
  "The facilitator pays the Hedera transaction fee, so you need no HBAR for gas — only the amount being paid.",
  "A refusal from this door says what is wrong and what to do about it. Read it rather than retrying: buying twice costs twice.",
].join(" ");

/** Everything this door can put in a JSON-RPC `result`. */
type DoorResult =
  | ToolResult
  | { readonly tools: typeof TOOLS }
  | {
      readonly capabilities: { readonly tools: Record<string, never> };
      readonly instructions: string;
      readonly protocolVersion: string | undefined;
      readonly serverInfo: { readonly name: string; readonly version: string };
    }
  | Record<string, never>;

interface Response {
  readonly jsonrpc: "2.0";
  readonly id: string | number | undefined;
  readonly result?: DoorResult;
  readonly error?: { readonly code: number; readonly message: string };
}

const write = (response: Response): void => {
  process.stdout.write(`${JSON.stringify(response)}\n`);
};

const failed = (text: string): ToolResult => ({
  content: [{ type: "text", text }],
  isError: true,
});

const invoke = async (
  deps: ToolDeps,
  call: typeof Call.Type
): Promise<ToolResult> => {
  switch (call.name) {
    case "froggy_catalogue": {
      return await catalogueTool(deps);
    }
    case "froggy_buy": {
      const args = decodeBuy(call.arguments ?? {});
      return args._tag === "Failure"
        ? failed("froggy_buy needs a service. froggy_catalogue lists them.")
        : await buyTool(deps, args.success);
    }
    case "froggy_receipt": {
      const args = decodeReceipt(call.arguments ?? {});
      return args._tag === "Failure"
        ? failed("froggy_receipt needs a settlement id, as froggy_buy returns.")
        : await receiptTool(deps, args.success);
    }
    default: {
      return failed(
        `This door has three tools: ${TOOLS.map((tool) => tool.name).join(", ")}.`
      );
    }
  }
};

/** One request in, at most one response out. Notifications get nothing back. */
export const handleLine = async (
  deps: ToolDeps,
  line: string
): Promise<Response | null> => {
  let body: unknown;
  try {
    body = JSON.parse(line);
  } catch {
    return {
      jsonrpc: "2.0",
      id: undefined,
      error: { code: -32_700, message: "Parse error" },
    };
  }
  const message = decodeEnvelope(body);
  if (message._tag === "Failure") {
    return {
      jsonrpc: "2.0",
      id: undefined,
      error: { code: -32_600, message: "Invalid request" },
    };
  }
  const { id, method, params } = message.success;
  if (id === undefined) {
    return null;
  }
  const ok = (result: DoorResult): Response => ({ jsonrpc: "2.0", id, result });

  if (method === "initialize") {
    const init = decodeInitialize(params ?? {});
    const asked =
      init._tag === "Success" ? (init.success.protocolVersion ?? "") : "";
    return ok({
      capabilities: { tools: {} },
      instructions: INSTRUCTIONS,
      protocolVersion: VERSIONS.includes(asked) ? asked : VERSIONS[0],
      serverInfo: { name: "froggy-door", version: "1.0.0" },
    });
  }
  if (method === "ping") {
    return ok({});
  }
  if (method === "tools/list") {
    return ok({ tools: TOOLS });
  }
  if (method !== "tools/call") {
    return {
      jsonrpc: "2.0",
      id,
      error: { code: -32_601, message: "Method not found" },
    };
  }
  const call = decodeCall(params);
  return call._tag === "Failure"
    ? {
        jsonrpc: "2.0",
        id,
        error: { code: -32_602, message: "Invalid tool parameters" },
      }
    : ok(await invoke(deps, call.success));
};

/** Read stdin forever, one JSON-RPC message per line. */
const main = async (): Promise<void> => {
  const { env } = process;
  const deps: ToolDeps = { door: readDoor(env), env };
  const lines = createInterface({
    crlfDelay: Number.POSITIVE_INFINITY,
    input: process.stdin,
  });
  for await (const line of lines) {
    if (line.trim() === "") {
      continue;
    }
    if (line.length > 64_000) {
      console.error("froggy-door: input too large");
      continue;
    }
    try {
      const response = await handleLine(deps, line);
      if (response !== null) {
        write(response);
      }
    } catch (error) {
      console.error(
        `froggy-door: ${error instanceof Error ? error.message : "unknown error"}`
      );
    }
  }
};

if (process.env["FROGGY_DOOR_NO_MAIN"] !== "1") {
  void main();
}
