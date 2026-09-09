# TanStack AI compatibility evaluation

9 September 2026. Isolated Bun fixture; no provider calls or money movements.

Decision: retain AI SDK 7 for persistent history. A failing ingress write did not stop model/tool execution in the installed persistence middleware. Froggy requires that gate before any such execution, so replacing the engine does not remove the application-owned lifecycle boundary.

| Gate | Result |
| --- | --- |
| Effect validation and JSON Schema without application Zod | Passed |
| Synthetic tool output and text round trip | Passed |
| Stable IDs across repeated hydration | Passed |
| Explicitly denied hydration | HTTP 403 |
| Failed ingress persistence prevents execution | Failed: two adapter calls and one synthetic tool call followed the injected failure |
| Actual Anthropic and OpenAI-compatible adapters | Not established; no migration approved |
| Fresh auth, disconnect/Stop, simultaneous tabs, process death, interrupts, source caps and financial parity in a replacement engine | Not established; retained application engine owns these boundaries |

The failure is an incompatibility with Froggy's required default, not a claim that TanStack AI cannot support an application gate. Installed `@tanstack/ai-persistence/src/middleware.ts` documents its eager pending-turn save as best effort and nonempty input as a full transcript replacement. Integration would need explicit canonical-history and fail-closed ingress adapters in addition to the package.

Reproduce in an empty temporary directory with Bun, using this exact dependency set:

```json
{
  "name": "froggy-history-ai-spike",
  "private": true,
  "type": "module",
  "dependencies": {
    "@tanstack/ai": "0.53.0",
    "@tanstack/ai-react": "0.24.0",
    "@tanstack/ai-persistence": "0.5.6",
    "effect": "4.0.0-rc.112",
    "typescript": "7.0.2"
  },
  "devDependencies": {
    "@types/bun": "1.4.1"
  }
}
```

Save as `package.json`, run `bun install`, save the fixture below as `spike.ts`, and run `bun spike.ts`. The fixture also passes `bunx --bun tsc --noEmit --strict --skipLibCheck --target esnext --module esnext --moduleResolution bundler spike.ts`.

