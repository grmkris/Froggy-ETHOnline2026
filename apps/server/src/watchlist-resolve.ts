import { WatchlistPreviewId, EvmAddress, publicHttpUrl } from "@froggy/domain";
import type { UserId, WatchlistInput } from "@froggy/domain";
import { WatchlistPreview, WatchlistResolve } from "@froggy/protocol";
import { Schema } from "effect";

import { boundedBytes, safeFetch } from "./outbound";
import type { Services } from "./services";
import { lookupAddress, lookupNetworks } from "./trading/address-lookup";
import { parseLinkedData } from "./watchlist-metadata";
import type { LinkMetadata } from "./watchlist-metadata";

const CACHE_MS = 60_000;
const previews = new Map<
  string,
  {
    readonly ref: WatchlistPreviewId;
    readonly at: number;
    readonly value: Promise<WatchlistPreview>;
  }
>();
const cleanText = (value: string, limit: number): string =>
  value.replaceAll(/\s+/gu, " ").trim().slice(0, limit);

/** Static metadata only: this read never executes a page, starts an agent or spends credits. */
export const readLinkPreview = async (
  url: string,
  response: Response
): Promise<WatchlistPreview> => {
  const source = new URL(url);
  let title = "";
  let ogTitle = "";
  let description = "";
  let linked: LinkMetadata | null = null;
  let jsonText = "";
  let kind: "link" | "product" | "flight" = "link";
  const contentType = response.headers.get("content-type") ?? "";
  if (response.ok && contentType.includes("text/html")) {
    const bytes = await boundedBytes(response, 512 * 1024);
    const html = new Response(new TextDecoder().decode(bytes), {
      headers: { "content-type": "text/html" },
    });
    await new HTMLRewriter()
      .on('script[type="application/ld+json"]', {
        element() {
          jsonText = "";
        },
        text(chunk) {
          jsonText = (jsonText + chunk.text).slice(0, 32_000);
          if (chunk.lastInTextNode && linked === null) {
            const parsed = Schema.decodeUnknownResult(
              Schema.fromJsonString(Schema.Json)
            )(jsonText);
            if (parsed._tag === "Success") {
              linked = parseLinkedData(parsed.success, url);
            }
          }
        },
      })
      .on("title", {
        text(chunk) {
          title += chunk.text.slice(0, 120);
        },
      })
      .on("meta", {
        element(element) {
          const property =
            element.getAttribute("property") ?? element.getAttribute("name");
          const content = element.getAttribute("content") ?? "";
          if (property === "og:title") {
            ogTitle = cleanText(content, 120);
          }
          if (property === "description" || property === "og:description") {
            description = cleanText(content, 1000);
          }
          if (property === "og:type" && content.includes("product")) {
            kind = "product";
          }
        },
      })
      .transform(html)
      .text();
  }
  const metadata = Schema.decodeUnknownResult(
    Schema.Struct({
      kind: Schema.Literals(["link", "product", "flight"]),
      name: Schema.NullOr(Schema.String),
      image: Schema.NullOr(Schema.String),
      observation: WatchlistPreview.fields.observation,
    })
  )(linked);
  const details = metadata._tag === "Success" ? metadata.success : null;
  return {
    observation: details?.observation,
    imageUrl: details?.image,
    v: 1,
    candidates: [
      {
        title:
          cleanText(details?.name || ogTitle || title, 120) || source.hostname,
        notes: description,
        source: { _tag: details?.kind ?? kind, url },
      },
    ],
    notice:
      title || ogTitle
        ? "Page metadata · Free preview. You can edit the details before saving."
        : "Page details were unavailable. You can still save this link.",
  };
};

