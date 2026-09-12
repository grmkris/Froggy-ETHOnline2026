/**
 * Discovery: the second Graph product, beside the gateway that answers.
 *
 * The registry pins twelve deployments a person reviewed. This is how the
 * agent finds one nobody pinned: The Graph's hosted Subgraph MCP, asked by
 * keyword or by the contract a subgraph indexes, answering with the exact
 * artefact (`Qm…` hash) that `graph_query` can then read under the same
 * standardized query. The two products compose: one finds, one reads, and
 * the receipt names what was found and what it was read at.
 *
 * The MCP speaks JSON-RPC over an SSE session: open the event stream, take
 * the `endpoint` it announces, POST requests there, read answers back off the
 * stream. One session per call, opened and closed inside it — a discovery is
 * seconds long and a held-open stream is a thing to babysit for no benefit.
 *
 * Never throws. A discovery that fails answers with no candidates and a note,
 * because the agent should say "I could not look" rather than stop; the
 * money-bearing step is `graph_query`, and it has its own gate.
 *
 * Two facts about the server, learned by driving it on 11 Sep 2026 rather than
 * from its docs: it answered every tool without a key, and its 30-day query
 * count tool reported zero for deployments with years of fees — so the only
 * ranking it gives is lifetime query fees for a contract lookup, and the
 * server's own ordering (curation signal) for a keyword search. Neither is
 * query volume, and the prose says so.
 */

import { Result, Schema } from "effect";

/** One deployment the MCP surfaced. `network` is known only for contract lookups. */
export interface DiscoveredDeployment {
  readonly displayName: string | null;
  readonly ipfsHash: string;
  readonly network: string | null;
  /** Lifetime query fees in GRT, the one ranking the server returns; null for keyword hits. */
  readonly queryFeesGrt: number | null;
  readonly subgraphId: string | null;
}

export interface DiscoveryResult {
  /** At most `MAX_CANDIDATES`, in the server's order. */
  readonly candidates: readonly DiscoveredDeployment[];
  /** Why there are none, or what the caller should know about the ranking. */
  readonly note: string | null;
  /** Provider label for the receipt: the MCP host, or the fixture. */
  readonly source: string;
  readonly stubbed: boolean;
}

export interface SubgraphDiscovery {
  /** Deployments indexing `contract` on `chain` (a Graph network id: `mainnet`, `base`, `arbitrum-one`). */
  readonly byContract: (input: {
    readonly chain: string;
    readonly contract: string;
  }) => Promise<DiscoveryResult>;
  readonly byKeyword: (keyword: string) => Promise<DiscoveryResult>;
}

export const MAX_CANDIDATES = 10;
const NAME_LIMIT = 80;
const NETWORK_LIMIT = 40;
const ID_LIMIT = 64;
/** A `Qm…` CIDv0: base58, 46 characters. Anything else is not a hash the gateway serves. */
const IPFS_HASH = /^Qm[1-9A-HJ-NP-Za-km-z]{44}$/u;
const GRT_WEI = 1e18;

/** The MCP's answers, decoded rather than trusted; every field optional but the hash. */
const SearchHit = Schema.Struct({
  currentVersion: Schema.optional(
    Schema.NullOr(
      Schema.Struct({
        subgraphDeployment: Schema.optional(
          Schema.NullOr(Schema.Struct({ ipfsHash: Schema.String }))
        ),
      })
    )
  ),
  id: Schema.optional(Schema.NullOr(Schema.String)),
  metadata: Schema.optional(
    Schema.NullOr(
      Schema.Struct({
        displayName: Schema.optional(Schema.NullOr(Schema.String)),
      })
    )
  ),
});
const SearchBody = Schema.Struct({
  returned: Schema.optional(Schema.Finite),
  subgraphs: Schema.Array(SearchHit),
  total: Schema.optional(Schema.Finite),
});
const TopHit = Schema.Struct({
  ipfsHash: Schema.String,
  manifest: Schema.optional(
    Schema.NullOr(
      Schema.Struct({ network: Schema.optional(Schema.NullOr(Schema.String)) })
    )
  ),
  queryFeesAmount: Schema.optional(Schema.NullOr(Schema.String)),
});
const TopBody = Schema.Struct({ subgraphDeployments: Schema.Array(TopHit) });

