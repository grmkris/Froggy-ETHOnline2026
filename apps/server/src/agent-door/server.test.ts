/**
 * The JSON-RPC layer, which had no test at all.
 *
 * `FROGGY_DOOR_NO_MAIN` exists so this module can be imported without starting
 * the read loop; it was added for a test that was never written. This is it.
 *
 * The rule these all serve: a request that carried an id gets exactly one
 * answer. A door that stays silent leaves the caller's agent waiting on a
 * purchase it cannot tell from one still in progress, which is the worst shape
 * a payment tool can fail in.
 */

import { describe, expect, it } from "bun:test";

import { readDoor } from "./config";
import type { ToolDeps } from "./tools";

process.env["FROGGY_DOOR_NO_MAIN"] = "1";
const { handleLine } = await import("./server");

const ORIGIN = "https://seller.example";

/** One JSON-RPC request, as a caller writes it. */
interface DoorRequest {
  readonly id?: string | number;
  readonly method: string;
  readonly params?: {
    readonly arguments?: {
      readonly arguments?: Readonly<Record<string, number | string>>;
      readonly service?: string;
    };
    readonly name?: string;
    readonly protocolVersion?: string;
  };
}

/** What `initialize` answers with. */
interface Initialized {
  readonly capabilities: { readonly tools: Record<string, never> };
  readonly instructions: string;
  readonly protocolVersion: string;
  readonly serverInfo: { readonly name: string };
}

interface Tool {
  readonly annotations: {
    readonly destructiveHint?: boolean;
    readonly openWorldHint?: boolean;
    readonly readOnlyHint?: boolean;
  };
  readonly inputSchema: {
    readonly properties: { readonly maxAmount?: unknown };
  };
  readonly name: string;
}

const deps = (over: Partial<ToolDeps> = {}): ToolDeps => {
  const env = over.env ?? { FROGGY_URL: ORIGIN };
  return { door: readDoor(env), env, ...over };
};

/** Every message this file sends is a well-formed JSON-RPC 2.0 one. */
const send = async (message: DoorRequest, over: Partial<ToolDeps> = {}) =>
  await handleLine(deps(over), JSON.stringify({ jsonrpc: "2.0", ...message }));

/** A seller that describes itself, so a test can reach past the card. */
const cardFor = (): Response =>
  Response.json({
    description: "A lending snapshot.",
    facilitator: "https://api.blocky402.com",
    hcsTopic: null,
    name: "Froggy lending oracle",
    resources: [
      {
        asset: "0.0.0",
        description: "The oracle.",
        method: "GET",
        network: "hedera:mainnet",
        payTo: "0.0.10847556",
        price: "5000000",
        scheme: "exact",
        url: `${ORIGIN}/oracle/snapshot`,
      },
    ],
    source: ORIGIN,
    version: 1,
  });

const initialized = (answer: { result?: unknown } | null): Initialized =>
  // SAFETY: the caller just sent `initialize`, and every field read off this
  // is asserted on the next line.
  answer?.result as Initialized;

describe("initialize", () => {
  it("answers a version it supports with that same version", async () => {
    const asked = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
    const answers = await Promise.all(
      asked.map(
        async (protocolVersion) =>
          await send({
            id: 1,
            method: "initialize",
            params: { protocolVersion },
          })
      )
    );
    expect(
      answers.map((answer) => initialized(answer).protocolVersion)
    ).toEqual(asked);
  });

  it("falls back to the newest for a version it does not know", async () => {
    const answer = await send({
      id: 1,
      method: "initialize",
      params: { protocolVersion: "1999-01-01" },
    });
    expect(initialized(answer).protocolVersion).toBe("2025-11-25");
  });

  it("declares tools and says what the door is for", async () => {
    const result = initialized(
      await send({ id: 1, method: "initialize", params: {} })
    );
    expect(result.capabilities).toEqual({ tools: {} });
    expect(result.serverInfo.name).toBe("froggy-door");
    expect(result.instructions).toContain("froggy_catalogue");
  });
});

