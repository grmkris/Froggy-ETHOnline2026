/**
 * Which model the agent runs on, and what happens when there is no key.
 *
 * Three tiers, chosen in `environment.ts` by `selectModelProvider`:
 *
 *   1. Any OpenAI-compatible endpoint, when its key, base URL and model id are
 *      all set. This deployment runs on DashScope's compatible mode.
 *   2. Anthropic, when `ANTHROPIC_API_KEY` is real.
 *   3. A scripted model, when neither is configured.
 *
 * Tier 3 is not a mock in the testing sense. It emits real tool calls, so the
 * tool loop — Graph, credit balances, services and wallet controls —
 * executes exactly as it will with a live model. What it cannot do is *decide*,
 * so it follows a fixed script and says so. That distinction is why it is worth
 * having: the parts most likely to be wrong are the ones a scripted run still
 * exercises.
 */

import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type {
  LanguageModelV3Prompt,
  LanguageModelV3StreamPart,
} from "@ai-sdk/provider";
import type { LanguageModel } from "ai";
import { convertArrayToReadableStream, MockLanguageModelV3 } from "ai/test";

import type { Environment } from "./environment";

const ANTHROPIC_MODEL = "claude-opus-5";

/** The scripted model consumes no model tokens. Tools report their own charges. */
const NO_USAGE = {
  inputTokens: {
    cacheRead: undefined,
    cacheWrite: undefined,
    noCache: undefined,
    total: 0,
  },
  outputTokens: { reasoning: undefined, text: undefined, total: 0 },
} as const;

const userText = (prompt: LanguageModelV3Prompt): string => {
  const message = prompt.findLast((entry) => entry.role === "user");
  if (message?.role !== "user") {
    return "";
  }
  return message.content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join(" ");
};

/** A service purchase needs an explicit request even when the model is scripted. */
const SERVICE_REQUEST =
  /^(?:please\s+)?buy\s+(?:a\s+)?(?<service>web[_ ]search|x[_ ]search|image|inference|speech)(?:\s+service)?(?:\s|:|$)/iu;

const script = (
  prompt: LanguageModelV3Prompt,
  idempotencyKey: string
): readonly { readonly args: string; readonly tool: string }[] => {
  const text = userText(prompt);
  const service = SERVICE_REQUEST.exec(text)?.groups?.["service"];
  if (service !== undefined) {
    return [
      { args: '{"symbol":"USDC"}', tool: "graph_query" },
      {
        args: JSON.stringify({
          service: service.toLowerCase().replace(" ", "_"),
          prompt: text.slice(0, 2000),
          idempotencyKey,
        }),
        tool: "service_run",
      },
      { args: "{}", tool: "credits_balance" },
    ];
  }
  return [
    { args: '{"symbol":"USDC"}', tool: "graph_query" },
    { args: "{}", tool: "credits_balance" },
    { args: "{}", tool: "wallet_status" },
  ];
};

/**
 * What the scripted model says when the script is spent, as markdown, in the
 * pieces a live model would stream it in. The chat renders markdown while it
 * arrives, so a keyless run must hand it a heading, a table and a code span
 * mid-flight — that is how the renderer is exercised without a key.
 */
const CLOSING: readonly string[] = [
  "**That is as far as the scripted model goes.** It requested three free reads. Their tool results show what was available:\n\n",
  "| Step | Tool | Requested read |\n| --- | --- | --- |\n| 1 | `graph_query` | USDC lending data |\n| 2 | `credits_balance` | Available and held platform credits |\n",
  "| 3 | `wallet_status` | Wallet balances and spending controls |\n\nSet `OPENAI_COMPATIBLE_API_KEY`, `OPENAI_COMPATIBLE_BASE_URL` and `OPENAI_COMPATIBLE_MODEL` (or `ANTHROPIC_API_KEY`) for a model that can reason about the results.",
];
const SERVICE_CLOSING = [
  "**The scripted service request has finished.** The service tool result shows whether the request was accepted or refused and whether its credits are held, captured or returned. A pending task still needs its result checked. The balance read shows the latest available and held credits.",
];
const SEND_CLOSING = [
  "**The scripted transfer request has finished.** Its tool result and wallet receipt show the approval outcome and whether any transfer completed. This demo does not infer success from a request being sent.",
];

