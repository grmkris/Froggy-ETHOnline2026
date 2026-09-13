# 0037 — One Activity page: the feed, Connections and Tools as tabs

Date: 13 September 2026. Status: implemented; the first ChatGPT and Claude Desktop connections through the new instructions are still an owner check.

The workspace had five secondary pages and two of them overlapped. Activity was the evidence feed; Connections was where a person handed an agent the allowance, but its one button copied a sentence nobody could read, offered no MCP URL, and said nothing about ChatGPT, Claude Desktop or Claude Code. Explore and Services were a catalogue, a form per tool, a trading desk, a purchase form and a scheduled-work list behind `?view=` switches. Tool usage was visible only one record at a time in the evidence panel.

## What changed

`/activity` is one route with three tabs, chosen by `?tab=activity|agents|tools`. The `?record=` deep link keeps opening the evidence panel; `?task=` opens a service result; `?service=` opens a tool's own form. `/agents` redirects to the Connections tab and `/agents/:id` is unchanged. `/explore` and `/services` are gone; the rail and the workspace menu hold Your money, Activity and Account.

**Connections** prints the sentence a person pastes into their agent in full, with the MCP server URL and the instructions link on the ticket stub, each with its own copy button. Beneath it, one guide per client — ChatGPT, Claude Desktop, Claude Code, Cursor, any MCP client — as numbered steps with every value copyable and a slot per step for a screenshot at `/froggy/connect/<client>-<step>.webp`; a missing file shows nothing. Telegram, the Froggy email address, connected sites and the token path follow. The tab is labelled Connections because the welcome flow, the consent page and the generated skill all say so.

**Tools** is a price list served by `GET /api/tools`, owner only. Every tool the chat or an agent can call sits in a group named for what a person wants done, with a price in credits from the same catalogue the checkout uses, "Included" when it costs nothing, "Wallet" when the mandate and an approval decide, and a budget range for a browse. Each row says whether it is ready, simulated or unavailable, whether a connected agent may call it, and what this person has used: priced tools are counted from `tasks`, one row per purchase whatever surface bought it, so a `service_status` poll is never a second charge; the rest from recorded executions by name. Priced rows fold open to the request forms that already existed, so nothing that could be bought yesterday cannot be bought today. Trade history and listing watches sit under their groups; the paid-URL form folds under its own row.

**Activity** groups by day. A chat, Telegram or scheduled run is one row that folds open to its request and the tool calls it made, each with its duration and, when a task was bought, the credits used or held (the evidence record now carries `priceCreditUnits` and `chargeStatus` beside the quote, because a quote is not a charge). A call an outside agent made on its own is its own row, named for the connection. Above the feed, "Needs you" holds the purchase tickets and trade steps waiting on the person, and "Coming up" what Froggy will do later with its cancel buttons. The purchase banner keeps following the person around the workspace except on this tab, where the same tickets already are.

## What was dropped, and why

The prepare-a-trade form and the positions panel: an agent prepares trades through chat or MCP and the person approves each step, which is the product. The browser tests that drove the form now prepare through `POST /api/trades` and approve in the Tools tab's trade history. Stop trading and the trading rules moved to Account under Spending controls, beside the other leashes.

## Not done here

No Railway dev environment; production is the only one. Nobody has connected ChatGPT or Claude Desktop to `/mcp` yet — it is POST-only and refuses cross-origin browser calls by design, so the instructions follow those clients' documented flows and the first real connection is an owner check. A scheduled run does not link back to its schedule, and an MCP client's self-declared name is still discarded; only the OAuth client name exists.