const resolve = async (
  services: Services,
  input: typeof WatchlistResolve.Type
): Promise<WatchlistPreview> => {
  if (Schema.is(EvmAddress)(input.input)) {
    const networks = lookupNetworks(
      Object.keys(services.environment.trading.rpcEndpoints),
      services.environment.modes.quicknode === "live"
    ).filter(
      (network) => network === "eip155:8453" || network === "eip155:4663"
    );
    const lookup = await lookupAddress(
      { rpc: services.trading.rpc, networks },
      {
        address: input.input,
        network: input.network,
      },
      []
    );
    const candidates: WatchlistInput[] = lookup.networks
      .filter((row) => row.status === "observed")
      .map((row) => ({
        title:
          row.token?.name ??
          row.token?.symbol ??
          `${input.input.slice(0, 6)}…${input.input.slice(-4)}`,
        notes: "",
        source: {
          _tag:
            (row.token?.symbol ?? null) !== null ||
            (row.token?.decimals ?? null) !== null
              ? "token"
              : "wallet",
          address: lookup.address,
          network: row.network,
        },
      }));
    return {
      v: 1,
      candidates,
      lookup,
      notice: lookup.stubbed
        ? "Simulated lookup. These examples do not describe this address."
        : "Contract metadata is self-reported. Choose the chain you want to save.",
    };
  }
  const checked = publicHttpUrl(input.input);
  if (!checked.ok) {
    throw new Error("Paste an EVM address or a public website URL.");
  }
  const response = await safeFetch(
    input.input,
    { headers: { accept: "text/html" } },
    { maxBodyBytes: 512 * 1024, timeoutMs: 8000 }
  ).catch(() => new Response(null, { status: 502 }));
  return await readLinkPreview(input.input, response);
};

export const handleWatchlistResolve = async (
  services: Services,
  request: Request,
  owner: UserId
): Promise<Response> => {
  if (request.method !== "POST") {
    return Response.json(
      { v: 1, error: "Method not allowed." },
      { status: 405 }
    );
  }
  const parsed = Schema.decodeUnknownResult(WatchlistResolve)(
    await request.json().catch(() => null)
  );
  if (parsed._tag === "Failure") {
    return Response.json(
      { v: 1, error: "Paste an address or a public link." },
      { status: 400 }
    );
  }
  const input = { ...parsed.success, input: parsed.success.input.trim() };
  if (
    input.network !== undefined &&
    input.network !== "eip155:8453" &&
    input.network !== "eip155:4663"
  ) {
    return Response.json(
      { v: 1, error: "Preview supports Base and Robinhood." },
      { status: 400 }
    );
  }
  const now = Date.now();
  for (const [key, entry] of previews) {
    if (now - entry.at > CACHE_MS) {
      previews.delete(key);
    }
  }
  const key = `${owner}:${input.network ?? "all"}:${input.input}`;
  let entry = previews.get(key);
  if (entry === undefined) {
    if (
      previews.size >= 1000 ||
      [...previews.keys()].filter((value) => value.startsWith(`${owner}:`))
        .length >= 20
    ) {
      return Response.json(
        { v: 1, error: "Too many previews. Try again in a minute." },
        { status: 429 }
      );
    }
    entry = {
      ref: WatchlistPreviewId.generate(),
      at: now,
      value: resolve(services, input),
    };
    previews.set(key, entry);
  }
  try {
    return Response.json(
      Schema.decodeUnknownSync(WatchlistPreview)({
        ...(await entry.value),
        ref: entry.ref,
      }),
      { headers: { "cache-control": "no-store" } }
    );
  } catch {
    return Response.json(
      {
        v: 1,
        error:
          "Preview unavailable. Use Add item to save the details manually.",
      },
      { status: 422 }
    );
  }
};

export const watchlistPreviewFor = async (
  owner: UserId,
  ref: WatchlistPreviewId
): Promise<WatchlistPreview | null> => {
  const entry = [...previews].find(
    ([key, value]) =>
      key.startsWith(`${owner}:`) &&
      value.ref === ref &&
      Date.now() - value.at <= CACHE_MS
  )?.[1];
  return entry ? await entry.value.catch(() => null) : null;
};
