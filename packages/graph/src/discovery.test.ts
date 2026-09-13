/**
 * The Subgraph MCP client, against a server that lives in this file.
 *
 * The fake speaks the same session shape the hosted one does — an SSE stream
 * that first announces its endpoint, POSTs answered with 202, results pushed
 * back on the stream as `message` frames — so what is tested is the parsing
 * and the bounds, not a mock of our own code.
 */

import { describe, expect, it } from "bun:test";

import { Result, Schema } from "effect";

import {
  describeDiscovery,
  liveSubgraphDiscovery,
  MAX_CANDIDATES,
  stubSubgraphDiscovery,
} from "./discovery";
import type { DiscoveryFetch } from "./discovery";

const HASH_A = "QmcXE5QVcBcvcaJddPxd8mFs6W9xt7STmwfgguoiM6ddAd";
const HASH_B = "QmTVumjhubXWP8MeDx5g114MRX99E4Gie5mFqVurttF99X";
const BASE = "https://mcp.test/sse";

/** One SSE frame; `data` is already the text the server would send. */
const frame = (event: string, data: string): string =>
  `event: ${event}\ndata: ${data}\n\n`;

/** The requests our client sends, decoded so the fake can answer by method. */
const Request = Schema.Struct({
  id: Schema.optional(Schema.Finite),
  method: Schema.String,
  params: Schema.optional(
    Schema.Struct({
      arguments: Schema.optional(Schema.Record(Schema.String, Schema.String)),
      name: Schema.optional(Schema.String),
    })
  ),
});
const decodeRequest = Schema.decodeUnknownResult(
  Schema.fromJsonString(Request)
);

/** A canned tool answer: fixed text, or text computed from the call. */
type Answer =
  | { readonly kind: "text"; readonly text: string }
  | {
      readonly kind: "computed";
      readonly text: (name: string, args: Record<string, string>) => string;
    }
  | { readonly kind: "silent" };

const canned = (value: string): Answer => ({ kind: "text", text: value });
const computed = (
  fn: (name: string, args: Record<string, string>) => string
): Answer => ({ kind: "computed", text: fn });
const silent: Answer = { kind: "silent" };

interface FakeServer {
  readonly fetch: DiscoveryFetch;
  readonly seen: string[];
}

/**
 * A server whose tool answers are given up front. `answer` may be a string
 * (the tool's text content), a function of the arguments, or `null` to never
 * answer at all.
 */
const server = (
  answer: Answer,
  options: { readonly isError?: boolean; readonly status?: number } = {}
): FakeServer => {
  const seen: string[] = [];
  let push: ((text: string) => void) | null = null;
  const fetchImpl: DiscoveryFetch = async (url, init) => {
    await Promise.resolve();
    if (url === BASE) {
      if (options.status !== undefined) {
        return new Response("no", { status: options.status });
      }
      const stream = new ReadableStream<Uint8Array>({
        start: (controller) => {
          const encoder = new TextEncoder();
          push = (text) => {
            controller.enqueue(encoder.encode(text));
          };
          push(frame("endpoint", "/messages?sessionId=abc"));
        },
      });
      return new Response(stream, {
        headers: { "content-type": "text/event-stream" },
        status: 200,
      });
    }
    seen.push(url);
    // Our client always sends a JSON string body; anything else is a 400.
    const raw = init?.body;
    const request = decodeRequest(raw instanceof Uint8Array ? "" : raw);
    if (Result.isFailure(request)) {
      return new Response("Bad Request", { status: 400 });
    }
    const { id, method, params } = request.success;
    if (method === "initialize") {
      push?.(
        frame(
          "message",
          JSON.stringify({
            id,
            jsonrpc: "2.0",
            result: {
              protocolVersion: "2024-11-05",
              serverInfo: { name: "fake" },
            },
          })
        )
      );
    } else if (method === "tools/call" && answer.kind !== "silent") {
      const body =
        answer.kind === "text"
          ? answer.text
          : answer.text(params?.name ?? "", params?.arguments ?? {});
      push?.(
        frame(
          "message",
          JSON.stringify({
            id,
            jsonrpc: "2.0",
            result: {
              content: [{ text: body, type: "text" }],
              isError: options.isError ?? false,
            },
          })
        )
      );
    }
    return new Response("Accepted", { status: 202 });
  };
  return { fetch: fetchImpl, seen };
};

const discovery = (fake: FakeServer, timeoutMs = 2000) =>
  liveSubgraphDiscovery({ fetch: fake.fetch, timeoutMs, url: BASE });

