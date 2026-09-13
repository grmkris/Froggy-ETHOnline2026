import { publicHttpUrl } from "@froggy/domain";
import type { WatchlistObservation } from "@froggy/domain";
import { Schema } from "effect";

const RecordValue = Schema.Record(Schema.String, Schema.Json);
const text = (value: Schema.Json | undefined): string | null =>
  Schema.is(Schema.String)(value)
    ? value.replaceAll(/\s+/gu, " ").trim().slice(0, 500)
    : null;
const label = (value: Schema.Json | undefined): string | null => {
  if (Schema.is(Schema.String)(value)) {
    return text(value);
  }
  const parsed = Schema.decodeUnknownResult(RecordValue)(value);
  return parsed._tag === "Success"
    ? (text(parsed.success["name"]) ?? text(parsed.success["iataCode"]))
    : null;
};
const imageFor = (
  value: Schema.Json | undefined,
  url: string
): string | null => {
  const image = label(value);
  if (!image) {
    return null;
  }
  try {
    const candidate = new URL(image, url).toString();
    return publicHttpUrl(candidate).ok ? candidate : null;
  } catch {
    return null;
  }
};
export interface LinkMetadata {
  readonly kind: "product" | "flight" | "link";
  readonly name: string | null;
  readonly image: string | null;
  readonly observation: WatchlistObservation;
}
/** Deliberately small JSON-LD vocabulary; variant and itinerary context remain visible facts. */
export const parseLinkedData = (
  json: Schema.Json,
  url: string,
  depth = 0
): LinkMetadata | null => {
  if (depth > 4) {
    return null;
  }
  if (Array.isArray(json)) {
    for (const entry of json.slice(0, 20)) {
      const found = parseLinkedData(entry, url, depth + 1);
      if (found) {
        return found;
      }
    }
    return null;
  }
  const parsed = Schema.decodeUnknownResult(RecordValue)(json);
  if (parsed._tag === "Failure") {
    return null;
  }
  const value = parsed.success;
  const type = value["@type"];
  const types = Array.isArray(type) ? type : [type];
  const product = types.includes("Product");
  const flight = types.some(
    (entry) =>
      entry === "Flight" || entry === "FlightReservation" || entry === "Trip"
  );
  if (!product && !flight) {
    return value["@graph"] === undefined
      ? null
      : parseLinkedData(value["@graph"], url, depth + 1);
  }
  const { offers } = value;
  const offer = Schema.decodeUnknownResult(RecordValue)(
    Array.isArray(offers) ? offers[0] : offers
  );
  const data = offer._tag === "Success" ? offer.success : value;
  const rawPrice = data["price"] ?? data["totalPrice"];
  const price =
    Schema.is(Schema.String)(rawPrice) && /^\d+(?:\.\d+)?$/u.test(rawPrice)
      ? Number(rawPrice)
      : rawPrice;
  const currency = text(data["priceCurrency"]);
  const facts = [
    "brand",
    "color",
    "size",
    "sku",
    "availability",
    "departureAirport",
    "arrivalAirport",
    "departureTime",
    "arrivalTime",
    "flightNumber",
    "numAdults",
  ].flatMap((key) => {
    const content = label(value[key] ?? data[key]);
    return content ? [{ label: key, value: content }] : [];
  });
  return {
    kind: product ? "product" : "flight",
    name: text(value["name"]),
    image: imageFor(value["image"], url),
    observation: {
      at: Date.now(),
      source: "Page metadata",
      sourceUrl: url,
      price: Schema.is(Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0)))(
        price
      )
        ? price
        : null,
      currency: currency && /^[A-Z]{3}$/u.test(currency) ? currency : null,
      basis: facts
        .map((fact) => `${fact.label}: ${fact.value}`)
        .join(" · ")
        .slice(0, 500),
      stubbed: false,
      facts,
    },
  };
};
