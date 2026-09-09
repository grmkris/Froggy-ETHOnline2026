/** Fixed provider routes and budgets. No URL, model, payee or price comes from the model. */
import { KNOWN_ASSETS, usdMicros } from "@froggy/domain";
import {
  challengeFrom,
  decodeSettlementHeader,
  paymentHeaders,
  settlementHeaderFrom,
} from "@froggy/payments";
import { PromptServiceName as PromptName } from "@froggy/protocol";
import type {
  ServiceCard,
  PromptServiceName,
  PromptServiceRequest,
  ServiceRequest,
  ServiceResult,
} from "@froggy/protocol";
import { Redacted, Schema } from "effect";

import { boundedBytes, safeFetch } from "./outbound";
import type { OutboundOptions } from "./outbound";
import type { Services } from "./services";
import type { TradingServiceContext } from "./trading/services";
import {
  preflightTrading,
  runTradingService,
  tradingCatalog,
} from "./trading/services";

const DEFINITIONS: Readonly<
  Record<
    PromptServiceName,
    {
      title: string;
      description: string;
      provider: string;
      price: number;
      cap: number;
      maxInput: number;
    }
  >
> = {
  x_search: {
    title: "Listen on X",
    description:
      "Up to 20 recent public posts, with source links. Last seven days; no claim of exhaustive research.",
    provider: "X API",
    price: 200_000,
    cap: 0,
    maxInput: 450,
  },
  web_search: {
    title: "Search the web",
    description: "Find five useful pages with excerpts and links.",
    provider: "You.com",
    price: 30_000,
    cap: 10_000,
    maxInput: 1000,
  },
  image: {
    title: "Make an image",
    description: "One 1024 × 1024 image with Google Nano Banana.",
    provider: "BlockRun",
    price: 120_000,
    cap: 60_000,
    maxInput: 2000,
  },
  inference: {
    title: "Ask another model",
    description: "A second opinion from GPT-4o mini, up to 512 output tokens.",
    provider: "BlockRun",
    price: 30_000,
    cap: 10_000,
    maxInput: 2000,
  },
  speech: {
    title: "Read it aloud",
    description:
      "Turn up to 1,000 characters into an MP3 with ElevenLabs Flash.",
    provider: "BlockRun",
    price: 150_000,
    cap: 100_000,
    maxInput: 1000,
  },
};

const availability = (
  demo: boolean,
  configured: boolean
): ServiceCard["status"] => {
  if (demo) {
    return "demo";
  }
  return configured ? "configured" : "unavailable";
};
const readinessNote = (
  demo: boolean,
  configured: boolean,
  name: PromptServiceName
): string => {
  if (demo) {
    return "Demo fixture — no live provider call.";
  }
  if (configured) {
    return "Configured. Payment remains subject to wallet policy and available funds.";
  }
  return name === "x_search"
    ? "X API access is not configured."
    : "Supplier payee and Base treasury signing must be configured.";
};

export const serviceCatalog = (services: Services): readonly ServiceCard[] => [
  ...Object.entries(DEFINITIONS).map(([key, definition]) => {
    const name = Schema.decodeUnknownSync(PromptName)(key);
    const demo = services.environment.modes.hedera === "stub";
    const host = name === "web_search" ? "api.you.com" : "blockrun.ai";
    const configured =
      name === "x_search"
        ? Redacted.value(services.environment.xApiBearer).trim() !== ""
        : services.treasuryPayer?.network === "eip155:8453" &&
          services.environment.supplierPayees[host] !== undefined;
    return {
      name,
      title: definition.title,
      description: definition.description,
      provider: definition.provider,
      priceUsdMicros: usdMicros(definition.price),
      maxInput: definition.maxInput,
      status: availability(demo, configured),
      note: readinessNote(demo, configured, name),
    };
  }),
  ...tradingCatalog(services),
];

const readJson = async <S extends Schema.Codec<unknown>>(
  response: Response,
  schema: S
): Promise<S["Type"]> =>
  Schema.decodeUnknownSync(schema)(
    JSON.parse(new TextDecoder().decode(await boundedBytes(response)))
  );
type SupplierBody =
  | { model: string; prompt: string; size: string; n: number }
  | { model: string; input: string; voice: string; response_format: string }
  | {
      model: string;
      messages: readonly { role: string; content: string }[];
      max_tokens: number;
    };
