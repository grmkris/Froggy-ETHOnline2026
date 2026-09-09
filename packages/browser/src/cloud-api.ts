/**
 * The Browser Use Cloud boundary.
 *
 * Browsers, profiles and their reported costs come from the provider's Browser
 * API — `/api/v3`, the version whose published client exposes browser
 * create/get/stop, profile CRUD and billing. `/api/v4` is the hosted *agent*
 * API; Froggy drives the page itself, so it does not use it.
 */

import { Schema } from "effect";

const API_BASE = "https://api.browser-use.com/api/v3";
const VIEWER_ORIGIN = "https://live.browser-use.com";
/** Every browser gets its own CDP subdomain: `<browser id>.cdp.browser-use.com`. */
const CDP_HOST_SUFFIX = ".cdp.browser-use.com";
const MAX_RESPONSE_BYTES = 256 * 1024;
const REQUEST_TIMEOUT_MS = 30_000;

const ProviderId = Schema.String.check(Schema.isUUID());
const Browser = Schema.Struct({
  id: ProviderId,
  status: Schema.Literals(["active", "stopped"]),
  cdpUrl: Schema.NullOr(Schema.String),
  liveUrl: Schema.NullOr(Schema.String),
  timeoutAt: Schema.String,
  browserCost: Schema.optional(Schema.String),
  proxyCost: Schema.optional(Schema.String),
});
const Profile = Schema.Struct({
  id: ProviderId,
  userId: Schema.optional(Schema.NullOr(Schema.String)),
});
const Profiles = Schema.Struct({ items: Schema.Array(Profile) });
const Acknowledgement = Schema.Union([Schema.Struct({}), Schema.Null]);
/** Chrome's own `/json/version`, served by the browser rather than the API. */
const DevToolsVersion = Schema.Struct({
  webSocketDebuggerUrl: Schema.String,
});
export type CloudBrowserInfo = typeof Browser.Type;
type CloudRequestBody = Readonly<
  Record<string, string | number | boolean | null | Record<string, string>>
>;

/** Provider URLs are bearer credentials. Errors omit response bodies. */
export class CloudApiError extends Error {
  readonly status: number;
  readonly operation: string;
  constructor(status: number, operation: string) {
    super(`Browser Use ${operation} failed (${status}).`);
    this.name = "CloudApiError";
    this.status = status;
    this.operation = operation;
  }
}

export interface CloudApi {
  readonly profile: (userKey: string) => Promise<string>;
  readonly create: (profileId: string) => Promise<CloudBrowserInfo>;
  readonly get: (browserId: string) => Promise<CloudBrowserInfo>;
  /** Stops the browser and answers with its final reported costs. */
  readonly stop: (browserId: string) => Promise<CloudBrowserInfo | null>;
  readonly deleteProfile: (profileId: string) => Promise<void>;
  /**
   * The DevTools WebSocket for a browser.
   *
   * `cdpUrl` is an HTTPS endpoint, not a socket: connecting a `WebSocket` to it
   * directly fails. Chrome's own `/json/version` on that host names the socket,
   * which is what a CDP client attaches to.
   */
  readonly socket: (cdpUrl: string) => Promise<string>;
}

const providerCdpHost = (raw: string): URL => {
  const url = new URL(raw);
  if (
    !(url.protocol === "https:" || url.protocol === "wss:") ||
    !url.hostname.endsWith(CDP_HOST_SUFFIX)
  ) {
    throw new CloudApiError(502, "invalid CDP origin");
  }
  return url;
};

const validateBrowser = (info: CloudBrowserInfo): CloudBrowserInfo => {
  if (!Number.isFinite(Date.parse(info.timeoutAt))) {
    throw new CloudApiError(502, "invalid expiry");
  }
  if (info.liveUrl !== null && new URL(info.liveUrl).origin !== VIEWER_ORIGIN) {
    throw new CloudApiError(502, "invalid viewer origin");
  }
  if (info.cdpUrl !== null && info.cdpUrl !== "") {
    providerCdpHost(info.cdpUrl);
  }
  return info;
};

