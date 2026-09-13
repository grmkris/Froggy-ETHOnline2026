import { Schema } from "effect";

const ProviderId = Schema.String.check(Schema.isUUID());
export const HostedRunStatus = Schema.Literals([
  "queued",
  "dispatching",
  "running",
  "completed",
  "failed",
  "cancelled",
]);
export type HostedRunStatus = typeof HostedRunStatus.Type;
const Created = Schema.Struct({
  id: ProviderId,
  sessionId: ProviderId,
  workspaceId: ProviderId,
  status: HostedRunStatus,
});
const Status = Schema.Struct({ status: HostedRunStatus });
const Summary = Schema.Struct({
  ...Status.fields,
  result: Schema.NullOr(Schema.String),
  error: Schema.NullOr(Schema.String),
  totalCostUsd: Schema.String,
});
export const HostedEvent = Schema.Struct({
  id: Schema.Int,
  runId: ProviderId,
  type: Schema.String,
  ts: Schema.String,
  data: Schema.Unknown,
});
export type HostedEvent = typeof HostedEvent.Type;
const Events = Schema.Struct({
  events: Schema.Array(HostedEvent),
  nextAfter: Schema.NullOr(Schema.Int),
  hasMore: Schema.Boolean,
});
export interface HostedRunInput {
  readonly privateSession?: boolean;
  readonly secretBindings?: readonly {
    readonly alias: string;
    readonly source: { readonly type: "inline"; readonly value: string };
    readonly allowedDomains: readonly string[];
  }[];
  readonly task: string;
  readonly model: string;
  readonly maxCostUsd: number;
  readonly sessionId?: string;
  readonly profileId?: string;
  readonly country: string | null;
}
export interface HostedAgentApi {
  readonly stubbed: boolean;
  readonly create: (input: HostedRunInput) => Promise<typeof Created.Type>;
  readonly status: (id: string) => Promise<HostedRunStatus>;
  readonly events: (id: string, after: number) => Promise<typeof Events.Type>;
  readonly summary: (id: string) => Promise<typeof Summary.Type>;
  readonly cancel: (id: string) => Promise<void>;
}

/** Bodies can contain page data and credentials. Errors expose only operation/status. */
export class HostedAgentError extends Error {
  readonly retryAfterMs: number;
  readonly status: number;
  constructor(status: number, operation: string, retryAfterMs = 2000) {
    super(`Browser task ${operation} could not be confirmed (${status}).`);
    this.name = "HostedAgentError";
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

export const hostedAgentApi = (options: {
  readonly apiKey: string;
  readonly fetch?: typeof fetch;
}): HostedAgentApi => {
  const call = options.fetch ?? fetch;
  const request = async <S extends Schema.Codec<unknown>>(
    schema: S,
    path: string,
    method = "GET",
    body?: Readonly<Record<string, unknown>>
  ): Promise<S["Type"]> => {
    const init: RequestInit = {
      method,
      headers: {
        "X-Browser-Use-API-Key": options.apiKey,
        "content-type": "application/json",
      },
      signal: AbortSignal.timeout(15_000),
      redirect: "error",
    };
    if (body !== undefined) {
      init.body = JSON.stringify(body);
    }
    const response = await call(
      `https://api.browser-use.com/api/v4${path}`,
      init
    );
    if (!response.ok) {
      const retry = response.headers.get("retry-after");
      const seconds = Number(retry);
      const parsedDelay = Number.isFinite(seconds)
        ? seconds * 1000
        : Date.parse(retry ?? "") - Date.now();
      const delay = retry === null ? 2000 : parsedDelay;
      await response.body?.cancel();
      throw new HostedAgentError(
        response.status,
        method,
        Math.min(60_000, Math.max(2000, Number.isFinite(delay) ? delay : 2000))
      );
    }
    if (response.status === 204) {
      return Schema.decodeUnknownSync(schema)(null);
    }
    if (response.body === null) {
      throw new HostedAgentError(502, "empty response");
    }
    const chunks: Uint8Array[] = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.byteLength;
      if (size > 512 * 1024) {
        throw new HostedAgentError(502, "oversized response");
      }
      chunks.push(chunk);
    }
    try {
      return Schema.decodeUnknownSync(schema)(
        JSON.parse(Buffer.concat(chunks).toString("utf-8"))
      );
    } catch {
      throw new HostedAgentError(502, "invalid response");
    }
  };
  return {
    stubbed: false,
    create: async (input) => {
      if (input.privateSession === true && input.sessionId !== undefined) {
        try {
          await request(
            Schema.Unknown,
            `/sessions/${encodeURIComponent(input.sessionId)}/share`,
            "PUT",
            { isActive: false }
          );
        } catch (error) {
          if (!(error instanceof HostedAgentError) || error.status !== 404) {
            throw error;
          }
        }
      }
      const settings = {
        proxyCountryCode: input.country,
        record: false,
        screenWidth: 1280,
        screenHeight: 800,
      };
      const browserSettings =
        input.profileId === undefined
          ? settings
          : { ...settings, profileId: input.profileId };
      const base = {
        task: input.task,
        model: input.model,
        modelParams: { reasoning: { effort: "low" } },
        maxCostUsd: input.maxCostUsd,
        agentmail: false,
        ...(input.secretBindings === undefined
          ? {}
          : { secretBindings: input.secretBindings }),
        browserSettings,
      };
      const body =
        input.sessionId === undefined
          ? base
          : { ...base, sessionId: input.sessionId };
      return await request(Created, "/runs", "POST", body);
    },
    status: async (id) => {
      const value = await request(
        Status,
        `/runs/${encodeURIComponent(id)}/status`
      );
      return value.status;
    },
    events: async (id, after) =>
      await request(
        Events,
        `/runs/${encodeURIComponent(id)}/events?limit=50&after=${after}&include_output=false`
      ),
    summary: async (id) =>
      await request(Summary, `/runs/${encodeURIComponent(id)}`),
    cancel: async (id) => {
      await request(
        Schema.Unknown,
        `/runs/${encodeURIComponent(id)}/cancel`,
        "POST"
      );
    },
  };
};

export const stubHostedAgent: HostedAgentApi = {
  stubbed: true,
  create: async () =>
    await Promise.reject(
      new HostedAgentError(503, "stub: configure Browser Use")
    ),
  status: async () =>
    await Promise.reject(
      new HostedAgentError(503, "stub: configure Browser Use")
    ),
  events: async () =>
    await Promise.reject(
      new HostedAgentError(503, "stub: configure Browser Use")
    ),
  summary: async () =>
    await Promise.reject(
      new HostedAgentError(503, "stub: configure Browser Use")
    ),
  cancel: async () => {
    await Promise.reject(
      new HostedAgentError(503, "stub: configure Browser Use")
    );
  },
};

export class HostedBrowserExpiredError extends Error {
  constructor() {
    super(
      "This browser session ended. Reconnect to continue within the remaining allowance."
    );
    this.name = "HostedBrowserExpiredError";
  }
}
