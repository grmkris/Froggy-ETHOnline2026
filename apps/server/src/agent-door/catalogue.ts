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

const CARD_PATH = "/.well-known/x402.json";

/**
 * How the door asks a seller for something.
 *
 * `redirect` and `signal` are part of the shape rather than left to the
 * default because the caller here is a stranger's URL: an unbounded wait is a
 * tool call that never returns, and a followed redirect is the signed payment
 * header being handed to a host the caller never named.
 */
export interface DoorRequest {
  readonly headers?: Readonly<Record<string, string>>;
  readonly redirect?: "manual";
  readonly signal?: AbortSignal;
}

/** The fetch shape the door uses, so a test can hand in a plain function. */
export type DoorFetch = (url: string, init?: DoorRequest) => Promise<Response>;

/** How long the door waits on a seller before calling it unreachable. */
export const SELLER_TIMEOUT_MS = 20_000;

/** How much of a seller's answer may reach the caller's context. */
const MAX_BODY_BYTES = 64_000;

/**
 * Read a bounded prefix of a body and stop pulling.
 *
 * Whatever comes back here is put in front of a model, so the repository's
 * rule about capping tool output applies to a stranger's server as much as to
 * a page dump. The cut is announced rather than silent: a truncated answer a
 * reader believes is whole is worse than a short one.
 */
export const boundedText = async (response: Response): Promise<string> => {
  const reader = response.body?.getReader();
  if (reader === undefined) {
    return "";
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  let truncated = false;
  try {
    while (size < MAX_BODY_BYTES) {
      // eslint-disable-next-line no-await-in-loop -- a stream is read in order; there is no set of chunks to await together
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      chunks.push(value);
      size += value.byteLength;
    }
    truncated = size >= MAX_BODY_BYTES;
  } catch {
    // A body that stops arriving is still worth whatever did arrive.
  }
  try {
    await reader.cancel();
  } catch {
    // Already finished, or already broken. Either way there is nothing to do.
  }
  const joined = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    joined.set(chunk, at);
    at += chunk.byteLength;
  }
  const text = new TextDecoder("utf-8").decode(joined);
  return truncated
    ? `${text.slice(0, MAX_BODY_BYTES)}\n\n[…the seller's answer was longer than ${MAX_BODY_BYTES} bytes and was cut here.]`
    : text;
};

/** Either the thing, or the sentence saying why there is no thing. */
export type Read<A> =
  | { readonly _tag: "read"; readonly value: A }
  | { readonly _tag: "refused"; readonly reason: string };

export const refuse = <A>(reason: string): Read<A> => ({
  _tag: "refused",
  reason,
});

/**
 * Bound a stranger-supplied field before it is interpolated into a receipt.
 *
 * The topic has no submit key, so `kind` and `ref` are a stranger's strings,
 * and a seller's card is the same: none of these fields have earned an
 * unbounded place in a tool result.
 */
export const clipField = (value: string, max = 240): string =>
  value.length <= max ? value : `${value.slice(0, max)}…`;

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
  const fetchImpl: DoorFetch =
    input.fetch ?? (async (url, init) => await fetch(url, init));
  const url = `${input.url}${CARD_PATH}`;
  let text: string;
  try {
    const response = await fetchImpl(url, {
      signal: AbortSignal.timeout(SELLER_TIMEOUT_MS),
    });
    if (!response.ok) {
      return refuse(
        `${url} answered ${response.status}. That is the service card, so there is nothing to sell from here right now.`
      );
    }
    text = await boundedText(response);
  } catch (error) {
    return refuse(
      `${url} could not be reached (${error instanceof Error ? error.message : "unknown error"}).`
    );
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return refuse(`${url} answered something that is not a service card.`);
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
const describeResource = (resource: Resource): string =>
  [
    `- ${clipField(resource.url)}`,
    `  ${clipField(resource.description)}`,
    `  ${formatAmount(resource.price, resource.asset, resource.network)} per call on ${clipField(resource.network, 80)}, ${clipField(resource.scheme, 80)} scheme, paid to ${clipField(resource.payTo, 80)}.`,
  ].join("\n");

/** The whole card, as the catalogue view answers it. */
export const describeCatalogue = (card: ServiceCard, url: string): string => {
  const lines = [
    `${clipField(card.name)} — ${clipField(card.description)}`,
    "",
    "For sale:",
    ...card.resources.map(describeResource),
    "",
    `Settled through the facilitator at ${clipField(card.facilitator)}. The facilitator pays the Hedera transaction fee, so a buyer needs no HBAR for gas — only the amount itself.`,
  ];
  if (card.hcsTopic !== null) {
    lines.push(
      `Every settlement leaves a public note on Hedera Consensus Service topic ${clipField(card.hcsTopic, 80)}. Check any one of them with froggy_receipt.`
    );
  }
  lines.push(
    "",
    `Source: ${clipField(card.source)}`,
    `Card: ${url}${CARD_PATH}`,
    "Buy one with froggy_buy. Nothing here costs anything and nothing here needs an account."
  );
  return lines.join("\n");
};
