# 0034 — Saved facts and one-time enrichment

Status: accepted, 13 September 2026.

Froggy remains a broad assistant. Tokens, wallets, shopping, travel, links and selected email facts share the Watchlist. The primary capture interaction is a pasted address or URL, a free preview, and a save with an explicitly priced optional one-time enrichment. Alerts remain a separate choice after saving.

## Identity and observations

Human edits keep the existing saved-item revision. Provider observations live in an independent, owner-scoped `saved_item_data` book/table, with at most 200 items, 500 observations per item and a 90-day history window. Each observation carries its time, source, currency, comparison context and simulation marker. Empty or older results cannot replace newer useful facts. A PostgreSQL advisory lock serializes concurrent observations without conflicting with human edits. Migration `0026_busy_silvermane.sql` adds this table; item/account deletion cascades to its data.

Token historical series remain in their immutable service task. List responses omit observation arrays. Agent reads omit those arrays and reference the stored chart task; owner-authorized result retrieval supplies the chart to the UI. Reading an item, opening its chart, changing chart windows and comparing saved data never purchase research.

Email saves retain bounded selected trip/product facts and an email ID rather than the body or attachments. Explicit code/reference lines are excluded; ambiguous messages fall back to asking Froggy to extract the desired details. Removing the source email does not remove the saved facts. An old booking amount is not a current fare.

## Free previews and images

The browser resolves Base and Robinhood independently, so one unavailable chain does not hold up the other. ERC-20 name/symbol/decimals are self-reported contract metadata. An address with no observed contract code is not proof of ownership, an active wallet or a safe investment.

URL previews use bounded static HTML/JSON-LD parsing: 512 KiB per page, 32 KiB per JSON-LD block, bounded graph traversal. No page JavaScript runs. Preview promises are owner-scoped and cached for 60 seconds, with per-owner and global bounds. An opaque preview reference lets the server retain the same metadata on Save. Expired previews still allow saving the item.

Images are fetched through an authenticated same-origin endpoint using only server-known image URLs. The existing public-URL/DNS/redirect policy applies; PNG/JPEG/WebP bytes are limited to 1 MiB, SVG is rejected, and private caching is bounded. Image dimensions are reserved to avoid layout shifts.

## Payment and recovery

A capture saves identity before recording an enrichment intent. The intent binds item revision, accepted fixed price and a stable idempotency key. Before starting, the coordinator rechecks revision, archive state and current catalog price. The existing platform credit boundary reserves and charges the task; it does not authorize merchant purchases, trading or transfers.

Tokens use the new `token_snapshot` bundle: overview plus real 24-hour and 7-day Birdeye OHLCV. It is available only on Base/Robinhood and requires an explicit live price no higher than $1 (100 credits). Missing windows remain unavailable. Browser checks reuse the existing 100-credit read-only task path and wait while the shared browser is in use. Wallet and email saves do not start paid enrichment.

Task identity is recorded durably. Repeated saves and repeated refresh keys reuse their task. Failed work is not repurchased automatically; interrupted/uncertain work remains visible for review. A refresh is a separate explicit purchase and previous facts stay visible while it runs. No spending-authority control is exposed as a tool.

## Presentation and motion

Saved identity cards are shared by Watchlist and typed tool results. Service polls group by task within a single chat turn; individual calls and receipts remain inspectable. The agent cannot inject executable card markup.

Recharts provides only the line-chart primitives needed here. Evil Charts' static line presentation informed the design; its larger registry component stack was unnecessary. Charts use real observations, visible source times, explicit simulated states, gaps for missing intervals and no introductory drawing animation. Token comparisons use shared observation times and distinct line patterns; they never combine simulated and live series. Other categories compare existing facts, currencies and saved variant/itinerary context without ranking incompatible prices.

The established paper/forest palette and typography remain. Save feedback is brief; optional alert expansion respects keyboard input and reduced motion. Search, category, sort and attention filters remain in the owner's in-memory query cache across navigation. Desktop shows a list beside details; smaller screens use the existing navigation flow.
