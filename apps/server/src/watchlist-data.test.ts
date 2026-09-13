import { expect, test } from "bun:test";

import { ConversationId, EmailId, EmailMessage, userId } from "@froggy/domain";
import { memoryStore } from "@froggy/wallet";
import { Schema } from "effect";

import { handleWatchlistData, recordItemObservation } from "./watchlist-data";
import { emailItemFacts } from "./watchlist-email";
import { parseLinkedData } from "./watchlist-metadata";
import { readLinkPreview } from "./watchlist-resolve";
import { saveWatchlistItem } from "./watchlist-routes";

const owner = userId("did:privy:details-owner");

test("bounded JSON-LD captures variant and currency without trusting remote images", async () => {
  const preview = await readLinkPreview(
    "https://example.com/shoe",
    new Response(
      '<title>A shoe</title><script type="application/ld+json">{"@type":"Product","name":"Green shoe","size":"42","color":"olive","image":"http://127.0.0.1/private","offers":{"price":"49.90","priceCurrency":"EUR","availability":"InStock"}}</script>',
      { headers: { "content-type": "text/html" } }
    )
  );
  expect(preview.candidates[0]?.title).toBe("Green shoe");
  expect(preview.candidates[0]?.source._tag).toBe("product");
  expect(preview.observation).toMatchObject({
    price: 49.9,
    currency: "EUR",
    stubbed: false,
  });
  expect(preview.observation?.basis).toContain("size: 42");
  expect(preview.imageUrl).toBeNull();
  expect(
    parseLinkedData(
      { "@type": "Product", offers: { price: "NaN", priceCurrency: "euro" } },
      "https://example.com"
    )
  ).toMatchObject({ observation: { price: null, currency: null } });
  expect(
    readLinkPreview(
      "https://example.com",
      new Response("x".repeat(513 * 1024), {
        headers: { "content-type": "text/html" },
      })
    )
  ).rejects.toThrow("size limit");
});

test("saved observations are owner-scoped and do not overwrite an editable item revision", async () => {
  const store = memoryStore();
  const item = await saveWatchlistItem(store, owner, {
    title: "Shoe",
    notes: "Size 42",
    source: { _tag: "product", url: "https://example.com/shoe" },
  });
  const at = Date.now();
  const observation = {
    at,
    source: "Website",
    sourceUrl: "https://example.com/shoe",
    price: 49.9,
    currency: "EUR",
    basis: "size 42",
    stubbed: true,
    facts: [],
  };
  await Promise.all([
    recordItemObservation(store, owner, item.id, observation),
    recordItemObservation(store, owner, item.id, {
      ...observation,
      at: at - 1000,
      price: 59.9,
    }),
  ]);
  await recordItemObservation(store, owner, item.id, {
    ...observation,
    at: at + 1000,
    price: null,
    facts: [],
  });
  const unchanged = await store.watchlist.transact(owner, (book) =>
    book.get(item.id)
  );
  expect(unchanged).toEqual(item);
  const details = await store.watchlistData.transact(owner, (book) =>
    book.get(item.id)
  );
  expect(details?.latest?.price).toBe(49.9);
  expect(details?.observations).toHaveLength(3);
  const path = `/api/watchlist/${item.id}/details`;
  const response = await handleWatchlistData(
    store,
    new Request(`https://froggy.test${path}`),
    userId("did:privy:other"),
    path
  );
  expect(response?.status).toBe(404);
});

test("selected email facts exclude access codes and survive independently of the body", () => {
  const message = Schema.decodeUnknownSync(EmailMessage)({
    kind: "message",
    id: EmailId.generate(),
    conversationId: ConversationId.generate(),
    from: "airline@example.com",
    to: ["traveler@example.com"],
    cc: [],
    subject: "Your trip",
    text: "Departure: Berlin, 20 October\nArrival: Lisbon, 20 October\nBaggage: 1 checked bag\nConfirmation code: PRIVATE\nVerification code: 123456\nA long email body with unrelated content",
    files: [],
    messageId: "fixture",
    references: [],
    deduplicationKey: "fixture",
    createdAt: Date.now(),
    read: false,
    deleted: false,
    automatic: false,
    truncated: false,
    stubbed: true,
  });
  const result = emailItemFacts(message);
  expect(result?.input.source).toEqual({
    _tag: "email",
    emailId: message.id,
    kind: "flight",
  });
  expect(result?.input.notes).toContain("Berlin");
  expect(JSON.stringify(result)).not.toContain("PRIVATE");
  expect(JSON.stringify(result)).not.toContain("123456");
  expect(JSON.stringify(result)).not.toContain("unrelated content");
});