/** The JSON-RPC envelope a tool call comes back in. */
const ToolResult = Schema.Struct({
  content: Schema.Array(
    Schema.Struct({
      text: Schema.optional(Schema.String),
      type: Schema.String,
    })
  ),
  isError: Schema.optional(Schema.Boolean),
});
/**
 * One line off the stream. Requests are sent with numeric ids, so a message
 * whose id is anything else is not an answer to ours and is dropped.
 */
const RpcMessage = Schema.Struct({
  error: Schema.optional(
    Schema.Struct({ code: Schema.Finite, message: Schema.String })
  ),
  id: Schema.optional(Schema.NullOr(Schema.Finite)),
  /** The handshake and the tool answer differ; each is decoded where it is read. */
  result: Schema.optional(Schema.Unknown),
});
type RpcMessage = typeof RpcMessage.Type;
const decodeToolResult = Schema.decodeUnknownResult(ToolResult);

/** JSON text straight into the shape, so nothing untyped sits in between. */
const decodeSearchText = Schema.decodeUnknownResult(
  Schema.fromJsonString(SearchBody)
);
const decodeTopText = Schema.decodeUnknownResult(
  Schema.fromJsonString(TopBody)
);
const decodeRpcText = Schema.decodeUnknownResult(
  Schema.fromJsonString(RpcMessage)
);

const clip = (
  value: string | null | undefined,
  limit: number
): string | null =>
  value === null || value === undefined || value.trim() === ""
    ? null
    : value.trim().slice(0, limit);

/** GRT from the server's wei-denominated string; null when it is not a number. */
const grtOf = (amount: string | null | undefined): number | null => {
  if (amount === null || amount === undefined) {
    return null;
  }
  const parsed = Number(amount);
  return Number.isFinite(parsed) ? parsed / GRT_WEI : null;
};

export type DiscoveryFetch = (
  url: string,
  init?: RequestInit
) => Promise<Response>;

export interface LiveDiscoveryOptions {
  /** The Studio key. Sent when present; the server answered without one on 11 Sep 2026. */
  readonly apiKey?: string;
  /** Overridable in tests. */
  readonly fetch?: DiscoveryFetch;
  /** Whole-call deadline: the stream, the handshake and the tool together. */
  readonly timeoutMs?: number;
  readonly url?: string;
}

export const SUBGRAPH_MCP_URL = "https://subgraphs.mcp.thegraph.com/sse";
const DEFAULT_TIMEOUT_MS = 20_000;
/** A tool answer larger than this is not a list of deployments. */
const MAX_ANSWER_BYTES = 256_000;
const INITIALIZE_ID = 1;
const CALL_ID = 2;

type Outcome =
  | { readonly _tag: "answer"; readonly text: string }
  | { readonly _tag: "failed"; readonly reason: string };

/** The two requests this client sends, and the one notification. */
interface InitializeRequest {
  readonly id: typeof INITIALIZE_ID;
  readonly jsonrpc: "2.0";
  readonly method: "initialize";
  readonly params: {
    readonly capabilities: Record<string, never>;
    readonly clientInfo: { readonly name: string; readonly version: string };
    readonly protocolVersion: string;
  };
}
interface ToolCallRequest {
  readonly id: typeof CALL_ID;
  readonly jsonrpc: "2.0";
  readonly method: "tools/call";
  readonly params: {
    readonly arguments: Readonly<Record<string, string>>;
    readonly name: string;
  };
}
interface InitializedNotification {
  readonly jsonrpc: "2.0";
  readonly method: "notifications/initialized";
}
type RpcRequest = InitializeRequest | InitializedNotification | ToolCallRequest;

const EVENT_LINE = /^event: ?(?<name>.*)$/mu;

