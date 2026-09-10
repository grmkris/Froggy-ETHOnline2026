import { describe, expect, it } from "bun:test";

import type { MirrorFetch } from "@froggy/payments";

import { formatAmount } from "./catalogue";
import type { DoorFetch, ServiceCard } from "./catalogue";
import { readDoor } from "./config";
import {
  buyTool,
  catalogueTool,
  receiptTool,
  resolveService,
  withArguments,
} from "./tools";
import type { ToolDeps } from "./tools";

const ORIGIN = "https://seller.example";
const ORACLE = `${ORIGIN}/oracle/snapshot`;
/** A throwaway ECDSA key. It has never held anything and never will. */
const KEY = `0x${"1".repeat(64)}`;

const CARD: ServiceCard = {
  description: "A lending snapshot.",
  facilitator: "https://api.blocky402.com",
  hcsTopic: "0.0.10847557",
  name: "Froggy lending oracle",
  resources: [
    {
      asset: "0.0.0",
      description: "GET with ?symbol=USDC.",
      method: "GET",
      network: "hedera:mainnet",
      payTo: "0.0.10847556",
      price: "5000000",
      scheme: "exact",
      url: ORACLE,
    },
  ],
  source: "https://github.com/example/froggy",
  version: 1,
};

const CHALLENGE = {
  accepts: [
    {
      amount: "5000000",
      asset: "0.0.0",
      extra: { feePayer: "0.0.10571514" },
      maxTimeoutSeconds: 120,
      network: "hedera:mainnet",
      payTo: "0.0.10847556",
      scheme: "exact",
    },
  ],
  error: "Payment required.",
  x402Version: 2,
};

const FUNDED_ENV = {
  FROGGY_HEDERA_ACCOUNT_ID: "0.0.12345",
  FROGGY_HEDERA_PRIVATE_KEY: KEY,
  FROGGY_URL: ORIGIN,
};

/** A mirror node that says the account holds exactly this many tinybars. */
const holding =
  (tinybars: number): MirrorFetch =>
  async () => {
    await Promise.resolve();
    return Response.json({ balance: { balance: tinybars } });
  };

/** A seller that answers the card, then the challenge, then `paid`. */
const seller =
  (paid: () => Response): DoorFetch =>
  async (url, init) => {
    await Promise.resolve();
    if (url.endsWith("/.well-known/x402.json")) {
      return Response.json(CARD);
    }
    return init?.headers === undefined
      ? Response.json(CHALLENGE, { status: 402 })
      : paid();
  };

const deps = (over: Partial<ToolDeps> = {}): ToolDeps => {
  const env = over.env ?? { FROGGY_URL: ORIGIN };
  return {
    door: readDoor(env),
    env,
    fetch: over.fetch ?? seller(() => Response.json({ ok: true })),
    mirror: over.mirror ?? holding(1_000_000_000),
  };
};

const text = (result: { content: readonly { text: string }[] }): string =>
  result.content[0]?.text ?? "";

describe("formatAmount", () => {
  it("reads tinybars as HBAR without rounding the number away", () => {
    expect(formatAmount("5000000", "0.0.0", "hedera:mainnet")).toBe(
      "0.05 HBAR"
    );
    expect(formatAmount("12683971", "0.0.0", "hedera:mainnet")).toBe(
      "0.12683971 HBAR"
    );
    expect(formatAmount("100000000", "0.0.0", "hedera:mainnet")).toBe("1 HBAR");
  });

  it("reads an HTS token this repository knows", () => {
    expect(formatAmount("5000000", "0.0.456858", "hedera:mainnet")).toBe(
      "5 USDC"
    );
  });

  it("keeps base units for a token nobody here knows", () => {
    expect(formatAmount("42", "0.0.999999", "hedera:mainnet")).toBe(
      "42 units of token 0.0.999999"
    );
  });
});

describe("withArguments", () => {
  it("adds query arguments and leaves a bare url alone", () => {
    expect(withArguments(ORACLE, {})).toBe(ORACLE);
    expect(withArguments(ORACLE, { symbol: "USDC" })).toBe(
      `${ORACLE}?symbol=USDC`
    );
  });
});

describe("resolveService", () => {
  it("matches a service by a word from its url", () => {
    const found = resolveService(CARD, "oracle");
    expect(found._tag).toBe("read");
  });

  it("takes a full url as itself, so any x402 resource can be bought", () => {
    const found = resolveService(CARD, "https://elsewhere.example/thing");
    expect(found._tag === "read" && found.value.url).toBe(
      "https://elsewhere.example/thing"
    );
  });

  it("refuses a name that matches nothing rather than guessing", () => {
    const found = resolveService(CARD, "weather");
    expect(found._tag === "refused" && found.reason).toContain(
      'Nothing called "weather" is for sale here'
    );
  });

  it("refuses an empty name", () => {
    expect(resolveService(CARD, "  ")._tag).toBe("refused");
  });
});

