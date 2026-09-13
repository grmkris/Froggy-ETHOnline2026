import { describe, expect, test } from "bun:test";

import { Cause, ConfigProvider, Effect, Exit } from "effect";

import {
  loadEnvironment,
  refuseStubbedBoot,
  selectModelProvider,
  stubbedNames,
} from "./environment";

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

const STUB_TRADING = {
  ensoMode: "stub",
  jupiterMode: "stub",
  ponsMode: "unavailable",
  pumpMode: "unavailable",
  uniswapMode: "stub",
} as const;

describe("refuseStubbedBoot", () => {
  test("allows stub adapters on loopback", () => {
    expect(() => {
      refuseStubbedBoot("http://localhost:3000", ["birdeye", "hedera"]);
    }).not.toThrow();
  });

  test("allows a public origin when nothing is stubbed", () => {
    expect(() => {
      refuseStubbedBoot("https://app.example.com", []);
    }).not.toThrow();
  });

  test("refuses a public origin that would still attach a stub", () => {
    expect(() => {
      refuseStubbedBoot("https://app.example.com", ["birdeye", "pons"]);
    }).toThrow(
      /Refusing to boot with stub adapters on https:\/\/app\.example\.com: birdeye, pons/u
    );
  });
});

describe("loadEnvironment", () => {
  test("configures both real stream adapters automatically from the Pinax credential", async () => {
    const environment = await Effect.runPromise(
      loadEnvironment().pipe(
        Effect.provideService(
          ConfigProvider.ConfigProvider,
          ConfigProvider.fromUnknown({ PINAX_API_KEY: "test-pinax-credential" })
        )
      )
    );
    expect(environment.walletStream.mode).toBe("live");
    expect(environment.walletStream.robinhood.mode).toBe("live");
    expect(environment.walletStream.endpoint).toBe(
      "https://base.substreams.pinax.network:443"
    );
    expect(environment.walletStream.robinhood.endpoint).toBe(
      "https://robinhood.substreams.pinax.network:443"
    );
  });

  for (const credential of ["", "REPLACE_ME_PINAX_API_KEY"]) {
    test(`keeps credential-free loopback streams explicitly simulated (${credential || "empty"})`, async () => {
      const environment = await Effect.runPromise(
        loadEnvironment().pipe(
          Effect.provideService(
            ConfigProvider.ConfigProvider,
            ConfigProvider.fromUnknown({ PINAX_API_KEY: credential })
          )
        )
      );
      expect(environment.walletStream.mode).toBe("stub");
      expect(environment.walletStream.robinhood.mode).toBe("stub");
    });
  }

  test("refuses a public origin that would still attach stub adapters", async () => {
    const result = await Effect.runPromiseExit(
      loadEnvironment().pipe(
        Effect.provideService(
          ConfigProvider.ConfigProvider,
          ConfigProvider.fromUnknown({
            APP_ORIGIN: "https://app.example.com",
          })
        )
      )
    );
    if (!Exit.isFailure(result)) {
      throw new Error("expected boot refusal");
    }
    const rendered = Cause.pretty(result.cause);
    expect(rendered).toContain(
      "Refusing to boot with stub adapters on https://app.example.com"
    );
    expect(rendered).toContain("birdeye");
    expect(rendered).not.toContain("pons");
    expect(rendered).not.toContain("pump");
  });
});

describe("stubbedNames", () => {
  test("names header stubs and execution stubs, not unavailable venues", () => {
    expect(
      stubbedNames(
        {
          birdeye: "stub",
          browser: "live",
          database: "live",
          graph: "live",
          hedera: "live",
          model: "live",
          privy: "live",
          quicknode: "live",
          telegram: "live",
          uniswap: "live",
        },
        STUB_TRADING
      )
    ).toEqual(["birdeye", "enso", "jupiter", "uniswapExecution"]);
  });
});