/**
 * One tool call, one session.
 *
 * The stream is read frame by frame (`event:` and `data:` lines, blank line
 * between frames). The first frame names the POST endpoint; every later
 * `message` frame is a JSON-RPC response matched to its request by id.
 * Everything here is bounded by one timeout, and a stream that closes early
 * is a failure with a sentence, not a hang.
 */
const callSubgraphTool = async (
  options: LiveDiscoveryOptions,
  name: string,
  args: Readonly<Record<string, string>>
): Promise<Outcome> => {
  const fetchImpl: DiscoveryFetch =
    options.fetch ?? (async (url, init) => await fetch(url, init));
  const base = options.url ?? SUBGRAPH_MCP_URL;
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const headers =
    options.apiKey === undefined || options.apiKey === ""
      ? { accept: "text/event-stream" }
      : {
          accept: "text/event-stream",
          authorization: `Bearer ${options.apiKey}`,
        };

  const endpoint = Promise.withResolvers<string>();
  const answers = new Map<number, PromiseWithResolvers<RpcMessage>>();
  const expectAnswer = async (id: number): Promise<RpcMessage> => {
    const waiter = Promise.withResolvers<RpcMessage>();
    answers.set(id, waiter);
    return await waiter.promise;
  };
  const gaveUp = Promise.withResolvers<never>();
  const fail = (reason: string): void => {
    gaveUp.reject(new Error(reason));
  };
  controller.signal.addEventListener("abort", () => {
    fail("the Subgraph MCP did not answer in time");
  });
  // A rejection nobody is racing against yet must not be an unhandled one.
  const settle = async (): Promise<void> => {
    try {
      await gaveUp.promise;
    } catch {
      // consumed by the races below
    }
  };
  void settle();

  const takeFrame = (frame: string): void => {
    const event = EVENT_LINE.exec(frame)?.groups?.["name"] ?? "message";
    const data = frame
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("\n");
    if (event === "endpoint") {
      const target = new URL(data, base);
      if (target.origin !== new URL(base).origin) {
        throw new Error("Subgraph MCP announced an unexpected session origin.");
      }
      endpoint.resolve(target.toString());
      return;
    }
    if (event !== "message") {
      return;
    }
    const message = decodeRpcText(data);
    if (Result.isFailure(message)) {
      return;
    }
    const { id } = message.success;
    if (id === undefined || id === null) {
      return;
    }
    answers.get(id)?.resolve(message.success);
    answers.delete(id);
  };

  /** Drains the stream for the life of the call; frames land in `takeFrame`. */
  const pump = async (body: ReadableStream<Uint8Array>): Promise<void> => {
    const decoder = new TextDecoder();
    let buffer = "";
    let received = 0;
    try {
      for await (const chunk of body) {
        received += chunk.byteLength;
        if (received > MAX_ANSWER_BYTES) {
          fail("the Subgraph MCP sent more than a listing");
          controller.abort();
          return;
        }
        buffer += decoder.decode(chunk, { stream: true });
        let boundary = buffer.indexOf("\n\n");
        while (boundary >= 0) {
          takeFrame(buffer.slice(0, boundary));
          buffer = buffer.slice(boundary + 2);
          boundary = buffer.indexOf("\n\n");
        }
      }
      fail("the Subgraph MCP closed the session before answering");
    } catch (error) {
      fail(
        error instanceof Error ? error.message : "the session stream failed"
      );
    }
  };

  const post = async (url: string, body: RpcRequest): Promise<void> => {
    const response = await fetchImpl(url, {
      body: JSON.stringify(body),
      headers: { ...headers, "content-type": "application/json" },
      method: "POST",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(
        `the Subgraph MCP refused a request with ${response.status}`
      );
    }
  };

  try {
    const stream = await fetchImpl(base, {
      headers,
      signal: controller.signal,
    });
    if (!stream.ok || stream.body === null) {
      return {
        _tag: "failed",
        reason: `the Subgraph MCP answered ${stream.status} instead of opening a session`,
      };
    }
    void pump(stream.body);

    const messages = await Promise.race([endpoint.promise, gaveUp.promise]);
    const initialized = expectAnswer(INITIALIZE_ID);
    await post(messages, {
      id: INITIALIZE_ID,
      jsonrpc: "2.0",
      method: "initialize",
      params: {
        capabilities: {},
        clientInfo: { name: "froggy", version: "1" },
        protocolVersion: "2024-11-05",
      },
    });
    await Promise.race([initialized, gaveUp.promise]);
    await post(messages, {
      jsonrpc: "2.0",
      method: "notifications/initialized",
    });
    const answered = expectAnswer(CALL_ID);
    await post(messages, {
      id: CALL_ID,
      jsonrpc: "2.0",
      method: "tools/call",
      params: { arguments: args, name },
    });
    const reply = await Promise.race([answered, gaveUp.promise]);

    if (reply.error !== undefined) {
      return {
        _tag: "failed",
        reason: `the Subgraph MCP refused: ${reply.error.message.slice(0, 200)}`,
      };
    }
    const result = decodeToolResult(reply.result);
    if (Result.isFailure(result)) {
      return { _tag: "failed", reason: "the answer carried no tool content" };
    }
    const text = result.success.content.find(
      (part) => part.type === "text" && part.text !== undefined
    )?.text;
    if (text === undefined) {
      return { _tag: "failed", reason: "the answer carried no text" };
    }
    if (result.success.isError === true) {
      return {
        _tag: "failed",
        reason: `the tool reported an error: ${text.slice(0, 200)}`,
      };
    }
    return { _tag: "answer", text };
  } catch (error) {
    return {
      _tag: "failed",
      reason: error instanceof Error ? error.message : "the lookup failed",
    };
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
};

const failed = (source: string, reason: string): DiscoveryResult => ({
  candidates: [],
  note: `${reason}. Nothing was found, and nothing was paid.`,
  source,
  stubbed: false,
});

export const liveSubgraphDiscovery = (
  options: LiveDiscoveryOptions = {}
): SubgraphDiscovery => {
  const source = new URL(options.url ?? SUBGRAPH_MCP_URL).host;
  return {
    byContract: async ({ chain, contract }) => {
      const outcome = await callSubgraphTool(
        options,
        "get_top_subgraph_deployments",
        {
          chain: chain.trim(),
          contract_address: contract.trim(),
        }
      );
      if (outcome._tag === "failed") {
        return failed(source, outcome.reason);
      }
      const body = decodeTopText(outcome.text);
      if (Result.isFailure(body)) {
        return failed(
          source,
          "the answer did not match the deployment listing shape"
        );
      }
      const candidates = body.success.subgraphDeployments
        .filter((hit) => IPFS_HASH.test(hit.ipfsHash))
        .slice(0, MAX_CANDIDATES)
        .map((hit): DiscoveredDeployment => ({
          displayName: null,
          ipfsHash: hit.ipfsHash,
          network: clip(hit.manifest?.network, NETWORK_LIMIT),
          queryFeesGrt: grtOf(hit.queryFeesAmount),
          subgraphId: null,
        }));
      return {
        candidates,
        note:
          candidates.length === 0
            ? `No published subgraph indexes ${contract.trim()} on ${chain.trim()}, or the chain name is not one the network uses (mainnet, base, arbitrum-one, matic, bsc).`
            : "Ranked by lifetime query fees, the one signal the server returns; it does not report query volume.",
        source,
        stubbed: false,
      };
    },
    byKeyword: async (keyword) => {
      const outcome = await callSubgraphTool(
        options,
        "search_subgraphs_by_keyword",
        {
          keyword: keyword.trim(),
        }
      );
      if (outcome._tag === "failed") {
        return failed(source, outcome.reason);
      }
      const body = decodeSearchText(outcome.text);
      if (Result.isFailure(body)) {
        return failed(source, "the answer did not match the search shape");
      }
      const candidates = body.success.subgraphs
        .flatMap((hit): DiscoveredDeployment[] => {
          const hash = hit.currentVersion?.subgraphDeployment?.ipfsHash;
          if (hash === undefined || !IPFS_HASH.test(hash)) {
            return [];
          }
          return [
            {
              displayName: clip(hit.metadata?.displayName, NAME_LIMIT),
              ipfsHash: hash,
              network: null,
              queryFeesGrt: null,
              subgraphId: clip(hit.id, ID_LIMIT),
            },
          ];
        })
        .slice(0, MAX_CANDIDATES);
      const total = body.success.total ?? candidates.length;
      return {
        candidates,
        note:
          candidates.length === 0
            ? `No subgraph's name matches "${keyword.trim()}".`
            : `${total} match${total === 1 ? "" : "es"} by name, in the server's order (curation signal). The chain is in the name, not in the data; a contract lookup names it.`,
        source,
        stubbed: false,
      };
    },
  };
};

/**
 * The stub: two candidates that exist, marked as a fixture on every path
 * out, so a screenshot of a stubbed discovery cannot pass for a live one.
 */
const FIXTURE: DiscoveryResult = {
  candidates: [
    {
      displayName: "Aave V3 Ethereum (fixture)",
      ipfsHash: "QmcXE5QVcBcvcaJddPxd8mFs6W9xt7STmwfgguoiM6ddAd",
      network: "mainnet",
      queryFeesGrt: null,
      subgraphId: "JCNWRypm7FYwV8fx5HhzZPSFaMxgkPuw4TnR3Gpi81zk",
    },
    {
      displayName: "Spark (fixture)",
      ipfsHash: "QmTVumjhubXWP8MeDx5g114MRX99E4Gie5mFqVurttF99X",
      network: "mainnet",
      queryFeesGrt: null,
      subgraphId: "GbKdmBe4ycCYCQLQSjqGg6UHYoYfbyJyq5WrG35pv1si",
    },
  ],
  note: "Recorded fixture, not a live lookup.",
  source: "fixture:subgraph-mcp",
  stubbed: true,
};

export const stubSubgraphDiscovery = (): SubgraphDiscovery => ({
  byContract: async () => {
    await Promise.resolve();
    return FIXTURE;
  },
  byKeyword: async () => {
    await Promise.resolve();
    return FIXTURE;
  },
});

const shortHash = (hash: string): string => `${hash.slice(0, 10)}…`;

const grt = (amount: number): string =>
  `${Math.round(amount).toLocaleString("en-US")} GRT`;

/** The prose the model reads. Bounded by `MAX_CANDIDATES` and the clips above. */
export const describeDiscovery = (
  result: DiscoveryResult,
  asked: string
): string => {
  const lines: string[] = [];
  if (result.candidates.length === 0) {
    lines.push(`Nothing found for ${asked}. ${result.note ?? ""}`.trim());
  } else {
    lines.push(
      `${result.candidates.length} deployment${result.candidates.length === 1 ? "" : "s"} for ${asked}, through the Subgraph MCP (${result.source}):`
    );
    for (const [index, candidate] of result.candidates.entries()) {
      const parts = [
        candidate.displayName ?? "(unnamed)",
        `deployment ${candidate.ipfsHash}`,
      ];
      if (candidate.network !== null) {
        parts.push(`on ${candidate.network}`);
      }
      if (candidate.subgraphId !== null) {
        parts.push(`subgraph ${shortHash(candidate.subgraphId)}`);
      }
      if (candidate.queryFeesGrt !== null) {
        parts.push(`${grt(candidate.queryFeesGrt)} in lifetime query fees`);
      }
      lines.push(`${index + 1}. ${parts.join(", ")}`);
    }
    if (result.note !== null) {
      lines.push(result.note);
    }
    lines.push(
      "Inspect graph_schema then use graph_read for general entities. graph_query remains specialized for standardized lending. A schema mismatch is not an absent token, and upstream usage can still be billed."
    );
  }
  if (result.stubbed) {
    lines.push(
      "[STUB: recorded fixture, not a live Subgraph MCP. Say so if you cite it.]"
    );
  }
  return lines.join("\n");
};
