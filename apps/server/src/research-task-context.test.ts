import { expect, test } from "bun:test";

import { TaskId, userId, usdMicros } from "@froggy/domain";
import type { Task } from "@froggy/domain";
import { memoryStore } from "@froggy/wallet";
import type { UIMessage } from "ai";

import { researchTaskContext } from "./research-task-context";

test("browser result handoff follows the existing card key and isolates owners", async () => {
  const store = memoryStore();
  const owner = userId("did:privy:alice");
  const other = userId("did:privy:bob");
  const task: Task = {
    id: TaskId.generate(),
    agentTokenId: null,
    connectionId: null,
    createdAt: 1,
    updatedAt: 2,
    error: "The model stream failed.",
    idempotencyKey: "browse:call-1",
    input: { instruction: "Find cat food" },
    kind: "browse",
    priceUsdMicros: usdMicros(1_000_000),
    result: { progress: { summary: "Visited two stores" } },
    runId: null,
    saleId: null,
    status: "failed",
  };
  await store.tasks.create(owner, task);
  const messages: UIMessage[] = [
    {
      id: "m1",
      role: "assistant",
      parts: [
        {
          type: "tool-browse_task",
          toolCallId: "call-1",
          input: { prompt: "Find cat food" },
          state: "output-available",
          output: "Choose a budget",
        },
      ],
    },
  ];
  const context = await researchTaskContext(store, owner, messages);
  expect(context).toContain("failed");
  expect(context).toContain("Visited two stores");
  expect(context).toContain(task.id);
  expect(await researchTaskContext(store, other, messages)).toBe("");
  expect(await researchTaskContext(store, owner, [])).toBe("");
});
