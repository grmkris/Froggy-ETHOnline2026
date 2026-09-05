import { describe, expect, test } from "bun:test";

import { selectModelProvider } from "./environment";

const PLACEHOLDER_ANTHROPIC = "sk-ant-REPLACE_ME";
const compatible = {
  openAiCompatibleApiKey: "sk-dashscope",
  openAiCompatibleBaseUrl:
    "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
  openAiCompatibleModel: "qwen3-max",
};
const noCompatible = {
  openAiCompatibleApiKey: "",
  openAiCompatibleBaseUrl: "",
  openAiCompatibleModel: "",
};

describe("selectModelProvider", () => {
  test("is the scripted model when nothing is configured", () => {
    expect(
      selectModelProvider({
        anthropicApiKey: PLACEHOLDER_ANTHROPIC,
        ...noCompatible,
      })
    ).toBe("stub");
  });

  test("uses the compatible endpoint even while the Anthropic placeholder is present", () => {
    // The regression: the placeholder starts with `sk-ant-`, and a check on the
    // key's shape built an Anthropic client around it.
    expect(
      selectModelProvider({
        anthropicApiKey: PLACEHOLDER_ANTHROPIC,
        ...compatible,
      })
    ).toBe("openai-compatible");
  });

  test("uses Anthropic when only its key is real", () => {
    expect(
      selectModelProvider({ anthropicApiKey: "sk-ant-real", ...noCompatible })
    ).toBe("anthropic");
  });

  test("prefers the compatible endpoint when both are configured", () => {
    expect(
      selectModelProvider({ anthropicApiKey: "sk-ant-real", ...compatible })
    ).toBe("openai-compatible");
  });

  test("does not count a half-configured compatible endpoint", () => {
    expect(
      selectModelProvider({
        anthropicApiKey: PLACEHOLDER_ANTHROPIC,
        ...compatible,
        openAiCompatibleModel: "",
      })
    ).toBe("stub");
  });
});
