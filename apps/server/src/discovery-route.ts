/**
 * The two public discovery documents, and the routes that serve them.
 *
 * `/.well-known/x402.json` is our own card; `/discovery/resources` is the
 * standard listing a directory reads. Both are built from the same challenge
 * as the 402 itself, so none of the three can drift apart. The service card
 * predates the agent door and stays even if the door goes.
 *
 * Both carry `access-control-allow-origin: *`, because the readers these exist
 * for are directories and other people's agents, some of which run in a
 * browser. A listing nobody outside this origin may read is a listing that
 * does not do the one thing it is for. Neither route reads a credential, so
 * there is nothing here for a cross-origin reader to borrow.
 */
import type { OracleGate } from "@froggy/payments";
import { Schema } from "effect";

import { caip10, universalAgentId } from "./agent-identity";
import type { Environment } from "./environment";
import { PRICE_TINYBARS } from "./oracle-route";
import { X402_DEMO_REPORT_PATH } from "./x402-demo";

/**
 * When this deployment's offer last changed, as far as it can honestly say.
 *
 * The prices and resources are fixed at boot, so the process start is the
 * truthful answer for `lastUpdated`. Reading the clock per request would tell
 * every directory that the listing had just moved, every time it asked.
 */
const STARTED_AT = Date.now();

/** The two public discovery documents are meant to be read from anywhere. */
const DISCOVERY_HEADERS = {
  "access-control-allow-origin": "*",
  "cache-control": "public, max-age=300",
};

/** The Hedera exact scheme's own `extra`: who pays the network fee. */
interface ChallengeExtra {
  readonly feePayer?: string;
}

interface ServiceCard {
  /**
   * Where an outside agent gets the tool that buys these. Not an x402 field;
   * it sits beside `facilitator` and `hcsTopic` for the same reason those do,
   * which is that an agent that finds this card should be able to find
   * everything it needs from here without being told.
   */
  readonly agentDoor: {
    readonly install: string;
    readonly url: string;
  };
  readonly description: string;
  readonly facilitator: string;
  readonly hcsTopic: string | null;
  readonly name: string;
  readonly resources: readonly {
    readonly asset: string;
    readonly description: string;
    /**
     * Carried verbatim from the challenge. Hedera's exact scheme names the
     * facilitator here, and a buyer that has only this card cannot build a
     * payment without it. Typed as the one member the scheme requires rather
     * than an open bag: this is a published contract, and a reader has to
     * know what it may rely on finding.
     */
    readonly extra: ChallengeExtra;
    readonly maxTimeoutSeconds: number;
    readonly method: "GET";
    readonly mimeType: string;
    readonly network: string;
    readonly payTo: string;
    readonly price: string;
    readonly scheme: "exact";
    readonly url: string;
  }[];
  readonly source: string;
  readonly version: 1;
}

/**
 * The slice of the router the two public documents actually read.
 *
 * Narrowed so they can be built — and tested — without a whole server: these
 * are the only routes a stranger's agent reads before it decides whether to
 * pay us, and they had no test at all.
 */
export interface CardDeps {
  readonly environment: Pick<
    Environment,
    | "appOrigin"
    | "hederaFacilitatorUrl"
    | "hederaHcsTopicId"
    | "hederaNetwork"
    | "hederaPayTo"
  >;
  readonly oracleUrl: string;
  readonly services: { readonly oracle: Pick<OracleGate, "challenge"> };
}

/**
 * The one member of `extra` the Hedera exact scheme defines, read back out of
 * the challenge. Anything else a facilitator attaches is its own business and
 * is not republished as though this card vouched for it.
 */
const Extra = Schema.Struct({ feePayer: Schema.optional(Schema.String) });
const decodeExtra = Schema.decodeUnknownResult(Extra);

const feePayerOf = (
  requirement: ReturnType<OracleGate["challenge"]>["accepts"][number]
): ChallengeExtra => {
  const decoded = decodeExtra(requirement.extra ?? {});
  if (decoded._tag === "Failure") {
    return {};
  }
  const { feePayer } = decoded.success;
  return feePayer === undefined || feePayer === "" ? {} : { feePayer };
};

