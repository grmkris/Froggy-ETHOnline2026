import { describe, expect, test } from "bun:test";

import { APICallError, InvalidToolInputError } from "ai";

import { streamErrorText } from "./turn";

describe("streamErrorText", () => {
  test("a refused tool input names the tool, the path and the validator's complaint", () => {
    const text = streamErrorText(
      new InvalidToolInputError({
        toolName: "schedule",
        toolInput: '{"when":"{\\"_tag\\":\\"in\\",\\"minutes\\":\\"5\\"}"}',
        cause: {
          cause: [
            {
              message: "Expected number, got string",
              path: ["when", "minutes"],
            },
            { message: "Missing key", path: [{ key: "action" }] },
          ],
        },
      })
    );
    expect(text).toBe(
      "Invalid arguments for schedule: when.minutes: Expected number, got string; action: Missing key. Fix them and call the tool again."
    );
  });

  test("a refused input without readable issues keeps the SDK's message", () => {
    const text = streamErrorText(
      new InvalidToolInputError({
        toolName: "notify",
        toolInput: "{}",
        cause: new Error("text is required"),
      })
    );
    expect(text).toContain(
      "Invalid arguments for notify: Invalid input for tool notify:"
    );
    expect(text).toContain("text is required");
  });

  test("a tool's own refusal is kept, capped", () => {
    expect(
      streamErrorText(
        new Error(
          "Refused by policy (per_tx_cap_exceeded): $5 is over the $1 cap."
        )
      )
    ).toBe("Refused by policy (per_tx_cap_exceeded): $5 is over the $1 cap.");
    expect(streamErrorText(new Error("x".repeat(2000)))).toHaveLength(1001);
  });

  test("a provider failure and a non-error stay generic", () => {
    expect(
      streamErrorText(
        new APICallError({
          message: "Failed to process error response",
          url: "https://dashscope.example/v1",
          requestBodyValues: {},
          statusCode: 500,
          responseBody: '{"secret":"body"}',
        })
      )
    ).toBe("Froggy didn't answer that one. Send it again.");
    expect(streamErrorText("boom")).toBe("An error occurred.");
  });
});
