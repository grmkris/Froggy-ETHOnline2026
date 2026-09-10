/**
 * What Froggy sells, in a reader's words.
 *
 * The catalogue is the service card the product already publishes, rendered
 * for an agent rather than a parser. It costs nothing, needs no key, and is
 * the first thing a caller sees, so it has to work on a machine that has
 * configured nothing at all.
 *
 * The price shown here is the one in the card, and the card is built from the
 * same challenge as the 402, so the two cannot drift apart.
 */

import { KNOWN_ASSETS } from "@froggy/domain";
import { Schema } from "effect";

const Resource = Schema.Struct({
  asset: Schema.String,
  description: Schema.String,
  method: Schema.String,
  network: Schema.String,
  payTo: Schema.String,
  /** Smallest units: tinybars for HBAR, the token's own base unit otherwise. */
  price: Schema.String,
  scheme: Schema.String,
  url: Schema.String,
});
export type Resource = typeof Resource.Type;

const ServiceCard = Schema.Struct({
  description: Schema.String,
  facilitator: Schema.String,
  hcsTopic: Schema.NullOr(Schema.String),
  name: Schema.String,
  resources: Schema.Array(Resource),
  source: Schema.String,
  version: Schema.Finite,
});
export type ServiceCard = typeof ServiceCard.Type;
const decodeServiceCard = Schema.decodeUnknownResult(ServiceCard);

export const CARD_PATH = "/.well-known/x402.json";

/** The fetch shape the door uses, so a test can hand in a plain function. */
export type DoorFetch = (
  url: string,
  init?: { readonly headers: Readonly<Record<string, string>> }
) => Promise<Response>;

/** Either the thing, or the sentence saying why there is no thing. */
export type Read<A> =
  | { readonly _tag: "read"; readonly value: A }
  | { readonly _tag: "refused"; readonly reason: string };

export const refuse = <A>(reason: string): Read<A> => ({
  _tag: "refused",
  reason,
});

/**
 * Read the card, or say why not.
 *
 * A seller that cannot describe itself is a seller nothing should be bought
 * from, so this fails loudly rather than falling back to anything remembered.
 */
export const readCatalogue = async (input: {
  readonly fetch?: DoorFetch;
  readonly url: string;
}): Promise<Read<ServiceCard>> => {
  const fetchImpl: DoorFetch = input.fetch ?? ((url) => fetch(url));
  const url = `${input.url}${CARD_PATH}`;
  let body: unknown;
  try {
    const response = await fetchImpl(url);
    if (!response.ok) {
      return refuse(
        `${url} answered ${response.status}. That is the service card, so there is nothing to sell from here right now.`
      );
    }
    body = await response.json();
  } catch (error) {
    return refuse(
      `${url} could not be reached (${error instanceof Error ? error.message : "unknown error"}).`
    );
  }
  const decoded = decodeServiceCard(body);
  return decoded._tag === "Success"
    ? { _tag: "read", value: decoded.success }
    : refuse(`${url} answered something that is not a service card.`);
};

/** Decimals for an asset id on a network, or null when nobody here knows. */
const decimalsOf = (asset: string, network: string): number | null => {
  for (const known of Object.values(KNOWN_ASSETS)) {
    if (known.network === network && known.id === asset) {
      return known.decimals;
    }
  }
  return null;
};

/** The symbol for an asset id on a network, or the id itself. */
const symbolOf = (asset: string, network: string): string => {
  for (const known of Object.values(KNOWN_ASSETS)) {
    if (known.network === network && known.id === asset) {
      return known.symbol;
    }
  }
  return asset;
};

/**
 * Smallest units into something a person can read, without rounding the
 * number away: `5000000` tinybars is `0.05 HBAR`, and an unknown token keeps
 * its base units rather than pretending to a decimal place.
 */
export const formatAmount = (
  units: string,
  asset: string,
  network: string
): string => {
  const symbol = symbolOf(asset, network);
  const decimals = decimalsOf(asset, network);
  if (decimals === null) {
    return `${units} units of token ${asset}`;
  }
  const digits = units.padStart(decimals + 1, "0");
  const whole = digits.slice(0, digits.length - decimals);
  const fraction = digits.slice(digits.length - decimals).replace(/0+$/u, "");
  return fraction === ""
    ? `${whole} ${symbol}`
    : `${whole}.${fraction} ${symbol}`;
};

/** One resource, as a line a caller can choose from. */
export const describeResource = (resource: Resource): string =>
  [
    `- ${resource.url}`,
    `  ${resource.description}`,
    `  ${formatAmount(resource.price, resource.asset, resource.network)} per call on ${resource.network}, ${resource.scheme} scheme, paid to ${resource.payTo}.`,
  ].join("\n");

/** The whole card, as the catalogue view answers it. */
export const describeCatalogue = (card: ServiceCard, url: string): string => {
  const lines = [
    `${card.name} — ${card.description}`,
    "",
    "For sale:",
    ...card.resources.map(describeResource),
    "",
    `Settled through the facilitator at ${card.facilitator}. The facilitator pays the Hedera transaction fee, so a buyer needs no HBAR for gas — only the amount itself.`,
  ];
  if (card.hcsTopic !== null) {
    lines.push(
      `Every settlement leaves a public note on Hedera Consensus Service topic ${card.hcsTopic}. Check any one of them with froggy_receipt.`
    );
  }
  lines.push(
    "",
    `Source: ${card.source}`,
    `Card: ${url}${CARD_PATH}`,
    "Buy one with froggy_buy. Nothing here costs anything and nothing here needs an account."
  );
  return lines.join("\n");
};