export const serviceCard = (deps: CardDeps): ServiceCard => {
  const { environment } = deps;
  const [requirement] = deps.services.oracle.challenge({
    description: "Cross-protocol USDC lending snapshot, cheapest borrow first.",
    units: PRICE_TINYBARS,
    url: deps.oracleUrl,
  }).accepts;
  const doorUrl = `${environment.appOrigin}/froggy-mcp.mjs`;
  return {
    agentDoor: {
      install: `curl -fsSL ${doorUrl} -o froggy-mcp.mjs && claude mcp add froggy -e FROGGY_HEDERA_ACCOUNT_ID=0.0.x -e FROGGY_HEDERA_PRIVATE_KEY=0x... -- node ./froggy-mcp.mjs`,
      url: doorUrl,
    },
    description: `A live cross-protocol lending snapshot from The Graph, sold per query over x402 on ${environment.hederaNetwork === "hedera:mainnet" ? "Hedera mainnet" : "Hedera testnet"} and settled through a facilitator. Every settlement leaves a public note on a Hedera Consensus Service topic.`,
    facilitator: environment.hederaFacilitatorUrl,
    hcsTopic:
      environment.hederaHcsTopicId === "" ? null : environment.hederaHcsTopicId,
    name: "Froggy lending oracle",
    resources:
      requirement === undefined
        ? []
        : [
            {
              asset: requirement.asset,
              description:
                "GET with ?symbol=USDC. Answers 402 with an x402 v2 challenge; a paid request returns the snapshot and the settlement in the payment-response header.",
              extra: feePayerOf(requirement),
              maxTimeoutSeconds: requirement.maxTimeoutSeconds,
              method: "GET",
              mimeType: "application/json",
              network: requirement.network,
              payTo: requirement.payTo,
              price: requirement.amount,
              scheme: "exact",
              url: deps.oracleUrl,
            },
            {
              asset: requirement.asset,
              description:
                "The Pond Observatory report: market rates, liquidity and index provenance, as a page rather than a payload. Same challenge, same settlement, same public note.",
              extra: feePayerOf(requirement),
              maxTimeoutSeconds: requirement.maxTimeoutSeconds,
              method: "GET",
              mimeType: "text/html",
              network: requirement.network,
              payTo: requirement.payTo,
              price: requirement.amount,
              scheme: "exact",
              url: new URL(
                X402_DEMO_REPORT_PATH,
                environment.appOrigin
              ).toString(),
            },
          ],
    source: "https://github.com/grmkris/Froggy-ETHOnline2026",
    version: 1,
  };
};

/**
 * The x402 discovery document, in the shape the specification gives it.
 *
 * `/.well-known/x402.json` is our own card and carries fields x402 has no
 * opinion about — a price, a facilitator, a topic, now a door. This is the
 * other thing: the standard listing, so a directory or another agent can read
 * us without knowing anything about Froggy. Both are built from the same
 * challenge as the 402 itself, so none of the three can drift apart.
 *
 * The identifier is HCS-14, derived the way the reference implementation
 * derives it, from the facts printed beside it. It is a claim about a
 * derivation a reader can repeat, not a registration.
 *
 * Each `accepts` entry is the *whole* requirement the 402 carries, not a
 * summary of it. Hedera's exact scheme cannot be paid without the facilitator
 * in `extra.feePayer`, so a listing that drops it is a listing nothing can buy
 * from — which would leave this endpoint decorative, and its point is that it
 * is not.
 */
export const discoveryDocument = (deps: CardDeps, now: number) => {
  const card = serviceCard(deps);
  const { environment } = deps;
  const facts = {
    name: "froggy-lending-oracle",
    nativeId: caip10(environment.hederaNetwork, environment.hederaPayTo),
    protocol: "x402",
    registry: "froggy",
    skills: [],
    version: "1.0.0",
  };
  return {
    agent: { facts, id: universalAgentId(facts), standard: "HCS-14" },
    items: card.resources.map((resource) => ({
      accepts: [
        {
          amount: resource.price,
          asset: resource.asset,
          description: resource.description,
          extra: resource.extra,
          maxTimeoutSeconds: resource.maxTimeoutSeconds,
          mimeType: resource.mimeType,
          network: resource.network,
          payTo: resource.payTo,
          resource: resource.url,
          scheme: resource.scheme,
        },
      ],
      // The deployment's own start, not the moment of asking. A listing that
      // reports "just now" on every request tells a directory to re-read it
      // forever and says nothing true about when the offer last moved.
      lastUpdated: new Date(now).toISOString(),
      resource: resource.url,
      type: "http",
      x402Version: 2,
    })),
    pagination: {
      limit: card.resources.length,
      offset: 0,
      total: card.resources.length,
    },
    x402Version: 2,
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