/** Read a capped JSON body. Bodies never reach an error message. */
const readJson = async <S extends Schema.Codec<unknown>>(
  schema: S,
  response: Response
): Promise<S["Type"]> => {
  if (response.status === 204) {
    return Schema.decodeUnknownSync(schema)(null);
  }
  if (!response.body) {
    throw new CloudApiError(502, "empty response");
  }
  let size = 0;
  const chunks: Uint8Array[] = [];
  for await (const chunk of response.body) {
    size += chunk.byteLength;
    if (size > MAX_RESPONSE_BYTES) {
      throw new CloudApiError(502, "oversized response");
    }
    chunks.push(chunk);
  }
  return Schema.decodeUnknownSync(schema)(
    JSON.parse(Buffer.concat(chunks).toString("utf-8"))
  );
};

export const cloudApi = (options: {
  readonly apiKey: string;
  readonly country: string | null;
  readonly fetch?: typeof fetch;
}): CloudApi => {
  const call = options.fetch ?? fetch;
  const request = async <S extends Schema.Codec<unknown>>(
    schema: S,
    path: string,
    method = "GET",
    body?: CloudRequestBody
  ): Promise<S["Type"]> => {
    const init: RequestInit = {
      method,
      headers: {
        "X-Browser-Use-API-Key": options.apiKey,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      redirect: "error",
    };
    if (body !== undefined) {
      init.body = JSON.stringify(body);
    }
    const response = await call(`${API_BASE}${path}`, init);
    if (!response.ok) {
      await response.body?.cancel();
      throw new CloudApiError(response.status, method);
    }
    try {
      return await readJson(schema, response);
    } catch {
      throw new CloudApiError(502, "invalid response");
    }
  };
  const browser = async (
    path: string,
    method?: string,
    body?: CloudRequestBody
  ): Promise<CloudBrowserInfo> => {
    const info = await request(Browser, path, method, body);
    try {
      return validateBrowser(info);
    } catch {
      throw new CloudApiError(502, "invalid browser metadata");
    }
  };
  return {
    profile: async (userKey) => {
      const found = await request(
        Profiles,
        `/profiles?query=${encodeURIComponent(userKey)}`
      );
      const existing = found.items.find((item) => item.userId === userKey);
      if (existing) {
        return existing.id;
      }
      const created = await request(Profile, "/profiles", "POST", {
        name: userKey,
        userId: userKey,
      });
      return created.id;
    },
    create: async (profileId) =>
      await browser("/browsers", "POST", {
        profileId,
        proxyCountryCode: options.country,
        timeout: 60,
        browserScreenWidth: 1280,
        browserScreenHeight: 800,
        enableRecording: false,
        // Labels the provider dashboard filters on, so an operator can tell
        // Froggy's browsers apart from anything else on the project. The key
        // is already a hash of the user id; no identifier leaves this app.
        metadata: { app: "froggy", profile: profileId },
      }),
    get: async (browserId) =>
      await browser(`/browsers/${encodeURIComponent(browserId)}`),
    stop: async (browserId) => {
      // The stop reply carries the browser's final `browserCost` and
      // `proxyCost`, so the usage record needs no second round trip.
      const response = await request(
        Schema.Union([Browser, Acknowledgement]),
        `/browsers/${encodeURIComponent(browserId)}`,
        "PATCH",
        { action: "stop" }
      );
      if (response === null || !("id" in response)) {
        return null;
      }
      try {
        return validateBrowser(response);
      } catch {
        return null;
      }
    },
    deleteProfile: async (profileId) => {
      await request(
        Acknowledgement,
        `/profiles/${encodeURIComponent(profileId)}`,
        "DELETE"
      );
    },
    socket: async (cdpUrl) => {
      const endpoint = providerCdpHost(cdpUrl);
      // The API key is deliberately absent: this host is reached by a URL that
      // is itself the credential, and the key has no business travelling to it.
      const response = await call(
        new URL("/json/version", `https://${endpoint.host}`),
        {
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          redirect: "error",
        }
      );
      if (!response.ok) {
        await response.body?.cancel();
        throw new CloudApiError(response.status, "CDP discovery");
      }
      let socketUrl: string;
      try {
        const version = await readJson(DevToolsVersion, response);
        socketUrl = version.webSocketDebuggerUrl;
      } catch {
        throw new CloudApiError(502, "invalid CDP discovery");
      }
      const socket = new URL(socketUrl);
      if (socket.protocol !== "wss:" || socket.hostname !== endpoint.hostname) {
        throw new CloudApiError(502, "invalid CDP socket");
      }
      return socket.toString();
    },
  };
};