const post = (body: SupplierBody): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});
const WebAnswer = Schema.Struct({
  results: Schema.Struct({
    web: Schema.Array(
      Schema.Struct({
        title: Schema.String,
        url: Schema.String,
        description: Schema.optional(Schema.String),
        snippets: Schema.optional(Schema.Array(Schema.String)),
      })
    ),
  }),
});
const XAnswer = Schema.Struct({
  data: Schema.optional(
    Schema.Array(
      Schema.Struct({
        id: Schema.String.check(Schema.isPattern(/^\d{1,30}$/u)),
        text: Schema.String,
      })
    )
  ),
  errors: Schema.optional(Schema.Array(Schema.Unknown)),
});
const ChatAnswer = Schema.Struct({
  choices: Schema.Array(
    Schema.Struct({ message: Schema.Struct({ content: Schema.String }) })
  ),
});
const ImageAnswer = Schema.Struct({
  data: Schema.Array(
    Schema.Struct({
      url: Schema.optional(Schema.String),
      b64_json: Schema.optional(Schema.String),
    })
  ),
});
const ImageJob = Schema.Struct({
  id: Schema.String.check(Schema.isPattern(/^[a-zA-Z0-9_-]{1,160}$/u)),
});

const supplier = async (
  services: Services,
  name: PromptServiceName,
  url: string,
  init: RequestInit,
  outbound: OutboundOptions
): Promise<{
  response: Response;
  transactionId: string | null;
  headers: Headers;
}> => {
  const first = await safeFetch(url, init, outbound);
  if (first.status !== 402) {
    return { response: first, transactionId: null, headers: new Headers() };
  }
  // Rebuild a bounded response before the payment decoder reads it.
  const challenge = await challengeFrom(
    new Response(new TextDecoder().decode(await boundedBytes(first, 64_000)), {
      status: 402,
      headers: first.headers,
    })
  );
  const payee = services.environment.supplierPayees[new URL(url).hostname];
  const usdc = KNOWN_ASSETS["eip155:8453:usdc"];
  const offer = challenge?.accepts.find(
    (item) =>
      item.network === "eip155:8453" &&
      item.scheme === "exact" &&
      item.asset.toLowerCase() === usdc?.id.toLowerCase() &&
      item.payTo.toLowerCase() === payee?.toLowerCase() &&
      /^\d+$/u.test(item.amount) &&
      BigInt(item.amount) > 0n &&
      BigInt(item.amount) <= BigInt(DEFINITIONS[name].cap)
  );
  if (!challenge || !offer || !services.treasuryPayer) {
    throw new Error(
      "Supplier quote refused: unexpected payee, asset, network or price. No supplier payment was signed."
    );
  }
  const signed = await services.treasuryPayer.pay({
    ...challenge,
    accepts: [offer],
  });
  if (signed.header === null) {
    throw new Error(`Treasury refused: ${signed.error ?? "no signature"}`);
  }
  const headers = new Headers(init.headers);
  const payment = paymentHeaders(signed.header);
  headers.set("payment-signature", payment["payment-signature"]);
  headers.set("x-payment", payment["x-payment"]);
  // Exactly one paid attempt. A timeout is not permission to buy again.
  const response = await safeFetch(url, { ...init, headers }, outbound);
  const settlement = decodeSettlementHeader(
    settlementHeaderFrom(response.headers)
  );
  return {
    response,
    transactionId: settlement?.transactionId ?? null,
    headers,
  };
};

interface ProviderRequest {
  readonly url: string;
  readonly init: RequestInit;
}
const providerRequest = (request: PromptServiceRequest): ProviderRequest => {
  switch (request.service) {
    case "web_search": {
      return {
        url: `https://api.you.com/v1/search?${new URLSearchParams({ query: request.prompt, count: "5" })}`,
        init: {},
      };
    }
    case "image": {
      return {
        url: "https://blockrun.ai/api/v1/images/generations",
        init: post({
          model: "google/nano-banana",
          prompt: request.prompt,
          size: "1024x1024",
          n: 1,
        }),
      };
    }
    case "speech": {
      return {
        url: "https://blockrun.ai/api/v1/audio/speech",
        init: post({
          model: "elevenlabs/flash-v2.5",
          input: request.prompt,
          voice: "sarah",
          response_format: "mp3",
        }),
      };
    }
    case "inference": {
      return {
        url: "https://blockrun.ai/api/v1/chat/completions",
        init: post({
          model: "openai/gpt-4o-mini",
          messages: [{ role: "user", content: request.prompt }],
          max_tokens: 512,
        }),
      };
    }
    case "x_search": {
      throw new Error("Unsupported supplier request.");
    }
    default: {
      throw new Error("Unknown service.");
    }
  }
};