```typescript
import assert from "node:assert/strict";
import { EventType } from "@ag-ui/core";
import type { AdapterYieldChunk } from "@tanstack/ai";
import { chat, toolDefinition } from "@tanstack/ai";
import type { TextAdapter } from "@tanstack/ai/adapters";
import {
  memoryPersistence,
  withPersistence,
  reconstructChat,
} from "@tanstack/ai-persistence";
import { Schema } from "effect";

const input = Schema.Struct({ query: Schema.String });
const validator = Schema.toStandardSchemaV1(input);
const json = Schema.toStandardJSONSchemaV1(input);
const standard = {
  ...validator,
  "~standard": {
    ...validator["~standard"],
    jsonSchema: json["~standard"].jsonSchema,
  },
};
assert.equal(
  standard["~standard"].jsonSchema.input({ target: "draft-07" }).type,
  "object"
);
assert.ok((await standard["~standard"].validate({ query: 1 })).issues);
let effects = 0;
const lookup = toolDefinition({
  name: "lookup",
  description: "Read synthetic evidence",
  inputSchema: standard,
}).server(async ({ query }) => {
  effects += 1;
  return { title: query, receiptId: "synthetic-receipt", paid: false };
});
let calls = 0;
const adapter: TextAdapter<
  "synthetic",
  Record<string, never>,
  readonly ["text"],
  {
    text: unknown;
    image: unknown;
    audio: unknown;
    video: unknown;
    document: unknown;
  },
  readonly string[],
  unknown,
  undefined
> = {
  kind: "text",
  name: "synthetic",
  model: "synthetic",
  "~types": {
    providerOptions: {},
    inputModalities: ["text"],
    messageMetadataByModality: {
      text: undefined,
      image: undefined,
      audio: undefined,
      video: undefined,
      document: undefined,
    },
    toolCapabilities: [],
    toolCallMetadata: undefined,
    systemPromptMetadata: undefined,
  },
  async *chatStream(options): AsyncGenerator<AdapterYieldChunk> {
    calls += 1;
    const hasTool = options.messages.some((message) => message.role === "tool");
    if (!hasTool) {
      yield {
        type: EventType.TOOL_CALL_START,
        toolCallId: "call-1",
        toolCallName: "lookup",
        parentMessageId: "assistant-1",
      };
      yield {
        type: EventType.TOOL_CALL_ARGS,
        toolCallId: "call-1",
        delta: '{"query":"Saved evidence"}',
      };
      yield { type: EventType.TOOL_CALL_END, toolCallId: "call-1" };
      yield {
        type: EventType.RUN_FINISHED,
        threadId: options.threadId ?? "thread",
        runId: options.runId ?? "run",
        finishReason: "tool_calls",
      };
      return;
    }
    yield {
      type: EventType.TEXT_MESSAGE_START,
      messageId: "assistant-2",
      role: "assistant",
    };
    yield {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: "assistant-2",
      delta: "Saved answer with synthetic-receipt.",
    };
    yield { type: EventType.TEXT_MESSAGE_END, messageId: "assistant-2" };
    yield {
      type: EventType.RUN_FINISHED,
      threadId: options.threadId ?? "thread",
      runId: options.runId ?? "run",
      finishReason: "stop",
    };
  },
  async structuredOutput() {
    return { data: {}, rawText: "{}" };
  },
};
const persistence = memoryPersistence();
const drain = async (threadId: string, engine = persistence) => {
  const chunks = [];
  for await (const chunk of chat({
    adapter,
    threadId,
    runId: `${threadId}-run`,
    messages: [{ id: "user-1", role: "user", content: "Find the evidence" }],
    tools: [lookup],
    middleware: [withPersistence(engine)],
  })) {
    chunks.push(chunk);
  }
  return chunks;
};
const chunks = await drain("round-trip");
assert.equal(effects, 1);
assert.ok(chunks.some((chunk) => chunk.type === "TEXT_MESSAGE_CONTENT"));
const stored = await persistence.stores.messages.loadThread("round-trip");
assert.ok(JSON.stringify(stored).includes("synthetic-receipt"));
const reconstructed = await reconstructChat(
  persistence,
  new Request("https://fixture.test?threadId=round-trip"),
  { authorize: () => true }
);
const first = await reconstructed.json();
const second = await (
  await reconstructChat(
    persistence,
    new Request("https://fixture.test?threadId=round-trip"),
    { authorize: () => true }
  )
).json();
assert.deepEqual(
  first.messages.map((message: { id: string }) => message.id),
  second.messages.map((message: { id: string }) => message.id)
);
const denied = await reconstructChat(
  persistence,
  new Request("https://fixture.test?threadId=round-trip"),
  { authorize: () => false }
);
assert.equal(denied.status, 403);
const failure = memoryPersistence();
const save = failure.stores.messages.saveThread.bind(failure.stores.messages);
let writes = 0;
failure.stores.messages.saveThread = async (thread, messages) => {
  writes += 1;
  if (writes === 1) {
    throw new Error("injected ingress write failure");
  }
  await save(thread, messages);
};
const callsBefore = calls;
const effectsBefore = effects;
await drain("failed-ingress", failure);
assert.ok(
  calls > callsBefore,
  "The installed middleware proceeds after the pending-turn save fails"
);
assert.equal(
  effects,
  effectsBefore + 1,
  "The synthetic tool executes after the failed ingress write"
);
console.log(
  JSON.stringify(
    {
      versions: {
        ai: "0.53.0",
        persistence: "0.5.6",
        react: "0.24.0",
        effect: "4.0.0-rc.112",
      },
      effectValidation: "passed",
      jsonSchema: "passed",
      toolTextRoundTrip: "passed",
      stableHydrationIds: "passed",
      unauthorizedHydration: "403",
      failedIngress: {
        modelCallsAfterFailure: calls - callsBefore,
        syntheticToolCallsAfterFailure: effects - effectsBefore,
      },
      decision:
        "Retain AI SDK 7: durable ingress requires application-owned gate even with persistence middleware.",
    },
    null,
    2
  )
);
```

Observed output:

```json
{
  "versions": {
    "ai": "0.53.0",
    "persistence": "0.5.6",
    "react": "0.24.0",
    "effect": "4.0.0-rc.112"
  },
  "effectValidation": "passed",
  "jsonSchema": "passed",
  "toolTextRoundTrip": "passed",
  "stableHydrationIds": "passed",
  "unauthorizedHydration": "403",
  "failedIngress": {
    "modelCallsAfterFailure": 2,
    "syntheticToolCallsAfterFailure": 1
  },
  "decision": "Retain AI SDK 7: durable ingress requires application-owned gate even with persistence middleware."
}
```