describe("froggy_catalogue", () => {
  it("renders the card with the price a person can read", async () => {
    const said = text(await catalogueTool(deps()));
    expect(said).toContain("0.05 HBAR per call on hedera:mainnet");
    expect(said).toContain("api.blocky402.com");
    expect(said).toContain("0.0.10847557");
    expect(said).toContain("needs no HBAR for gas");
  });

  it("says so when the seller has no card, rather than remembering one", async () => {
    const said = await catalogueTool(
      deps({
        fetch: async () => {
          await Promise.resolve();
          return new Response("", { status: 404 });
        },
      })
    );
    expect(said.isError).toBe(true);
    expect(text(said)).toContain("answered 404");
  });
});

describe("froggy_buy refusals", () => {
  it("refuses when no key is configured, and says nothing was simulated", async () => {
    const said = await buyTool(deps(), { service: "oracle" });
    expect(said.isError).toBe(true);
    expect(text(said)).toContain("FROGGY_HEDERA_ACCOUNT_ID");
    expect(text(said)).toContain("nothing was simulated");
  });

  it("names the shortfall in the caller's own units", async () => {
    const said = await buyTool(
      deps({ env: FUNDED_ENV, mirror: holding(1_000_000) }),
      { service: "oracle" }
    );
    expect(said.isError).toBe(true);
    expect(text(said)).toContain("This costs 0.05 HBAR");
    expect(text(said)).toContain("0.0.12345 holds 0.01 HBAR");
    expect(text(said)).toContain("You are short 0.04 HBAR");
    expect(text(said)).toContain("nothing was created on your behalf");
  });

  it("refuses a challenge on a network this door cannot pay", async () => {
    const said = await buyTool(
      deps({
        env: FUNDED_ENV,
        fetch: async (url) => {
          await Promise.resolve();
          return url.endsWith("/.well-known/x402.json")
            ? Response.json(CARD)
            : Response.json(
                {
                  accepts: [
                    {
                      amount: "10000",
                      asset: "0x8335",
                      network: "eip155:8453",
                      payTo: "0xabc",
                      scheme: "exact",
                    },
                  ],
                  x402Version: 2,
                },
                { status: 402 }
              );
        },
      }),
      { service: "oracle" }
    );
    expect(said.isError).toBe(true);
    expect(text(said)).toContain("pays on hedera:mainnet only");
    expect(text(said)).toContain("Nothing was paid");
  });

  it("blames the facilitator, not the seller, and will not substitute one", async () => {
    const said = await buyTool(
      deps({
        env: FUNDED_ENV,
        fetch: seller(() =>
          Response.json({ error: "settlement failed" }, { status: 402 })
        ),
      }),
      { service: "oracle" }
    );
    expect(said.isError).toBe(true);
    expect(text(said)).toContain("api.blocky402.com did not settle it");
    expect(text(said)).toContain("will not try a different facilitator");
    expect(text(said)).toContain("No money moved");
  });

  it("does not tell a caller to buy again while an earlier payment is open", async () => {
    const said = await buyTool(
      deps({
        env: FUNDED_ENV,
        fetch: seller(() =>
          Response.json({ status: "pending" }, { status: 409 })
        ),
      }),
      { service: "oracle" }
    );
    expect(said.isError).toBe(true);
    expect(text(said)).toContain("rather than paying twice");
  });
});

describe("froggy_buy when it works", () => {
  it("returns what was bought and how it was settled", async () => {
    const settlement = Buffer.from(
      JSON.stringify({
        network: "hedera:mainnet",
        success: true,
        transaction: "0.0.10571514@1788733693.213156813",
      }),
      "utf-8"
    ).toString("base64");
    const said = await buyTool(
      deps({
        env: FUNDED_ENV,
        fetch: seller(() =>
          Response.json(
            { answer: "Aave is cheapest" },
            { headers: { "payment-response": settlement } }
          )
        ),
      }),
      { service: "oracle" }
    );
    expect(said.isError).toBe(false);
    expect(text(said)).toContain("Paid 0.05 HBAR to 0.0.10847556");
    expect(text(said)).toContain("0.0.10571514@1788733693.213156813");
    expect(text(said)).toContain("Aave is cheapest");
  });

  it("says the money moved when the seller settles and then fails to deliver", async () => {
    const settlement = Buffer.from(
      JSON.stringify({
        network: "hedera:mainnet",
        success: true,
        transaction: "0.0.10571514@1788733693.213156813",
      }),
      "utf-8"
    ).toString("base64");
    const said = await buyTool(
      deps({
        env: FUNDED_ENV,
        fetch: seller(() =>
          Response.json(
            { settled: true },
            {
              headers: { "payment-response": settlement },
              status: 502,
            }
          )
        ),
      }),
      { service: "oracle" }
    );
    expect(said.isError).toBe(true);
    expect(text(said)).toContain("The money moved");
    expect(text(said)).toContain("do not re-buy");
  });
});

describe("froggy_receipt", () => {
  it("does not call an unseen transaction a failure", async () => {
    const said = await receiptTool(
      deps({
        mirror: async () => {
          await Promise.resolve();
          return new Response("", { status: 404 });
        },
      }),
      { settlement: "0.0.1@2.3" }
    );
    expect(said.isError).toBe(false);
    expect(text(said)).toContain("not the same as saying it failed");
  });

  it("asks for a settlement id when given none", async () => {
    const said = await receiptTool(deps(), { settlement: "  " });
    expect(said.isError).toBe(true);
    expect(text(said)).toContain("Give a settlement id");
  });
});