describe("liveSubgraphDiscovery", () => {
  it("finds subgraphs by name and carries the current hash of each", async () => {
    const fake = server(
      canned(
        JSON.stringify({
          returned: 2,
          subgraphs: [
            {
              currentVersion: { subgraphDeployment: { ipfsHash: HASH_A } },
              id: "33ex1ExmYQtwGVwri1AP3oMFPGSce6YbocBP7fWbsBrg",
              metadata: { displayName: "Moonwell Base" },
            },
            {
              currentVersion: { subgraphDeployment: { ipfsHash: HASH_B } },
              id: "GoKhDqkKVGx",
              metadata: { displayName: "Moonwell Base Liquidations" },
            },
          ],
          total: 2,
        })
      )
    );
    const result = await discovery(fake).byKeyword("Moonwell");

    expect(result.stubbed).toBe(false);
    expect(result.source).toBe("mcp.test");
    expect(result.candidates.map((c) => c.ipfsHash)).toEqual([HASH_A, HASH_B]);
    expect(result.candidates[0]?.displayName).toBe("Moonwell Base");
    expect(result.candidates[0]?.subgraphId).toBe(
      "33ex1ExmYQtwGVwri1AP3oMFPGSce6YbocBP7fWbsBrg"
    );
    // A keyword hit does not say which chain; that is the contract lookup's job.
    expect(result.candidates[0]?.network).toBeNull();
    expect(fake.seen).toHaveLength(3);
    expect(fake.seen[0]).toBe("https://mcp.test/messages?sessionId=abc");
  });

  it("finds deployments by contract, with the network and the fees in GRT", async () => {
    const fake = server(
      computed((name, args) => {
        expect(name).toBe("get_top_subgraph_deployments");
        expect(args).toEqual({
          chain: "base",
          contract_address: "0x498581fF718922c3f8e6A244956aF099B2652b2b",
        });
        return JSON.stringify({
          subgraphDeployments: [
            {
              ipfsHash: HASH_A,
              manifest: { network: "base" },
              queryFeesAmount: "41805794765996520623952",
            },
          ],
        });
      })
    );
    const result = await discovery(fake).byContract({
      chain: " base ",
      contract: " 0x498581fF718922c3f8e6A244956aF099B2652b2b ",
    });

    const [only] = result.candidates;
    expect(result.candidates).toHaveLength(1);
    expect(only?.ipfsHash).toBe(HASH_A);
    expect(only?.network).toBe("base");
    expect(only?.displayName).toBeNull();
    expect(only?.subgraphId).toBeNull();
    // Wei to GRT: the server's string is 41805.79… × 10^18.
    expect(only?.queryFeesGrt).toBeCloseTo(41_805.79, 2);
    expect(result.note).toContain("lifetime query fees");
  });

  it("drops anything that is not a hash the gateway can serve, and caps the list", async () => {
    const hits = Array.from({ length: MAX_CANDIDATES + 5 }, (_, index) => ({
      currentVersion: {
        subgraphDeployment: {
          ipfsHash: `Qm${String(index).padStart(44, "1")}`,
        },
      },
      id: `s${index}`,
      metadata: { displayName: `S${index}` },
    }));
    hits.push({
      currentVersion: { subgraphDeployment: { ipfsHash: "not-a-hash" } },
      id: "junk",
      metadata: { displayName: "Junk" },
    });
    const fake = server(canned(JSON.stringify({ subgraphs: hits })));
    const result = await discovery(fake).byKeyword("S");

    expect(result.candidates).toHaveLength(MAX_CANDIDATES);
    expect(result.candidates.some((c) => c.subgraphId === "junk")).toBe(false);
  });

  it("says nothing was found rather than inventing a candidate", async () => {
    const fake = server(
      canned(JSON.stringify({ returned: 0, subgraphs: [], total: 0 }))
    );
    const result = await discovery(fake).byKeyword("zzqqx");

    expect(result.candidates).toEqual([]);
    expect(result.note).toContain("zzqqx");
  });

  it("refuses an answer that is not the listing shape", async () => {
    const fake = server(canned("<html>nope</html>"));
    const result = await discovery(fake).byKeyword("Aave");

    expect(result.candidates).toEqual([]);
    expect(result.note).toContain("did not match");
    expect(result.note).toContain("nothing was paid");
  });

  it("passes a tool error on as a sentence", async () => {
    const fake = server(canned("chain not supported"), { isError: true });
    const result = await discovery(fake).byContract({
      chain: "nochain",
      contract: "0x0",
    });

    expect(result.candidates).toEqual([]);
    expect(result.note).toContain("chain not supported");
  });

  it("gives up under its own deadline when the server never answers", async () => {
    const fake = server(silent);
    const started = Date.now();
    const result = await discovery(fake, 300).byKeyword("Aave");

    expect(Date.now() - started).toBeLessThan(2000);
    expect(result.candidates).toEqual([]);
    expect(result.note).toContain("did not answer in time");
  });

  it("reports a server that will not open a session", async () => {
    const fake = server(canned(""), { status: 503 });
    const result = await discovery(fake).byKeyword("Aave");

    expect(result.note).toContain("503");
  });
});

describe("describeDiscovery", () => {
  it("names every candidate with its hash, and tells the model how to read one", async () => {
    const fake = server(
      canned(
        JSON.stringify({
          subgraphDeployments: [
            {
              ipfsHash: HASH_A,
              manifest: { network: "base" },
              queryFeesAmount: "2000000000000000000",
            },
          ],
        })
      )
    );
    const result = await discovery(fake).byContract({
      chain: "base",
      contract: "0xabc",
    });
    const text = describeDiscovery(result, "0xabc on base");

    expect(text).toContain(
      `1. (unnamed), deployment ${HASH_A}, on base, 2 GRT`
    );
    expect(text).toContain("graph_schema then use graph_read");
    expect(text).toContain("upstream usage can still be billed");
    expect(text).not.toContain("STUB");
  });

  it("marks the fixture so a stubbed search cannot pass for a live one", async () => {
    const result = await stubSubgraphDiscovery().byKeyword("anything");

    expect(result.stubbed).toBe(true);
    expect(describeDiscovery(result, "anything")).toContain("[STUB");
  });
});
