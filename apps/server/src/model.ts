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
 * whole loop — browser, Graph, the 402, the policy, the ledger, the receipt —
 * executes exactly as it will with a live model. What it cannot do is *decide*,
 * so it follows a fixed script and says so. That distinction is why it is worth
 * having: the parts most likely to be wrong are the ones a scripted run still
 * exercises.
 */

import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModelV3StreamPart } from "@ai-sdk/provider";
import type { LanguageModel } from "ai";
import { convertArrayToReadableStream, MockLanguageModelV3 } from "ai/test";

import type { Environment } from "./environment";

const ANTHROPIC_MODEL = "claude-opus-5";

/** The scripted model genuinely spends nothing, so every counter is zero. */
const NO_USAGE = {
  inputTokens: {
    cacheRead: undefined,
    cacheWrite: undefined,
    noCache: undefined,
    total: 0,
  },
  outputTokens: { reasoning: undefined, text: undefined, total: 0 },
} as const;

/**
 * The scripted turn.
 *
 * Deliberately the shape of the demo: look at the data, pay for the packed
 * answer, then read the wallet. Running it end to end without a key is the
 * cheapest way to find out that, say, the idempotency key is wrong — and the
 * paid step is the one that reaches the policy engine, the ledger and the
 * receipt, so a keyless run exercises the whole spend path rather than
 * stopping just short of it.
 */
const script = (
  oracleUrl: string
): readonly { readonly args: string; readonly tool: string }[] => [
  { args: '{"symbol":"USDC"}', tool: "graph_query" },
  { args: JSON.stringify({ url: oracleUrl }), tool: "x402_fetch" },
  { args: "{}", tool: "wallet_status" },
];

const scriptedModel = (oracleUrl: string): LanguageModel =>
  new MockLanguageModelV3({
    doStream: async ({ prompt }) => {
      // The SDK's `doStream` returns a promise and a scripted turn has nothing
      // to await, so the first statement makes the contract honest rather than
      // the signature a lie.
      await Promise.resolve();
      // Count the tool results already in the transcript to decide where in the
      // script we are. Stateless, so a resumed or replayed turn lands correctly.
      const completed = prompt.filter(
        (message) =>
          message.role === "tool" ||
          (message.role === "assistant" &&
            message.content.some((part) => part.type === "tool-call"))
      ).length;
      const step = script(oracleUrl)[Math.floor(completed / 2)];

      const parts: LanguageModelV3StreamPart[] =
        step === undefined
          ? [
              {
                delta:
                  "That is as far as the scripted model goes. Set OPENAI_COMPATIBLE_API_KEY, OPENAI_COMPATIBLE_BASE_URL and OPENAI_COMPATIBLE_MODEL (or ANTHROPIC_API_KEY) for a model that can actually reason about this.",
                id: "text-1",
                type: "text-delta",
              },
            ]
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