/** Explicit merchant purchases still use wallet authority, never platform credits. */
const purchaseUrlFrom = (
  prompt: LanguageModelV3Prompt,
  oracleUrl: string
): string | null => {
  const { origin } = new URL(oracleUrl);
  const text = userText(prompt);
  const explicitPurchase = /^buy\s/iu.test(text);
  const candidates = text.match(/https?:\/\/[^\s<>"`]+/gu) ?? [];
  return (
    candidates.find(
      (candidate) =>
        URL.canParse(candidate) &&
        (explicitPurchase ||
          (new URL(candidate).origin === origin &&
            new URL(candidate).pathname === "/demo/x402/report"))
    ) ?? null
  );
};

const SEND =
  /send\s+(?<amount>[\d.]+)\s+usdc\s+to\s+(?<to>0x[a-fA-F0-9]{40})/iu;

/** A typed send, so the scripted model can exercise `wallet_send` without a key. */
const sendFrom = (
  prompt: LanguageModelV3Prompt
): { readonly amountUsd: number; readonly to: string } | null => {
  const match = SEND.exec(userText(prompt));
  if (match === null) {
    return null;
  }
  const amountUsd = Number(match.groups?.["amount"]);
  const to = match.groups?.["to"];
  if (!Number.isFinite(amountUsd) || amountUsd <= 0 || to === undefined) {
    return null;
  }
  return { amountUsd, to };
};
const URL_CLOSING = [
  "**The scripted URL request has finished.** Its tool result shows the approval outcome, delivered content and any receipt. This demo does not interpret the report. Configure a model key for a conversational summary.",
];

const BARE_ADDRESS = /^\s*(?<address>0x[a-fA-F0-9]{40})\s*$/u;
/**
 * A bare address paste is the case the free lookup exists for, so the
 * scripted model does what the instructions ask a real one to do: one free
 * read, no purchase, then ask what the person wants to know.
 */
const bareAddressFrom = (prompt: LanguageModelV3Prompt): string | null =>
  BARE_ADDRESS.exec(userText(prompt))?.groups?.["address"] ?? null;
const ADDRESS_CLOSING = [
  "**The scripted model looked the address up and bought nothing.** The card above says whether it is a wallet or a contract and what it holds on each configured network. What would you like to know about it?",
];

const scriptedModel = (oracleUrl: string): LanguageModel => {
  const idempotencyKey = `scripted-service:${crypto.randomUUID()}`;
  return new MockLanguageModelV3({
    doStream: async ({ prompt }) => {
      // The SDK's `doStream` returns a promise and a scripted turn has nothing
      // to await, so the first statement makes the contract honest rather than
      // the signature a lie.
      await Promise.resolve();
      // Count the tool results already in the transcript to decide where in the
      // script we are. Stateless, so a resumed or replayed turn lands correctly.
      const recent = prompt.slice(
        Math.max(
          0,
          prompt.findLastIndex((message) => message.role === "user")
        )
      );
      const completed = recent.filter(
        (message) =>
          message.role === "tool" ||
          (message.role === "assistant" &&
            message.content.some((part) => part.type === "tool-call"))
      ).length;
      const purchaseUrl = purchaseUrlFrom(recent, oracleUrl);
      const send = sendFrom(recent);
      const address = bareAddressFrom(recent);
      let steps: readonly { readonly args: string; readonly tool: string }[];
      if (address !== null) {
        steps = [{ args: JSON.stringify({ address }), tool: "address_lookup" }];
      } else if (send !== null) {
        steps = [
          {
            args: JSON.stringify({
              amountUsd: send.amountUsd,
              purpose: "a transfer the person asked for",
              to: send.to,
            }),
            tool: "wallet_send",
          },
          { args: "{}", tool: "wallet_status" },
        ];
      } else if (purchaseUrl === null) {
        steps = script(recent, idempotencyKey);
      } else {
        steps = [
          {
            args: JSON.stringify({
              url: purchaseUrl,
              purpose: "Read the USDC lending report",
              maxUsdMicros: 50_000,
            }),
            tool: "x402_fetch",
          },
          { args: "{}", tool: "wallet_status" },
        ];
      }
      const step = steps[Math.floor(completed / 2)];
      let closing = purchaseUrl === null ? CLOSING : URL_CLOSING;
      if (address !== null) {
        closing = ADDRESS_CLOSING;
      } else if (send !== null) {
        closing = SEND_CLOSING;
      } else if (steps.some((entry) => entry.tool === "service_run")) {
        closing = SERVICE_CLOSING;
      }

      const parts: LanguageModelV3StreamPart[] =
        step === undefined
          ? closing.map((delta) => ({
              delta,
              id: "text-1",
              type: "text-delta" as const,
            }))
          : [
              {
                input: step.args,
                toolCallId: `scripted-${completed}`,
                toolName: step.tool,
                type: "tool-call",
              },
            ];

      return {
        stream: convertArrayToReadableStream<LanguageModelV3StreamPart>([
          { id: "text-1", type: "text-start" as const },
          ...parts,
          { id: "text-1", type: "text-end" as const },
          {
            finishReason: {
              raw: undefined,
              unified:
                step === undefined
                  ? ("stop" as const)
                  : ("tool-calls" as const),
            },
            type: "finish" as const,
            usage: NO_USAGE,
          },
        ]),
      };
    },
  });
};

export const createModel = (
  environment: Environment,
  options: { readonly oracleUrl: string }
): LanguageModel => {
  switch (environment.modelProvider) {
    case "openai-compatible": {
      return createOpenAICompatible({
        apiKey: environment.openAiCompatibleApiKey,
        baseURL: environment.openAiCompatibleBaseUrl,
        name: "openai-compatible",
      })(environment.openAiCompatibleModel);
    }
    case "anthropic": {
      return createAnthropic({ apiKey: environment.anthropicApiKey })(
        ANTHROPIC_MODEL
      );
    }
    case "stub": {
      return scriptedModel(options.oracleUrl);
    }
    default: {
      return scriptedModel(options.oracleUrl);
    }
  }
};
