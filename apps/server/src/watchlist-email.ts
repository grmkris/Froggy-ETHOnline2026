import { EmailId } from "@froggy/domain";
import type { EmailMessage, UserId, WatchlistInput } from "@froggy/domain";
import { Schema } from "effect";

import type { Services } from "./services";
import { recordItemObservation } from "./watchlist-data";
import { saveWatchlistItem } from "./watchlist-routes";

/** Retain selected useful facts, never a copy of the email body, files or access codes. */
export const emailItemFacts = (
  message: EmailMessage
): {
  readonly input: WatchlistInput;
  readonly facts: readonly { readonly label: string; readonly value: string }[];
} | null => {
  const lines = message.text
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(
      (line) =>
        line.length > 0 &&
        line.length <= 300 &&
        !/code|password|verification|authenticat|reference|\bpnr\b|confirmation number|reservation number|https?:\/\//iu.test(
          line
        )
    );
  const selected = lines
    .filter((line) =>
      /flight|departure|arrival|check.in|check.out|total|price|size|colou?r|passenger|baggage|dates?|route|delivery/iu.test(
        line
      )
    )
    .slice(0, 8);
  if (selected.length === 0) {
    return null;
  }
  const travel =
    /flight|departure|arrival|check.in|check.out|passenger|baggage|itinerary/iu.test(
      selected.join(" ")
    );
  const facts = selected.map((value, index) => ({
    label: `Detail ${index + 1}`,
    value: value.slice(0, 200),
  }));
  return {
    input: {
      title: message.subject.slice(0, 120) || "Saved email details",
      notes: facts
        .map((fact) => fact.value)
        .join("\n")
        .slice(0, 1000),
      source: {
        _tag: "email",
        emailId: message.id,
        kind: travel ? "flight" : "product",
      },
    },
    facts,
  };
};

export const handleWatchlistEmail = async (
  services: Services,
  request: Request,
  owner: UserId
): Promise<Response> => {
  if (request.method !== "POST") {
    return Response.json(
      { v: 1, error: "Method not allowed." },
      { status: 405 }
    );
  }
  const input = Schema.decodeUnknownResult(
    Schema.Struct({ v: Schema.Literal(1), emailId: EmailId })
  )(await request.json().catch(() => null));
  if (input._tag === "Failure") {
    return Response.json(
      { v: 1, error: "Select an email first." },
      { status: 400 }
    );
  }
  const message = await services.email
    .read(owner, input.success.emailId)
    .catch(() => null);
  if (!message) {
    return Response.json({ v: 1, error: "Email not found." }, { status: 404 });
  }
  const extracted = emailItemFacts(message);
  if (!extracted) {
    return Response.json(
      {
        v: 1,
        error:
          "No clear trip or product details found. Ask Froggy to help extract the details you want to keep.",
      },
      { status: 422 }
    );
  }
  const item = await saveWatchlistItem(services.store, owner, extracted.input);
  await recordItemObservation(services.store, owner, item.id, {
    at: message.createdAt,
    source: "Selected email",
    sourceUrl: null,
    price: null,
    currency: null,
    basis: "Saved email facts; amounts are not live quotes",
    stubbed: message.stubbed,
    facts: extracted.facts,
  });
  return Response.json(
    { v: 1, item },
    { status: 201, headers: { "cache-control": "no-store" } }
  );
};
