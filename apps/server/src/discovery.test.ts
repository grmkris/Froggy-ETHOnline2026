import { describe, expect, it } from "bun:test";

import { universalAgentId } from "./agent-identity";
import {
  discoveryDocument,
  handleDiscovery,
  serviceCard,
} from "./discovery-route";
import type { CardDeps } from "./discovery-route";

const ORIGIN = "https://froggy.test";
const deps: CardDeps = {
  environment: {
    appOrigin: ORIGIN,
    hederaNetwork: "hedera:testnet",
    hederaPayTo: "0.0.1",
  },
  services: {
    creditFunding: {
      methods: () => [
        {
          network: "eip155:8453",
          label: "Base",
          asset: "USDC",
          payTo: "treasury",
          available: false,
          reason: "Funding unavailable",
          stubbed: false,
        },
      ],
    },
  },
};

describe("authenticated credit discovery", () => {
  it("advertises account funding and MCP while removing anonymous payable resources", () => {
    const card = serviceCard(deps);
    expect(card.resources).toHaveLength(0);
    expect(card.authentication.required).toBe(true);
    expect(card.authentication.mcp).toBe(`${ORIGIN}/mcp`);
    expect(card.billing.creditsPerUsd).toBe(100);
    expect(card.billing.ownerOnlyFunding).toBe(true);
    expect(card.billing.purchasesUrl).toBe(`${ORIGIN}/api/credits/purchases`);
    expect(card.billing.methods[0]?.available).toBe(false);
  });

  it("returns an empty x402 offer list because funding quotes require the owner", () => {
    const document = discoveryDocument(deps, 1_788_733_693_000);
    expect(document.items).toHaveLength(0);
    expect(document.pagination.total).toBe(0);
    expect(document.lastUpdated).toBe("2026-09-06T22:28:13.000Z");
    expect(document.agent.id).toBe(universalAgentId(document.agent.facts));
  });

  it("allows cross-origin public discovery without publishing payment challenges", async () => {
    const response = handleDiscovery(deps, "/.well-known/x402.json");
    expect(response?.headers.get("access-control-allow-origin")).toBe("*");
    const body = await response?.text();
    expect(body).not.toContain("payment-required");
    expect(body).not.toContain("froggy-mcp.mjs");
  });
});
