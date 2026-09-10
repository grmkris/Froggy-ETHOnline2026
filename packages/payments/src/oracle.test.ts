import { describe, expect, it } from "bun:test";

import { liveOracleGate, stubOracleGate } from "./oracle";
import { stubHederaPayer } from "./payer";
import { assess } from "./probe";
import { HBAR_ASSET, HEDERA_TESTNET, X402_VERSION } from "./types";

const resource = {
  description: "Cross-protocol USDC lending snapshot.",
  units: "5000000",
  url: "http://localhost:3001/oracle/snapshot",
};

describe("the 402 challenge", () => {
  it("is a real x402 challenge even in stub mode", () => {
    // The whole point of the stub: the *flow* — 402, build a payment, retry
    // with X-PAYMENT — is what is most likely to be wrong when a real key
    // arrives, so it has to run before one exists.
    const challenge = stubOracleGate().challenge(resource);

    expect(challenge.x402Version).toBe(X402_VERSION);
    expect(challenge.accepts[0]?.network).toBe(HEDERA_TESTNET);
    expect(challenge.accepts[0]?.scheme).toBe("exact");
    expect(challenge.accepts[0]?.amount).toBe("5000000");
  });

  it("names the resource being sold", () => {
    const challenge = stubOracleGate().challenge(resource);

    expect(challenge.resource.url).toBe(resource.url);
  });
});

describe("what the service is priced in", () => {
  it("prices in HBAR unless told otherwise", () => {
    const gate = liveOracleGate({
      facilitatorUrl: "https://api.blocky402.com",
      network: "hedera:mainnet",
      payTo: "0.0.10847556",
    });
    expect(gate.challenge(resource).accepts[0]?.asset).toBe(HBAR_ASSET);
  });

  it("puts an HTS token id in the challenge when configured with one", () => {
    // The track's extra points name HTS tokens in the settlement path. The
    // facilitator was checked on 10 Sep 2026 to accept a token payload; this
    // is the half of it that lives here — that the offer really carries the
    // token and is still a payable one.
    const gate = liveOracleGate({
      asset: "0.0.456858",
      facilitatorUrl: "https://api.blocky402.com",
      network: "hedera:mainnet",
      payTo: "0.0.10847556",
    });
    const [offer] = gate.challenge(resource).accepts;
    expect(offer?.asset).toBe("0.0.456858");
    expect(offer?.amount).toBe("5000000");
    expect(offer?.network).toBe("hedera:mainnet");
  });

  it("says which units are wrong when a token amount is not whole", () => {
    const verdict = assess(
      {
        amount: "0.5",
        asset: "0.0.456858",
        extra: { feePayer: "0.0.10571514" },
        network: "hedera:mainnet",
        payTo: "0.0.10847556",
        scheme: "exact",
      },
      { payable: ["hedera:mainnet"] }
    );
    expect(verdict.supported).toBe(false);
    expect(verdict.reason).toContain("0.0.456858's smallest units");
  });
});

describe("the stub gate", () => {
  it("refuses a payment header that is not base64 JSON", async () => {
    // Accepting anything at all would mean the client's payload construction
    // was never exercised — precisely the half a key does not fix.
    const gate = stubOracleGate();
    const [requirements] = gate.challenge(resource).accepts;
    if (requirements === undefined) {
      throw new Error(
        "A challenge must always offer at least one requirement."
      );
    }

    const settled = await gate.settle("not-base64-json", requirements);

    expect(settled.ok).toBe(false);
  });

  it("settles a well-formed payment and says that it was faked", async () => {
    const gate = stubOracleGate();
    const challenge = gate.challenge(resource);
    const [requirements] = challenge.accepts;
    if (requirements === undefined) {
      throw new Error(
        "A challenge must always offer at least one requirement."
      );
    }
    const attempt = await stubHederaPayer().pay(challenge);

    const settled = await gate.settle(attempt.header ?? "", requirements);

    expect(settled.ok).toBe(true);
    expect(settled.stubbed).toBe(true);
    // A stub must be unmistakable in the data, not only in the UI: a screenshot
    // of a stubbed run cannot be allowed to pass as a settled payment.
    expect(settled.transactionId).toContain("stub");
  });
});

describe("the stub payer", () => {
  it("builds a payload for the Hedera requirement it can satisfy", async () => {
    const challenge = stubOracleGate().challenge(resource);

    const attempt = await stubHederaPayer().pay(challenge);

    expect(attempt.stubbed).toBe(true);
    expect(attempt.requirements?.network).toBe(HEDERA_TESTNET);
    expect(attempt.header).not.toBeNull();
  });

  it("refuses a challenge with no requirement it can pay", async () => {
    const attempt = await stubHederaPayer().pay({
      accepts: [
        {
          amount: "1",
          asset: "0x0",
          network: "eip155:8453",
          payTo: "0xabc",
          scheme: "exact",
        },
      ],
    });

    expect(attempt.header).toBeNull();
    expect(attempt.error).toContain("Hedera");
  });
});