const searchX = async (
  services: Services,
  prompt: string,
  base: ServiceResult,
  outbound: OutboundOptions
): Promise<ServiceResult> => {
  const url = new URL("https://api.x.com/2/tweets/search/recent");
  url.searchParams.set("query", prompt);
  url.searchParams.set("max_results", "20");
  const response = await safeFetch(
    url.toString(),
    {
      headers: {
        authorization: `Bearer ${Redacted.value(services.environment.xApiBearer)}`,
      },
    },
    outbound
  );
  if (!response.ok) {
    throw new Error(`X API returned ${response.status}; no automatic retry.`);
  }
  const data = await readJson(response, XAnswer);
  if ((data.errors?.length ?? 0) > 0) {
    throw new Error("X API returned a partial or invalid result.");
  }
  const sources = (data.data ?? []).slice(0, 20).map((item) => ({
    title: `Post ${item.id}`,
    url: `https://x.com/i/status/${encodeURIComponent(item.id)}`,
    text: item.text.slice(0, 2000),
  }));
  return {
    ...base,
    text: `${sources.length} recent public posts. This is a bounded seven-day sample; posts are claims, not verified facts.`,
    sources,
  };
};

const pollImage = async (
  id: string,
  headers: Headers,
  outbound: OutboundOptions,
  attempts = 90
): Promise<Response> => {
  if (attempts === 0) {
    throw new Error(
      `Image job ${id} is still pending. No new purchase was made.`
    );
  }
  await Bun.sleep(3000);
  // Reuse the original authorization, never sign another paid request for the job.
  const response = await safeFetch(
    `https://blockrun.ai/api/v1/images/generations/${id}`,
    { headers },
    outbound
  );
  return response.status === 202
    ? await pollImage(id, headers, outbound, attempts - 1)
    : response;
};

const ImageMime = Schema.Literals(["image/png", "image/jpeg", "image/webp"]);
const imageArtifact = (
  base64: string,
  mime: typeof ImageMime.Type
): NonNullable<ServiceResult["artifact"]> => {
  if (!/^[A-Za-z0-9+/]+={0,2}$/u.test(base64)) {
    throw new Error("Provider returned invalid image encoding.");
  }
  const bytes = Buffer.from(base64, "base64");
  if (bytes.byteLength > 3 * 1024 * 1024) {
    throw new Error("Provider response exceeded the size limit.");
  }
  const signatures = {
    "image/png": bytes.subarray(0, 8).toString("hex") === "89504e470d0a1a0a",
    "image/jpeg": bytes.subarray(0, 3).toString("hex") === "ffd8ff",
    "image/webp":
      bytes.subarray(0, 4).toString() === "RIFF" &&
      bytes.subarray(8, 12).toString() === "WEBP",
  };
  if (!signatures[mime]) {
    throw new Error("Provider returned invalid image data.");
  }
  return { mime, base64 };
};

const imageResult = async (
  response: Response,
  base: ServiceResult,
  outbound: OutboundOptions
): Promise<ServiceResult> => {
  const answer = await readJson(response, ImageAnswer);
  const [image] = answer.data;
  if (!image) {
    throw new Error("Provider returned no image.");
  }
  if (image.b64_json !== undefined && image.b64_json !== "") {
    return {
      ...base,
      text: "Your image is ready.",
      artifact: imageArtifact(image.b64_json, "image/png"),
    };
  }
  if (image.url === undefined || image.url === "") {
    throw new Error("Provider returned no image location.");
  }
  // BlockRun falls back to a data URI when its media mirror is unavailable.
  // Decode only the supported raster formats; never fetch or render arbitrary data URLs.
  if (image.url.startsWith("data:")) {
    const inline =
      /^data:(?<mime>image\/(?:png|jpeg|webp));base64,(?<encoded>[A-Za-z0-9+/]+={0,2})$/u.exec(
        image.url
      );
    const encoded = inline?.groups?.["encoded"];
    if (encoded === undefined) {
      throw new Error("Provider returned an unsupported inline image.");
    }
    return {
      ...base,
      text: "Your image is ready.",
      artifact: imageArtifact(
        encoded,
        Schema.decodeUnknownSync(ImageMime)(inline?.groups?.["mime"])
      ),
    };
  }
  const media = await safeFetch(image.url, {}, outbound);
  const [mime] = (media.headers.get("content-type") ?? "").split(";");
  if (
    !media.ok ||
    (mime !== "image/png" && mime !== "image/jpeg" && mime !== "image/webp")
  ) {
    throw new Error("Provider returned an unsupported image.");
  }
  return {
    ...base,
    text: "Your image is ready.",
    artifact: {
      mime,
      base64: Buffer.from(await boundedBytes(media)).toString("base64"),
    },
  };
};