describe("the envelope", () => {
  it("writes nothing back for a notification", async () => {
    expect(await send({ method: "notifications/initialized" })).toBeNull();
  });

  it("carries a null id where the request's own id could not be read", async () => {
    // JSON-RPC requires the member to be present. Dropping it produces a line
    // that is a different message from the one intended.
    const answers = await Promise.all(
      ["{not json", '{"jsonrpc":"1.0"}'].map(
        async (line) => await handleLine(deps(), line)
      )
    );
    for (const answer of answers) {
      expect(answer?.id).toBeNull();
      expect(answer).toHaveProperty("id");
      expect(answer?.error?.code).toBeLessThan(-32_000);
    }
  });

  it("keeps the id on a method it does not have", async () => {
    const answer = await send({ id: "abc", method: "resources/list" });
    expect(answer?.id).toBe("abc");
    expect(answer?.error?.code).toBe(-32_601);
  });
});

const listed = async (): Promise<readonly Tool[]> => {
  const answer = await send({ id: 1, method: "tools/list" });
  // SAFETY: `tools/list` is the request just sent, and its result member is
  // the tool array declared in server.ts.
  const result = answer?.result as { tools?: readonly Tool[] } | undefined;
  return result?.tools ?? [];
};

const said = (answer: { result?: unknown } | null): string => {
  // SAFETY: a `tools/call` result is always a ToolResult, which is a
  // `content` array of text parts.
  const result = answer?.result as
    | { content?: readonly { text: string }[] }
    | undefined;
  return result?.content?.[0]?.text ?? "";
};

describe("tools/list", () => {
  it("offers three tools and no fourth", async () => {
    const tools = await listed();
    expect(tools.map((tool) => tool.name)).toEqual([
      "froggy_catalogue",
      "froggy_buy",
      "froggy_receipt",
    ]);
  });

  it("marks the one that spends money as destructive and open-world", async () => {
    // A host reads these to decide what may run without a person. Saying a
    // real-money transfer is non-destructive is telling it not to ask.
    const tools = await listed();
    const buy = tools.find((tool) => tool.name === "froggy_buy");
    expect(buy?.annotations.destructiveHint).toBe(true);
    expect(buy?.annotations.readOnlyHint).toBe(false);
    expect(buy?.annotations.openWorldHint).toBe(true);
    expect(buy?.inputSchema.properties.maxAmount).toBeDefined();
  });
});

describe("tools/call", () => {
  it("answers an unknown tool by naming the three that exist", async () => {
    const answer = await send({
      id: 1,
      method: "tools/call",
      params: { name: "froggy_sell" },
    });
    expect(said(answer)).toContain("froggy_catalogue");
  });

  it("blames `arguments` rather than `service` when only `arguments` is wrong", async () => {
    const answer = await send({
      id: 1,
      method: "tools/call",
      params: {
        arguments: { arguments: { n: 5 }, service: "oracle" },
        name: "froggy_buy",
      },
    });
    expect(said(answer)).toContain("`arguments` as strings only");
  });

  it("answers rather than going silent when a tool throws", async () => {
    // The door used to write the failure to stderr and nothing to stdout, so
    // the caller waited forever. A throw from the retry is the dangerous one:
    // silence there is indistinguishable from a payment still in flight.
    const answer = await send(
      {
        id: 7,
        method: "tools/call",
        params: { arguments: { service: "oracle" }, name: "froggy_buy" },
      },
      {
        env: {
          FROGGY_HEDERA_ACCOUNT_ID: "0.0.12345",
          FROGGY_HEDERA_PRIVATE_KEY: `0x${"1".repeat(64)}`,
          FROGGY_URL: ORIGIN,
        },
        // The card reads. The resource is where the connection dies — which is
        // the realistic shape: a seller up enough to describe itself and not
        // up enough to sell.
        fetch: async (url) => {
          await Promise.resolve();
          if (url.endsWith("/.well-known/x402.json")) {
            return cardFor();
          }
          throw new Error("the socket went away");
        },
      }
    );
    expect(answer).not.toBeNull();
    expect(answer?.id).toBe(7);
    expect(said(answer)).toContain("the socket went away");
    expect(said(answer)).toContain("whether money moved is unknown");
  });
});
