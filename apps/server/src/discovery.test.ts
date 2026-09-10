/**
 * The two documents a stranger's agent reads before it decides to pay us.
 *
 * `/.well-known/x402.json` is our own card; `/discovery/resources` is the
 * standard listing a directory reads. Neither had a test, and the listing was
 * publishing requirements that could not be paid from — it dropped
 * `extra.feePayer`, which is the one field a Hedera exact payment cannot be
 * built without, so anything consuming the listing rather than re-fetching the
 * live 402 would have been stuck.
 *
 * `assess` is the repository's own answer to "could a buyer pay this?", so it
 * is what these assert against rather than a list of field names.
 */

import { describe, expect, it } from "bun:test";

import { assess, liveOracleGate } from "@froggy/payments";

import { universalAgentId } from "./agent-identity";
import { discoveryDocument, serviceCard } from "./router";
import type { CardDeps } from "./router";

const ORIGIN = "https://froggy.test";
const FEE_PAYER = "0.0.10571514";

const deps = (): CardDeps => {
  const oracle = liveOracleGate({
    facilitatorUrl: "https://api.blocky402.com",
    network: "hedera:mainnet",
    payTo: "0.0.10847556",
  });
  return {
    environment: {
      appOrigin: ORIGIN,
      hederaFacilitatorUrl: "https://api.blocky402.com",
      hederaHcsTopicId: "0.0.10847557",
      hederaNetwork: "hedera:mainnet",
      hederaPayTo: "0.0.10847556",
    },
    oracleUrl: `${ORIGIN}/oracle/snapshot`,
    // The live gate learns its fee payer from the facilitator at boot. Nothing
    // here reaches the network, so it is supplied the way boot would have.
    services: {
      oracle: {
        challenge: (resource) => {
          const issued = oracle.challenge(resource);
          return {
            ...issued,
            accepts: issued.accepts.map((accept) => ({
              ...accept,
              extra: { feePayer: FEE_PAYER },
            })),
          };
        },
      },
    },
  };
};

describe("the service card", () => {
  it("carries every field a buyer needs to build the payment", () => {
    const [first] = serviceCard(deps()).resources;
    expect(first?.extra).toEqual({ feePayer: FEE_PAYER });
    expect(first?.maxTimeoutSeconds).toBeGreaterThan(0);
    expect(first?.price).toBe("5000000");
  });

  it("points at the door under the name Node will actually run", () => {
    const card = serviceCard(deps());
    expect(card.agentDoor.url).toBe(`${ORIGIN}/froggy-mcp.mjs`);
    expect(card.agentDoor.install).toContain("node ./froggy-mcp.mjs");
  });

  it("lists the two paid resources, each with its own media type", () => {
    const card = serviceCard(deps());
    expect(card.resources).toHaveLength(2);
    expect(card.resources.map((row) => row.mimeType)).toEqual([
      "application/json",
      "text/html",
    ]);
  });
});

describe("the discovery listing", () => {
  it("publishes requirements this repository's own buyer would accept", () => {
    const document = discoveryDocument(deps(), 1_788_733_693_000);
    expect(document.items.length).toBeGreaterThan(0);
    for (const item of document.items) {
      for (const accept of item.accepts) {
        // Widened only to hand it over: `assess` takes an open `extra`, and
        // the card publishes the one member the scheme defines.
        const verdict = assess(
          { ...accept, extra: { ...accept.extra } },
          { payable: ["hedera:mainnet"] }
        );
        expect(verdict.reason).toBeNull();
        expect(verdict.supported).toBe(true);
      }
    }
  });

  it("names the resource on the offer, not only beside it", () => {
    const [item] = discoveryDocument(deps(), 0).items;
    expect(item?.accepts[0]?.resource).toBe(item?.resource);
    expect(item?.x402Version).toBe(2);
  });

  it("reports when the offer last changed, not when it was asked", () => {
    const first = discoveryDocument(deps(), 1_788_733_693_000);
    const second = discoveryDocument(deps(), 1_788_733_693_000);
    expect(first.items[0]?.lastUpdated).toBe(
      second.items[0]?.lastUpdated ?? ""
    );
    expect(first.items[0]?.lastUpdated).toBe("2026-09-06T22:28:13.000Z");
  });

  it("carries an HCS-14 identifier a reader can recompute from the facts beside it", () => {
    const document = discoveryDocument(deps(), 0);
    expect(document.agent.standard).toBe("HCS-14");
    expect(document.agent.id).toBe(universalAgentId(document.agent.facts));
    expect(document.agent.id).toStartWith("uaid:aid:");
    expect(document.agent.facts.nativeId).toBe("hedera:mainnet:0.0.10847556");
  });
});