const providerResult = async (
  request: PromptServiceRequest,
  response: Response,
  base: ServiceResult,
  outbound: OutboundOptions
): Promise<ServiceResult> => {
  switch (request.service) {
    case "speech": {
      if (
        response.headers.get("content-type")?.startsWith("audio/mpeg") !== true
      ) {
        throw new Error("Provider did not return MP3 audio.");
      }
      return {
        ...base,
        text: "Your audio is ready.",
        artifact: {
          mime: "audio/mpeg",
          base64: Buffer.from(await boundedBytes(response)).toString("base64"),
        },
      };
    }
    case "web_search": {
      const web = await readJson(response, WebAnswer);
      return {
        ...base,
        text: "Web search results. Read the sources before relying on their claims.",
        sources: web.results.web.slice(0, 5).map((item) => ({
          title: item.title.slice(0, 300),
          url: item.url.slice(0, 2000),
          text: (item.description ?? item.snippets?.join(" ") ?? "").slice(
            0,
            2000
          ),
        })),
      };
    }
    case "inference": {
      const chat = await readJson(response, ChatAnswer);
      const text = chat.choices[0]?.message.content;
      if (text === undefined || text === "") {
        throw new Error("Provider returned no answer.");
      }
      return { ...base, text: text.slice(0, 16_000) };
    }
    case "image": {
      return await imageResult(response, base, outbound);
    }
    case "x_search": {
      throw new Error("Unexpected provider result.");
    }
    default: {
      throw new Error("Unknown service.");
    }
  }
};

export const runServiceProvider = async (
  services: Services,
  request: ServiceRequest,
  options: OutboundOptions = {},
  context?: TradingServiceContext
): Promise<ServiceResult> => {
  if ("input" in request) {
    const card = tradingCatalog(services).find(
      (entry) => entry.name === request.service
    );
    if (card?.status === "unavailable") {
      throw new Error(card.note);
    }
    preflightTrading(services, request);
    return await runTradingService(services, request, context);
  }
  const card = serviceCatalog(services).find(
    (entry) => entry.name === request.service
  );
  if (
    !card ||
    request.prompt.trim() === "" ||
    request.prompt.length > card.maxInput
  ) {
    throw new Error("Invalid service input.");
  }
  const base: ServiceResult = {
    v: 1,
    service: request.service,
    stubbed: card.status === "demo",
    text: "",
    sources: [],
    artifact: null,
    upstreamTransactionId: null,
  };
  if (card.status === "unavailable") {
    throw new Error(card.note);
  }
  if (card.status === "demo") {
    return {
      ...base,
      text: `DEMO — ${card.title}: ${request.prompt}. This is a fixture, not a provider result.`,
    };
  }
  const outbound = { ...options, maxRedirects: 0, timeoutMs: 120_000 };
  if (request.service === "x_search") {
    return await searchX(services, request.prompt, base, outbound);
  }
  const { url, init } = providerRequest(request);
  const bought = await supplier(services, request.service, url, init, outbound);
  let { response } = bought;
  if (response.status === 202 && request.service === "image") {
    const job = await readJson(response, ImageJob);
    response = await pollImage(job.id, bought.headers, outbound);
  }
  if (!response.ok || response.status === 202) {
    throw new Error(
      `Provider returned ${response.status}. Paid work was not refunded; do not automatically retry.`
    );
  }
  const settlement = decodeSettlementHeader(
    settlementHeaderFrom(response.headers)
  );
  return await providerResult(
    request,
    response,
    {
      ...base,
      upstreamTransactionId: settlement?.transactionId ?? bought.transactionId,
    },
    outbound
  );
};
