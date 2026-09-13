/** Public discovery names authenticated funding and tools, never anonymous per-call offers. */
import { caip10, universalAgentId } from "./agent-identity";
import type { CreditFunding } from "./credit-funding";
import type { Environment } from "./environment";

const STARTED_AT = Date.now();
const DISCOVERY_HEADERS = {
  "access-control-allow-origin": "*",
  "cache-control": "public, max-age=300",
};

export interface CardDeps {
  readonly environment: Pick<
    Environment,
    "appOrigin" | "hederaNetwork" | "hederaPayTo"
  >;
  readonly services: { readonly creditFunding: Pick<CreditFunding, "methods"> };
}

export const serviceCard = (deps: CardDeps) => {
  const origin = deps.environment.appOrigin;
  return {
    v: 1,
    version: 2,
    name: "Froggy",
    description:
      "Authenticated tools paid from internal platform credits. The owner buys credits with Base USDC or native HBAR through x402.",
    authentication: {
      required: true,
      signIn: origin,
      mcp: `${origin}/mcp`,
      skill: `${origin}/skill.md`,
    },
    billing: {
      kind: "platform_credits",
      creditsPerUsd: 100,
      creditUnitUsdMicros: 1,
      transferable: false,
      ownerOnlyFunding: true,
      summaryUrl: `${origin}/api/credits`,
      purchasesUrl: `${origin}/api/credits/purchases`,
      methods: deps.services.creditFunding.methods(),
    },
    resources: [],
    source: "https://github.com/grmkris/Froggy-ETHOnline2026",
  };
};

export const discoveryDocument = (deps: CardDeps, now: number) => {
  const card = serviceCard(deps);
  const facts = {
    name: "froggy",
    nativeId: caip10(
      deps.environment.hederaNetwork,
      deps.environment.hederaPayTo
    ),
    protocol: "mcp",
    registry: "froggy",
    skills: [],
    version: "2.0.0",
  };
  return {
    v: 1,
    x402Version: 2,
    agent: { facts, id: universalAgentId(facts), standard: "HCS-14" },
    // Funding quotes are owner-specific, immutable purchases created after sign-in.
    // Publishing a generic payable resource would reintroduce anonymous selling.
    items: [],
    pagination: { limit: 0, offset: 0, total: 0 },
    lastUpdated: new Date(now).toISOString(),
    authentication: card.authentication,
    billing: card.billing,
  };
};

export const handleDiscovery = (
  deps: CardDeps,
  pathname: string
): Response | null => {
  if (pathname === "/discovery/resources") {
    return Response.json(discoveryDocument(deps, STARTED_AT), {
      headers: DISCOVERY_HEADERS,
    });
  }
  if (pathname === "/.well-known/x402.json") {
    return Response.json(serviceCard(deps), { headers: DISCOVERY_HEADERS });
  }
  return null;
};
