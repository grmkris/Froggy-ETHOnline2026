# 0038 — One Account page: five tabs, and the leash first

Date: 13 September 2026. Status: implemented.

Account had grown into six cards in two columns, with a row of anchor links above them dressed as tabs. Nothing switched when one was clicked; everything was already on screen. Spending controls was a wall — the plumbing, the consent, the allowance, the Privy policy, the trading switch and the trading rules — while Your account was two buttons, and the loudest thing on the page was a red Stop trading button.

## What changed

`/settings` is one route with tabs, chosen by `?tab=spending|routines|email|payments|account`, in the way `/activity` already works (0037). No tab is Spending. Payments shows only when saved-card checkout is enabled, as its card already did. The old `#section` links — `#spending`, `#payment-methods`, `#email`, `#appearance`, `#account`, `#routines` — still arrive, as a tab, and the three places in the app that used them now say the tab.

**Spending** leads with the allowance sentence, set as the section's figure, and its two buttons; the consent sits above it while there is no signer. Trading is its own card with Stop as an outline button, since a leash should be legible rather than alarming. Paid endpoints is **Sites Froggy can pay**, the words the Passbook handoff chose. The signer, agent standing, session, WebMCP and the Privy policy id sit last, under Technical details.

**Routines**, **Email** and **Payments** each hold the one card they had. **Account** holds Appearance, Sign out, Show the welcome again and Delete my data.

The page is the ordinary column width rather than wide, and each tab has its own one-line intro.

## Not done here

The words inside the cards were only lightly touched: the card form still says Linea funding address, because the address really is on Linea and a person saving a card has to know which one. A full pass on the copy in the digest, schedule and directory panels is still open.
