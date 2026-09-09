import { Schema } from "effect";

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
export type CloudBrowserInfo = typeof Browser.Type;
type CloudRequestBody = Readonly<
  Record<string, string | number | boolean | null>
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
  readonly stop: (browserId: string) => Promise<void>;
  readonly deleteProfile: (profileId: string) => Promise<void>;
}

const validateBrowser = (info: CloudBrowserInfo): CloudBrowserInfo => {
  if (!Number.isFinite(Date.parse(info.timeoutAt))) {
    throw new CloudApiError(502, "invalid expiry");
  }
  if (
    info.liveUrl !== null &&
    new URL(info.liveUrl).origin !== "https://live.browser-use.com"
  ) {
    throw new CloudApiError(502, "invalid viewer origin");
  }
  if (info.cdpUrl !== null) {
    const url = new URL(info.cdpUrl);
    if (
      url.protocol !== "wss:" ||
      !(
        url.hostname === "browser-use.com" ||
        url.hostname.endsWith(".browser-use.com")
      )
    ) {
      throw new CloudApiError(502, "invalid CDP origin");
    }
  }
  return info;
};

export const cloudApi = (options: {
  readonly apiKey: string;
  readonly country: string | null;
  readonly fetch?: typeof fetch;
}): CloudApi => {
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
      signal: AbortSignal.timeout(30_000),
      redirect: "error",
    };
    if (body !== undefined) {
      init.body = JSON.stringify(body);
    }
    const response = await (options.fetch ?? fetch)(
      `https://api.browser-use.com/api/v4${path}`,
      init
    );
    if (!response.ok) {
      await response.body?.cancel();
      throw new CloudApiError(response.status, method);
    }
    try {
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
        if (size > 256 * 1024) {
          throw new CloudApiError(502, "oversized response");
        }
        chunks.push(chunk);
      }
      return Schema.decodeUnknownSync(schema)(
        JSON.parse(Buffer.concat(chunks).toString("utf-8"))
      );
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
      }),
    get: async (browserId) =>
      await browser(`/browsers/${encodeURIComponent(browserId)}`),
    stop: async (browserId) => {
      await request(
        Acknowledgement,
        `/browsers/${encodeURIComponent(browserId)}`,
        "PATCH",
        { action: "stop" }
      );
    },
    deleteProfile: async (profileId) => {
      await request(
        Acknowledgement,
        `/profiles/${encodeURIComponent(profileId)}`,
        "DELETE"
      );
    },
  };
};
