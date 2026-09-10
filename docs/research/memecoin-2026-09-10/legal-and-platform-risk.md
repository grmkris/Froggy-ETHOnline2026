# Legal and platform risk of a Froggy token, 10 September 2026

This is a risk map for a three-person team in Slovenia and Germany, deciding in the next few days whether to attach a tradable token to a live product that already takes real money. It is research, not legal advice. A Slovenian or German crypto counsel should read the classification fork in §1 before anyone deploys a contract.

Today is 10 September 2026. ETHOnline submissions close Sunday 13 September 18:00 CEST (ETHGlobal has also posted 17:00 UTC). Sources from the last 90 days are preferred; older material is dated in place.

## Thirty-second summary

- **A named EU team cannot hide behind “it’s just a meme.”** MiCA Title II applies to an *offeror*. Bitcoin-style “no identifiable issuer” (Commission answer in ESMA Q&A 2552, February 2026) is for assets nobody controls. If Kristjan, Jonas or Corot tweet a ticker, put it in the app, or seed a pool, they are the offeror. Article 4(1)(a) also requires a **legal person**. Three natural persons launching a public token is already offside.
- **The three designs are not the same legal object.** A joke coin with no rights is still a Title II crypto-asset once you are the offeror. An access-gate token (“hold 1M to use the app”) is a utility token under Article 3(1)(9) and *might* use the live-service exemption in Article 4(3)(c) — until you list it or say you will. **Revenue sharing to holders is the red line:** ESMA’s CAFI guidelines treat profit, revenue or redemption rights as transferable-security features. That exits MiCA and enters MiFID II / the Prospectus Regulation. In Germany that can be criminal (KMAG / KWG).
- **Traction kills the exemptions you would otherwise use.** Article 4(4) and Recital 26: tell the market you want the token traded, or get it admitted, and the small-offer, free-airdrop and live-utility exemptions fall away. Commission Q&A 2671 (answer published 21 May 2026) says a DEX listing *in the Union* can itself be a public offer unless the DEX is “fully decentralised” — a test no NCA has blessed for Uniswap’s web app.
- **ETHGlobal’s published rules do not ban a token.** They also do not protect you. Hedera’s $6k “Tokenization of Anything” prize is Asset Tokenization Studio / ERC-3643 collateral, not a memecoin. Privy is a $5k sponsor *and* the wallet Froggy cannot replace this week. Launching a ticker into that judging window is a sponsor-relationship risk, not a rules violation.
- **The reckless package is the one in the team’s own words:** launch now, require 1M tokens to use a paid app, share fees with holders, farm traction. That combination is the securities-shaped object, the MiCA-white-paper object, and the “this product just extracted its users” object at the same time.

---

## 1. Regulatory: MiCA in September 2026

### 1.1 What is actually in force

Regulation (EU) 2023/1114 (MiCA) is directly applicable in every Member State.

| Date | What switched on |
| --- | --- |
| 30 June 2024 | Titles III–IV (asset-referenced tokens, e-money tokens) |
| 30 December 2024 | Title II (other crypto-assets, white papers), Title V (CASPs), Title VI (market abuse) |
| National, last date 1 July 2026 | CASP grandfathering under Article 143(3). Germany ended 31 December 2025 (KMAG). Slovenia chose six months and closed **1 July 2025**. The EU-wide backstop closed **1 July 2026**. |

The Commission opened a targeted MiCA review consultation on 20 May 2026 (Articles 140 and 142), closed 31 August 2026. That review is about stablecoin multi-issuance and the interest ban on ARTs/EMTs. It does not pause Title II for a three-person token.

Froggy already settles in USDC on Base and HBAR on Hedera. Circle’s USDC is an authorised EMT (ESMA EMT register; 23 authorised EMT issuers as of 7 September 2026). **Issuing a Froggy token is a different activity from taking USDC.** EMT rules do not license you to offer a second asset.

### 1.2 Who your regulators are

MiCA is a regulation, but enforcement is national.

- **Slovenia.** Act on the Implementation of the Markets in Crypto-Assets Regulation (ZIUTK), in force 23 November 2024. **ATVP** (Agencija za trg vrednostnih papirjev) is the competent authority for CASPs and for most crypto-asset *issuers* / Title II offerors. **Banka Slovenije** handles e-money tokens. ATVP has adopted the ESMA CAFI guidelines (applicable in Slovenia since 7 June 2025) and publishes an annotated e-MiCA. Slovenia’s CASP transition ended 1 July 2025 — a year earlier than the EU maximum.
- **Germany.** BaFin is the NCA. Companion statute: Kryptomärkteaufsichtsgesetz (KMAG), BGBl. 2024 I Nr. 438, amended 2026. Title II white papers go to `whitepaper@bafin.de` at least **20 working days** before publication (Article 8 MiCA; BaFin crypto-institutions page, current). BaFin does not approve Title II white papers (Article 6(3)), but KMAG §§15–16 let it suspend an offer for up to 30 business days, prohibit it, and order the white paper amended. KMAG §46: criminal liability up to **five years** for specified unauthorised activity; §47: administrative fines. A 2025 German court upheld BaFin public warnings and interim cease-and-desist against a crypto issuer that mixed MiCA offering rules with prospectus rules (reported in *Blockchain & Cryptocurrency Laws 2026 | Germany*, Global Legal Insights, 21 October 2025).

Home Member State for a Title II white paper is the Member State of the offeror’s **registered office** (Article 8). No registered office in the Union, no lawful public offer of a Title II asset, unless you open an EU branch and pick a home NCA. “We are three people on Telegram” is not a home Member State.

### 1.3 The classification fork (this is the whole game)

EU law classifies by **rights and economic function**, not by the word “meme.” Order of tests:

1. Is it a **financial instrument** under MiFID II Annex I Section C? If yes, MiCA is **out** (Article 2(4)(a)). Prospectus Regulation, MiFID authorisation, and national criminal law are **in**.
2. If not, is it an **ART** or **EMT**? Irrelevant here unless you peg it.
3. Otherwise it is a Title II “other crypto-asset,” of which a **utility token** is the subset “only intended to provide access to a good or a service supplied by its issuer” (Article 3(1)(9)).

ESMA’s *Guidelines on the conditions and criteria for the qualification of crypto-assets as financial instruments* (ESMA75-453128700-1323; final report 17 December 2024; translations 19 March 2025; apply from **18 May 2025**). Material points for this team:

- Substance over form. Calling it a utility token or a meme in a README settles nothing.
- **Expectation of profit, by itself, is not enough** to make a crypto-asset a financial instrument (guideline paragraph 62). That sentence is widely quoted and widely misunderstood. It does **not** save a token that also confers financial rights.
- A utility token “should give neither financial rights that would be related to a company’s profits, capital, or liquidation surpluses … nor voting rights which would lead the investor to participate [in] the company's decision-making process” (footnote 34 of the guidelines).
- Hybrid tokens: financial-instrument features **win**. You cannot split one token into a utility half and a security half.
- Collective-investment characterisation: pooling capital from a number of investors, investing to a defined policy, investors entitled to a share of profits or losses. A “fee-sharing token” that is a claim on Froggy’s x402 take-rate is the fact pattern that gets this test.

**US overlay, for completeness.** SEC Division of Corporation Finance staff statement on meme coins, 27 February 2025: a meme coin with no yield, no rights to income or assets, purchased for entertainment, is generally not a security under *Howey*. The same statement says the analysis **does not extend** to products labelled “meme coins” to disguise a security. Froggy is a live payments product run by identifiable people. The SEC staff statement is not a shield for an access-plus-fee-share token, and it is not EU law.

### 1.4 Design A — “pure meme,” no rights, no gate, no fee share

**Legal shape.** Title II crypto-asset. Not an ART/EMT. Not a utility token in the Article 3(1)(9) sense if it does not provide access to a service. Not a financial instrument if it really confers nothing.

**Who must do what.**

- Default: offeror must be a **legal person**, draw up a white paper (Article 6 + Annex I + ITS 2024/2984 machine-readable template), notify the home NCA **20 working days** before publication (Article 8), publish it (Article 9), keep marketing fair/clear/not misleading and consistent with the white paper **including on social media** (Article 7 and Recital 24).
- Civil liability for incomplete, unfair, unclear or misleading white-paper information: Article 15. Contractual disclaimers of that liability have no legal effect. In Germany, KMAG §19 adds a repurchase/reimbursement claim where a required white paper was not published.
- Retail buyers who buy **from the offeror** (not on a secondary market that was already trading) have a **14-calendar-day withdrawal right** (Article 13). It dies once the asset is admitted to trading before the purchase.
- Fines for Articles 4–14 breaches: Member States must empower NCAs to impose on legal persons at least **€5 million or 3% of annual turnover**, whichever architecture they chose; on natural persons at least **€700,000** (Article 111(2)–(3)). Market abuse (Title VI, Articles 89–92) is a separate ladder: at least **€15 million or 15% of turnover** for legal persons.

**Exemptions that look tempting and then break.**

| Exemption | What it actually says | Why a traction launch burns it |
| --- | --- | --- |
| < 150 persons per Member State (Art. 4(2)(a)) | White-paper points in 4(1)(b)(c)(d)(f) drop out | A public pool is not 149 wallets in Germany and 149 in Slovenia |
| ≤ €1 million consideration in 12 months, Union-wide (Art. 4(2)(b)) | Same drop-out | DEX volume counts as consideration once you are offering |
| Qualified investors only (Art. 4(2)(c)) | Token can **only** be held by them | Incompatible with a memecoin |
| Offered for free (Art. 4(3)(a)) | Title II does not apply | Airdrop in exchange for personal data, fees, or “non-monetary benefits” is **not** free (Art. 4(3) second subparagraph). Seeding an AMM that anyone can buy from is not an airdrop |
| Live utility token (Art. 4(3)(c)) | Title II does not apply | See Design B |
| Limited network (Art. 4(3)(d)) | Title II does not apply | Recital 26: not for a “continuously growing network of service providers.” Froggy selling x402 to other agents is the opposite of a closed merchant list |

**Article 4(4) is the tripwire.** All of the exemptions above **do not apply** where the offeror, or anyone acting on their behalf, “makes known in any communication its intention to seek admission to trading.” Recital 26 is blunter: exemptions “should cease to apply when the offeror … communicates the offeror’s intention of seeking admission to trading **or the exempted crypto-assets are admitted to trading**.”

**“No identifiable issuer” is not available to you.** Commission answer, ESMA Q&A 2552 (18 February 2026): crypto-assets without an identifiable issuer are outside Titles II–IV; trading platforms need not produce a white paper for Bitcoin-like assets. Conventus Law (21 July 2026) notes the perverse result: anonymous meme issuers get a lighter load than identified ones. **You are identified.** The live app at `app-production-58dd.up.railway.app`, the ETHOnline submission, the Privy-embedded wallets, and any founder account that posts a contract address are the identification.

**Article 4(8):** if you publish a white paper *voluntarily* while claiming an exemption, Title II applies anyway. Do not “just put a PDF up to look serious.”

### 1.5 Design B — access gate (“hold 1,000,000 tokens to use the app”)

**Legal shape.** This is the statutory utility token: “only intended to provide access to a good or a service supplied by its issuer” (Art. 3(1)(9)). Froggy’s service exists and is in operation, so Article 4(3)(c) is the provision people will cite.

**What 4(3)(c) actually does.** It switches **Title II off** for that offer — white paper, notification, offeror conduct in Articles 4–14. It does **not**:

- switch off Title VI market abuse once the asset is admitted to trading or an admission is requested (BaFin explicitly flags Articles 86 et seq. from the date of an admission application);
- switch off UCPD / unfair contract terms (Recital 29: Directive 2005/29/EC and Directive 93/13/EEC “remain applicable” even to exempt offers in B2C relationships);
- let you communicate a listing plan (Art. 4(4));
- survive a second, non-exempt offer of the same asset (Art. 4(7): subsequent offers are separate).

**Product problem that becomes a legal problem.** Froggy today takes USDC and HBAR for real services. Replacing that with “buy our coin on a DEX, then you may use the thing you already paid for in dollars” is a change of the paid service’s terms. Under UCPD that can be an aggressive/misleading commercial practice if existing users must buy a volatile asset to keep access. I did not find a 2026 NCA decision on this exact fact pattern; the statutory consumer-protection overlay is still there.

**“Only intended.”** If the same token is also the memecoin you are farming traction with, NCAs will not treat “only intended to provide access” as satisfied. Marketing that talks about market cap, scarcity, or “get in before the app requires it” is how a utility token is reclassified (gunnercooke, 29 June 2026, on BaFin/ESMA practice: marketing of capital appreciation can create the investment characteristic).

**Practical consequence.** The only 4(3)(c) story that has a chance is: token is a non-transferable or tightly-transferable access credit, sold at a posted price by Froggy the company, redeemable for the live service, **not** listed, **not** hyped as an investment. That is not a memecoin and will not produce “traction.” The thing that produces traction is the thing that burns 4(3)(c).

### 1.6 Design C — revenue / fee sharing to holders (“hooks or shit like that”)

This is the design that most looks like a security. It is also the one the team named out loud.

**EU analysis, as tight as the sources allow.**

If holders have a **right** — contractual, token-encoded, or reasonably expected from your marketing — to a slice of Froggy’s x402 take, protocol fees, or Uniswap-hook fees, you are in the CAFI “financial rights related to a company’s profits” box. That is a **transferable security** (or, if you pool and manage, a unit in a collective investment undertaking). MiCA does not apply. You need:

- a prospectus or a prospectus exemption (Prospectus Regulation 2017/1129; Germany: WpPG; since 5 June 2026 the general EU prospectus-exemption ceiling is €12 million over 12 months unless the Member State opted down to at least €5 million — gunnercooke, 29 June 2026);
- MiFID investment-firm authorisation for placing, dealing, or operating an MTF;
- in Germany, possible KWG / WpIG criminal exposure for unauthorised investment services (up to five years; gunnercooke citing KWG §54, WpIG §82, KMAG §46).

**“But Uniswap v4 hooks are just protocol fees.”** Distinguish three mechanics:

| Mechanic | Typical characterisation | Risk |
| --- | --- | --- |
| Swap fees to **LPs** who posted the inventory | Compensation for a service (market-making), not a claim on Froggy the company | Lowest of the three. Still do not market it as “holders earn yield from the app.” LPs ≠ holders unless you force the two together |
| Hook that skims a fee to a **team/treasury** address | Company revenue. Fine, until you promise it to token holders | The promise is the problem |
| Hook or off-chain splitter that **pays token holders pro rata** | Profit participation. CAFI + MiFID | Highest. “Common mitigation” in 2025–2026 commentary is: **do not do this** |

**Mitigations that counsel actually use** (Compliora, gunnercooke, Legalcode, 2026 practitioner notes — not a safe harbour):

1. **No on-chain or contractual claim.** Token confers no right to revenue, buyback, or redemption. Any treasury spend is discretionary and can be zero forever. Marketing must match that (no “fee share,” no APY, no “holders capture the take-rate”).
2. **Burn, don’t distribute.** Protocol fees buy and burn on a public schedule with no holder entitlement. Still market-abuse sensitive once traded; still a bad look if you imply price support. Better than a dividend.
3. **Separate the LP from the mascot.** If you want Uniswap v4, the fee goes to LPs. The mascot token, if it exists at all, is not the LP receipt.
4. **No governance over treasury that is economically a residual claim.** CAFI: votes that allocate treasury, issuance, or distributions push toward financial-instrument treatment.
5. **Do not mix an access-gate with a yield story.** Hybrid tokens take the stricter classification.

I did not find a 2026 EU enforcement action that is factually “x402 app, Uniswap hook, fee to holders.” I did find the classification rule, and it is not ambiguous in the direction that helps you.

**Interest ban (Articles 40 / 50) does not apply.** That ban is for ARTs and EMTs. Do not take comfort from it; your problem is MiFID, not the stablecoin interest prohibition.

### 1.7 Market abuse, once anything trades

Title VI applies to crypto-assets **admitted to trading**, or for which admission has been requested, on a trading platform. Insider dealing, unlawful disclosure, market manipulation (Articles 86–92). Penalties sit at the top of the Article 111 ladder.

Founder wallets, insider allocations, “we will require 1M tokens next week” posted before a buy, and KOL campaigns paid in tokens are the fact patterns. The Hunter Biden `$LAPTOP` launch on 9–10 September 2026 is a same-week illustration of the *market* version of this: thin pool, snipers, pre-launch transfers to a market maker, foundation X account suspended, team insisting nobody sold. You do not want that screenshot next to an ETHOnline demo.

### 1.8 Enforcement that actually happened (not vibes)

- **CASP perimeter, not token issuance:** from 1 July 2026 the grandfathering window is closed. Binance told EU customers it would stop serving them around that date. ESMA’s non-compliant-entity register is live (167 names in an August 2026 report; the interim register was last updated **9 September 2026**). This is the enforcement machine that exists today. A Title II offer without a white paper is the same statute, smaller headline, easier case.
- **Germany:** BaFin consumer warnings in 2026 include suspected unauthorised tokenised-security offers (Hartmann & Benz LLC / Easygold Token, 15 June 2026) and unauthorised crypto-asset services (msdplatform, 37mh.com, early September 2026). Pattern: public warning first, then prohibition. White-paper process is operational (`whitepaper@bafin.de`).
- **Slovenia:** ATVP referred the **Magnetix (MAG)** Solana memecoin — promoted in Slovenia as a local success story, launched ~27 February / 1 March 2025, −75% around a 2 April 2025 hotel event, later −99% — to the General Police Directorate on suspected fraud (Siol.net, 2 July 2025; Bloomberg Adria, 7 August 2025; police still calling for injured parties in December 2025). ATVP also issued a public warning on 14 February 2026 that One Ecosystem / OneCoin has no CASP or investment-services permission in Slovenia. **A Slovenian-facing memecoin with a public promoter is a fact pattern ATVP already sends to the police.** Magnetix is not a MiCA white-paper case in the sources I found; it is a fraud/police case. That is worse, not better.
- **I did not find** a published ATVP or BaFin decision that is “identifiable EU developers, fair-launch ERC-20, no promises, no KOL fraud, Title II white-paper failure.” Absence of a published twin is not absence of the rule.

---

## 2. Hackathon and sponsor risk

### 2.1 ETHGlobal’s published rules

Read: [https://ethglobal.com/rules](https://ethglobal.com/rules) (Code of Conduct + event conditions + pre-existing work). Also [https://ethglobal.com/events/ethonline/info/start](https://ethglobal.com/events/ethonline/info/start).

What they actually regulate:

- Harassment, staking, IP (you own what you build; partners do not assign you their APIs), media, disclosure of pre-existing work.
- Classic track: start at kick-off. Continuity / Extend Open Source / Ship a Feature: disclose prior work; only new work is judged; new parts of an extension must be open source.
- Hidden pre-existing work: disqualification, prize clawback, possible ban.

**What they do not say.** I did not find a sentence that forbids launching a token, selling a token, or attaching a ticker to a submission. The rules are silent. Silence is not a licence from Privy, Hedera, or ATVP.

ETHOnline 2026 window: 4–16 September 2026; submission Sunday 13 September. ETHGlobal’s own account has posted the deadline as **13 September 2026, 17:00 UTC**. The team’s working figure is 18:00 CEST. Treat 17:00 UTC as the one on the organiser’s feed.

### 2.2 Sponsor prize terms (ETHOnline 2026, as published)

Hedera, $15,000 — [https://ethglobal.com/events/ethonline2026/prizes/hedera](https://ethglobal.com/events/ethonline2026/prizes/hedera)

- **AI & Agentic Payments, $6,000:** live x402-gated service on Hedera, Blocky402 facilitator, one real paid request. Extra points for HTS tokens *in the settlement path* and HCS audit trails. That is “pay in HBAR/HTS for a service,” which Froggy already does. It is not “launch a meme.”
- **Tokenization of Anything, $6,000:** **Asset Tokenization Studio**, ERC-3643 / ERC-1400, compliance controls, corporate actions. Ideas listed: tokenised treasuries as repo collateral, bonds, KYC-gated equities, invoice factoring. “Real asset classes and real lifecycle management will be favoured **over a token with a name on it**.” A Froggy memecoin submitted here would be off-spec, possibly insulting.
- Continuity $1,000: substantive new Hedera work, not polish.

Privy, $5,000 — [https://ethglobal.com/events/ethonline2026/prizes/privy](https://ethglobal.com/events/ethonline2026/prizes/privy)

- Best B2B financial product / Best financial flow. Qualification is: Privy as core, a real wallet, a real financial flow (transfer, bridge, swap, Earn, onramp), policies/signers/quorums for the B2B prize.
- **No Continuity prize.** No sentence about tokens. Privy is also the production dependency (embedded wallets, user-owned policies). A memecoin launch that uses those wallets as the distribution rail puts the sponsor’s brand next to a retail token sale during the week they are judging you.

Uniswap Foundation, $5,000 — stack contribution, FEEDBACK.md, developer feedback form. v4 hooks are in scope as engineering. A fee-share-to-holders hook is a legal object (see §1.6), not a prize strategy.

I did not find downloadable “prize terms and conditions” PDFs beyond the public prize pages. Eligibility fights at ETHGlobal historically go to pre-existing-work and attendance, not securities law.

### 2.3 Precedents

- **During an ETHGlobal, as the hack:** I did not find a 2025–2026 ETHOnline or ETHGlobal winner whose *submission* was a memecoin launch, nor a published disqualification for launching one.
- **After an ETHGlobal:** Flap (token launch platform) markets itself as originating from an ETHGlobal victory, then launched tokens later (X posts through January 2026). That is “hackathon product, later coin,” not “coin as the hack.”
- **Other hackathons, cautionary:** GSD, Bags Hackathon, May 2026 — first prize ~$100k, token posted, alleged treasury drain and ~90% collapse within ~10 days (NullTX, 22 May 2026). Not ETHGlobal; it is what judges and CT remember when a hackathon team posts a CA.

**Operational recommendation from this section only:** do not put a ticker in the ETHOnline demo, README, or prize video. Do not seed a pool before prizes are decided. Hedera extra points for HTS *settlement* are already available without a Froggy equity-like coin.

---

## 3. Platform risk

### 3.1 Privy (you cannot ship next week without them)

Documents, last update **16 December 2025**, pages still served 9 September 2026:

- Developer Terms: [https://www.privy.io/developer-terms-of-service](https://www.privy.io/developer-terms-of-service)
- Acceptable Use: [https://www.privy.io/acceptable-use-policy](https://www.privy.io/acceptable-use-policy)
- User Terms: [https://www.privy.io/user-terms-of-service](https://www.privy.io/user-terms-of-service)

**What they actually prohibit.**

- Developer Terms §7: use the Services in compliance with **all applicable** local, national and foreign laws (explicitly including privacy, export, transmission of personal data). Comply with the AUP. Do not configure Delegated Actions or Wallets in a manner that is **misleading** or intended to divert assets.
- AUP, prohibited businesses: illegal activity; **deceptive, fraudulent, or abusive** acts; “activities in violation of any law or regulation, including … payment services or money transmission laws.”
- AUP, prohibited uses: false or misleading information about the nature of the business; acting as custodian / payment institution / money transmitter **without appropriate licensure**; using the Privy name in a way that implies untrue endorsement.
- User Terms: do not use the wallet to pay for or support illegal activities; Privy will “take all necessary actions” if they discover a legal/regulatory violation.

**What they do not say.** There is no clause that reads “developers shall not issue tokens” or “shall not offer securities.” Token issuance is covered, if at all, by the **all-applicable-laws** and **deceptive-practices** buckets.

**How this bites.**

- If Design C is a security, using Privy embedded wallets as the place users buy or receive it is using Privy “in violation of applicable law.”
- If you market the token as Privy-endorsed because they are an ETHOnline sponsor, that is an AUP brand violation.
- Delegated Actions (the agent-allowance path Froggy is built on) already require you to describe, accurately, what the agent can sign. Adding “the agent will also buy the Froggy meme” is a disclosure and a policy-engine problem, and it is how you get a user-harm story.
- Privy can suspend the developer account. For this product that is an existential outage, not a slap.

I did not see Privy’s paid customer DPA or any enterprise addendum. The public ToS is the floor.

### 3.2 X

Two different regimes, both relevant because X is how crypto traction is manufactured.

**Paid Partnerships Policy** (rolled out 1 March 2026; help page [https://help.x.com/en/rules-and-policies/paid-partnerships-policy](https://help.x.com/en/rules-and-policies/paid-partnerships-policy)). Financial products, services or opportunities **including crypto** are not eligible for Paid Partnership labels in the **EU, UK and Australia**. Paying a KOL to shill a Froggy token into EU timelines, even with a disclosure label, is against that policy. Undisclosed paid shilling is worse (removal, read-only, suspension).

**Ads.** Separate from Paid Partnerships. X Ads financial-services rules are country-by-country and generally want a licence in the target market. ICO/IEO-style ads have been treated as prohibited in industry write-ups through 2026; I could not re-fetch the live ads policy page in this session (see “What I could not find out”). Do not plan a paid X campaign in DE/SI as the launch motion.

**Organic founder posts** about a token are not banned. Coordinated reply-guy networks, fake engagement, and “guarantee” language are how accounts die. Same-day example: the `$LAPTOP` foundation account was **suspended on 10 September 2026** during a chaotic memecoin launch (CryptoTimes, 10 September 2026).

### 3.3 Launchpads and DEXs

- **pump.fun.** No MiCA licence. UK geoblocked since the FCA unauthorised-firm notice in December 2024. The July 2025 PUMP token sale excluded US, UK, and **EU users on MiCA-compliant venues** (Bybit.eu explicitly blocked). Using pump.fun as a Slovenian/German team to mint a coin that EU residents can buy is the opposite of a compliance strategy. The platform is also in US civil litigation (Aguilar v. Baton Corporation, S.D.N.Y.).
- **Clanker (Base).** Tokenbot launchpad on Base/Farcaster. Neynar, which had acquired Farcaster, said on 17 August 2026 it is seeking a new owner for Farcaster, the app, **and Clanker** (Messari project page, updated 10 September 2026). Do not build a launch on an operator in an ownership fire sale.
- **Uniswap / Base AMM.** This is the realistic “traction” venue. Legal questions that are **open**:
  - Is `app.uniswap.org` a MiCA “trading platform for crypto-assets” operated by a CASP in the Union, or a front-end to a “fully decentralised” protocol (Recital 22)?
  - Commission Q&A 2671 (21 May 2026): a DEX listing **in the Union** *could* be a public offer if the DEX is not fully decentralised; NCAs decide case by case; the Commission did not give the test.
  - Uniswap Labs’ own 23 July 2026 work is **permissioned pools** for ERC-3643 / tokenised funds (Superstate, Securitize, Dowgo). The institutional path is KYC-gated hooks, not a fair-launch meme.

Seeding a Base pool from a founder wallet, announcing the CA on X, and embedding a swap widget in Froggy is, in substance, an offer to the EU public. Plan for a white paper and a legal person, or do not do it.

### 3.4 Exchanges (CEX)

After 1 July 2026, an EU CASP listing a Title II asset wants a notified white paper (or Q&A 2552 “no issuer,” which you do not have). ESMA’s interim register of Title II white papers is the check they run. There is no realistic path from “launch Friday, Binance Monday.” Revolut’s published PUMP white paper (May 2026) is an example of a CASP documenting a third-party meme as a utility token after the fact — that is *their* problem, not a template for an issuer.

### 3.5 Railway / the production host

Out of scope to scrape Railway’s ToS in this lane. Flag only: a token sale checkout on the same origin as the production app concentrates abuse reports, chargebacks, and ToS risk on the box that currently takes real USDC.

---

## 4. Reputational risk with the actual audience

Froggy’s audience this month is ETHOnline judges, Privy, Hedera, x402 people, and whoever is already paying the live app. That is not pump.fun Twitter.

**What this cycle’s infra people are saying (2026, not 2021).**

- Sherlock (audit firm, 10 March 2026), *How to Build an AI Agent Token*: “Build the agent before the token.” Surviving 2025 AI tokens had a working agent producing on-chain activity **before TGE**. “Treating the token as the product” is listed as a failure mode; 90%+ drawdowns clustered there.
- Named-founder vs anon: @Azyxbt, 10 September 2026: serious founders looking at ICM-before-product are “staking [the] entire product's reputation,” while anon meme devs move on. Continuation after TGE is rare; larger caps become a distraction (ai16z, zerebro cited).
- Timing: @0xWenMoon, 9 September 2026, on a different launch: “why launch a token now, before any users?” is already a punchline. Froggy **has** a product. Launching the coin *before the product is respected* throws that advantage away.
- Chain-level: @Jeremybtc, 23 July 2026 (22k views): new infra pivoting to memes for attention onboards the wrong users; the dump kills the chain’s reputation. Same mechanic, product-scale: the dump kills the app’s reputation with the people who were going to grant allowances.

**Does launching after the product is respected change it?** Yes, partly. A mascot with no financial rights, no access-gate, no founder allocation, after months of real x402 volume and an HCS audit trail, is a different conversation with infra people — they may still roll their eyes, but they will not say you had nothing else to sell. Launching **during** ETHOnline, while asking Privy and Hedera for prizes, is the version that reads as “the demo was a ticker.” Hedera’s own prize copy already sneers at “a token with a name on it.”

**Slovenian local overlay.** Magnetix is in the national press as the memecoin that ended in a hotel fight and a police file. A second Slovenian-facing coin from a public team will be covered with that template, not with the x402 white paper.

---

## 5. The line

### Clearly fine

- Ship the ETHOnline demo with **no ticker**, no pool, no “coming soon $FROG.”
- Keep charging USDC/HBAR. Do not force a new asset into the paid path.
- If you ever want a community token: form a **legal person** in SI or DE; get written advice on classification; if it is Title II, notify a white paper 20 working days out; if counsel says it is a financial instrument, **stop**.
- Token, if any, confers **no** profit, revenue, redemption, or treasury vote. Marketing matches that. No KOL retainers targeting EU/UK/AU.
- Distribution is not “buy on a DEX to use Froggy.” Optional merch/mascot at most.
- Privy is used for the product you already built, not as the issuance rail.
- Wait until prizes are decided and the live product has a usage story that does not need a coin.

### Clearly reckless

- Launch this week, during judging.
- “Require 1,000,000 tokens to use the app” while the app already takes real money.
- Promise fee sharing, hook dividends, buybacks, or “holders capture the take-rate.”
- Three natural persons, no company, public CA on X.
- Pay EU influencers; use Paid Partnerships into EU timelines; imply Privy or Hedera backing.
- Seed a thin pool, keep an insider stash, post “utility incoming” into the spike.
- Submit the memecoin as Hedera “Tokenization of Anything.”
- Claim “no issuer / just a meme / SEC staff said it’s fine” while the team is on the ETHOnline packet.

### Where the line actually is

**Identifiable EU persons + a publicly tradable token + (access to a paid service **or** any path for holders to get economics from the app) = you are an offeror under Title II or an issuer of a financial instrument under MiFID II.** The meme label does not move you. The live-utility exemption does not survive a listing campaign. Fee sharing is the feature that most reliably pushes the object into securities land. Launching it as the hackathon motion spends sponsor trust you need for the product you already have.

If the goal is traction for *Froggy the product*, a coin is a worse instrument than a public x402 volume chart, an HCS topic explorer, and a Privy-policy demo that a judge can break. If the goal is traction for *a coin*, you are no longer in the business described in the first paragraph of this file, and the legal stack above is the cost of that business in the EU in September 2026.

---

## Sources

Official / primary

- Regulation (EU) 2023/1114 (MiCA), consolidated: [https://eur-lex.europa.eu/eli/reg/2023/1114/2024-01-09/eng](https://eur-lex.europa.eu/eli/reg/2023/1114/2024-01-09/eng) (consolidated 9 January 2024; the regulation itself is 31 May 2023).
- MiCA Article 4 (offers, exemptions, admission tripwire): [https://www.springlex.eu/en/packages/mica/mica-regulation/article-4/](https://www.springlex.eu/en/packages/mica/mica-regulation/article-4/) (page fetched 10 September 2026).
- MiCA Article 13 (14-day withdrawal): [https://www.springlex.eu/en/packages/mica/mica-regulation/article-13/](https://www.springlex.eu/en/packages/mica/mica-regulation/article-13/) (fetched 10 September 2026).
- MiCA Article 15 (white-paper liability): [https://www.springlex.eu/en/packages/mica/mica-regulation/article-15/](https://www.springlex.eu/en/packages/mica/mica-regulation/article-15/).
- MiCA Article 111 (penalties): [https://www.springlex.eu/en/packages/mica/mica-regulation/article-111/](https://www.springlex.eu/en/packages/mica/mica-regulation/article-111/).
- ESMA CAFI guidelines PDF: [https://www.esma.europa.eu/sites/default/files/2025-03/ESMA75453128700-1323_Guidelines_on_the_conditions_and_criteria_for_the_qualification_of_CAs_as_FIs.pdf](https://www.esma.europa.eu/sites/default/files/2025-03/ESMA75453128700-1323_Guidelines_on_the_conditions_and_criteria_for_the_qualification_of_CAs_as_FIs.pdf) (19 March 2025 translations; apply 18 May 2025).
- ESMA CAFI landing page: [https://www.esma.europa.eu/document/guidelines-conditions-and-criteria-qualification-crypto-assets-financial-instruments](https://www.esma.europa.eu/document/guidelines-conditions-and-criteria-qualification-crypto-assets-financial-instruments).
- ESMA MiCA page / interim register (last update **9 September 2026**): [https://www.esma.europa.eu/esmas-activities/digital-finance-and-innovation/markets-crypto-assets-regulation-mica](https://www.esma.europa.eu/esmas-activities/digital-finance-and-innovation/markets-crypto-assets-regulation-mica).
- ESMA Q&A 2671 write-up (Commission answer 21 May 2026 on Art. 4(4) and DEX listings): [https://www.micacryptoalliance.com/news/esma-q-a-on-mica-white-paper-exemptions-and-territorial-scope](https://www.micacryptoalliance.com/news/esma-q-a-on-mica-white-paper-exemptions-and-territorial-scope) (29 May 2026). Official node cited there: [https://www.esma.europa.eu/print/pdf/node/222469](https://www.esma.europa.eu/print/pdf/node/222469).
- ESMA Q&A 2552 (no identifiable issuer; Commission, 18 February 2026), discussed in: [https://conventuslaw.com/report/crypto-assets-without-an-identifiable-issuer-regulatory-reality-two-years-post-micar-application-date/](https://conventuslaw.com/report/crypto-assets-without-an-identifiable-issuer-regulatory-reality-two-years-post-micar-application-date/) (21 July 2026).
- BaFin crypto-institutions / Title II white paper filing: [https://www.bafin.de/EN/unternehmen-maerkte/aufsicht/kryptoinstitute/kryptoinstitute_node_en.html](https://www.bafin.de/EN/unternehmen-maerkte/aufsicht/kryptoinstitute/kryptoinstitute_node_en.html).
- BaFin consumer warnings (Easygold 15 June 2026; msdplatform / 37mh.com September 2026): [https://www.bafin.de/EN/verbraucherinnen-verbraucher/news-warnungen/news-warnungen_node_en.html](https://www.bafin.de/EN/verbraucherinnen-verbraucher/news-warnungen/news-warnungen_node_en.html).
- KMAG text: [https://www.gesetze-im-internet.de/kmag/BJNR1B60B0024.html](https://www.gesetze-im-internet.de/kmag/BJNR1B60B0024.html); §15 suspension/prohibition: [https://www.buzer.de/gesetz/16826/b46880.htm](https://www.buzer.de/gesetz/16826/b46880.htm).
- ATVP MiCA guidelines list: [https://www.a-tvp.si/en/mica-regulation-guidelines/](https://www.a-tvp.si/en/mica-regulation-guidelines/).
- SEC staff statement on meme coins, 27 February 2025: [https://www.sec.gov/newsroom/speeches-statements/staff-statement-meme-coins](https://www.sec.gov/newsroom/speeches-statements/staff-statement-meme-coins).

ETHGlobal / sponsors

- ETHGlobal rules: [https://ethglobal.com/rules](https://ethglobal.com/rules).
- ETHOnline start/info: [https://ethglobal.com/events/ethonline/info/start](https://ethglobal.com/events/ethonline/info/start).
- Hedera prizes: [https://ethglobal.com/events/ethonline2026/prizes/hedera](https://ethglobal.com/events/ethonline2026/prizes/hedera) (fetched 10 September 2026).
- Privy prizes: [https://ethglobal.com/events/ethonline2026/prizes/privy](https://ethglobal.com/events/ethonline2026/prizes/privy) (fetched 10 September 2026).
- Uniswap Foundation prizes: [https://ethglobal.com/events/ethonline2026/prizes/uniswap-foundation](https://ethglobal.com/events/ethonline2026/prizes/uniswap-foundation).
- Continuity-track announcement (Kartik Talwar): [https://paragraph.com/@blog.ethglobal/changing-how-hackathons-work](https://paragraph.com/@blog.ethglobal/changing-how-hackathons-work).

Privy / X / venues

- Privy Developer ToS (16 December 2025): [https://www.privy.io/developer-terms-of-service](https://www.privy.io/developer-terms-of-service).
- Privy AUP (16 December 2025): [https://www.privy.io/acceptable-use-policy](https://www.privy.io/acceptable-use-policy).
- X Paid Partnerships Policy: [https://help.x.com/en/rules-and-policies/paid-partnerships-policy](https://help.x.com/en/rules-and-policies/paid-partnerships-policy) (policy dated around 1–9 March 2026). Secondary reporting: Payment Expert 3 March 2026 [https://paymentexpert.com/2026/03/03/x-bans-crypto-partnerships/](https://paymentexpert.com/2026/03/03/x-bans-crypto-partnerships/); CCN 2 March 2026 [https://www.ccn.com/news/crypto/x-paid-partnership-labels-crypto-eu-uk-australia-ban/](https://www.ccn.com/news/crypto/x-paid-partnership-labels-crypto-eu-uk-australia-ban/).
- Uniswap Permissioned Pools, 23 July 2026: [https://blog.uniswap.org/introducing-permissioned-pools-on-uniswap-v4](https://blog.uniswap.org/introducing-permissioned-pools-on-uniswap-v4).
- pump.fun restricted countries: [https://www.datawallet.com/crypto/pump-fun-restricted-countries](https://www.datawallet.com/crypto/pump-fun-restricted-countries) (28 July 2026). Bybit EU block of PUMP sale: [https://bitcoinethereumnews.com/tech/bybit-blocks-european-users-from-pump-fun-token-sale/](https://bitcoinethereumnews.com/tech/bybit-blocks-european-users-from-pump-fun-token-sale/) (9 July 2025).

Commentary used for classification practice (not law)

- gunnercooke, utility vs security tokens (Germany), 29 June 2026: [https://gunnercooke.com/utility-tokens-vs-security-tokens-understanding-the-regulatory-distinction/](https://gunnercooke.com/utility-tokens-vs-security-tokens-understanding-the-regulatory-distinction/).
- Compliora, utility vs security vs EMT vs ART, 20 April 2026: [https://compliora.ai/blog/utility-token-vs-security-token-vs-emt-vs-art](https://compliora.ai/blog/utility-token-vs-security-token-vs-emt-vs-art).
- Legalcode, MiCA vs MiFID vs e-money, 31 July 2026: [https://legalcode.md/blog/digital-token-crypto-asset-mica-financial-instrument-mifid-ii-electronic-money](https://legalcode.md/blog/digital-token-crypto-asset-mica-financial-instrument-mifid-ii-electronic-money).
- Legalnodes, “Are you in scope for MiCA in 2026?”, 6 July 2026: [https://legalnodes.com/article/token-issuance-mica-guide](https://legalnodes.com/article/token-issuance-mica-guide).
- CMS Expert Guide, Slovenia, updated 18 August 2026: [https://cms.law/en/int/expert-guides/cms-expert-guide-to-crypto-regulation/slovenia](https://cms.law/en/int/expert-guides/cms-expert-guide-to-crypto-regulation/slovenia).
- Global Legal Insights, Germany 2026 chapter, 21 October 2025: [https://www.globallegalinsights.com/practice-areas/blockchain-cryptocurrency-laws-and-regulations/germany/](https://www.globallegalinsights.com/practice-areas/blockchain-cryptocurrency-laws-and-regulations/germany/).
- Scorechain, MiCA grandfathering, 26 June 2026: [https://www.scorechain.com/blog/mica-grandfathering-explained](https://www.scorechain.com/blog/mica-grandfathering-explained).
- Klarproof MiCA guide (penalties table), 6 May 2026: [https://klarproof.com/mica](https://klarproof.com/mica).
- EMT register snapshot, 7 September 2026: [https://casptracker.eu/e-money-token-list-under-mica/](https://casptracker.eu/e-money-token-list-under-mica/).
- Fin-Law, BaFin white-paper powers, 18 March 2026: [https://fin-law.de/wp-content/uploads/2026/03/26_03_18_The-Crypto-Asset-White-Paper-What-Are-BaFins-Powers-Regarding-Token-Offerings_PR.pdf](https://fin-law.de/wp-content/uploads/2026/03/26_03_18_The-Crypto-Asset-White-Paper-What-Are-BaFins-Powers-Regarding-Token-Offerings_PR.pdf).

Enforcement / local / reputation

- Magnetix: Siol.net 2 July 2025 [https://siol.net/novice/slovenija/kdor-je-verjel-temu-slovencu-mu-je-danes-zelo-zal-666519](https://siol.net/novice/slovenija/kdor-je-verjel-temu-slovencu-mu-je-danes-zelo-zal-666519); Bloomberg Adria 7 August 2025 [https://si.bloombergadria.com/financni-trgi/kripto-trg/84908/s-primerom-kriptokovanca-magnetix-se-ukvarja-policija/news](https://si.bloombergadria.com/financni-trgi/kripto-trg/84908/s-primerom-kriptokovanca-magnetix-se-ukvarja-policija/news).
- ATVP One Ecosystem warning, 14 February 2026: [https://kriptomagazin.si/atvp-opozarja-da-one-ecosystem-oes-oziroma-onecoin-nima-dovoljenj-v-sloveniji/](https://kriptomagazin.si/atvp-opozarja-da-one-ecosystem-oes-oziroma-onecoin-nima-dovoljenj-v-sloveniji/).
- `$LAPTOP` launch and X suspension, 9–10 September 2026: [https://www.cryptotimes.io/2026/09/10/hunter-biden-denies-laptop-profit-as-memecoin-crashes-95-foundations-x-account-suspended/](https://www.cryptotimes.io/2026/09/10/hunter-biden-denies-laptop-profit-as-memecoin-crashes-95-foundations-x-account-suspended/).
- GSD / Bags Hackathon, 22 May 2026: [https://nulltx.com/hackathon-champion-to-failed-project-in-10-days-gsd-founder-allegedly-rugs-just-after-receiving-his-100k-grant/](https://nulltx.com/hackathon-champion-to-failed-project-in-10-days-gsd-founder-allegedly-rugs-just-after-receiving-his-100k-grant/).
- Sherlock, AI agent tokens, 10 March 2026: [https://sherlock.xyz/post/how-to-build-an-ai-agent-token-the-dos-and-donts](https://sherlock.xyz/post/how-to-build-an-ai-agent-token-the-dos-and-donts).
- X, @Jeremybtc, 23 July 2026: [https://x.com/Jeremybtc/status/2080332863560724727](https://x.com/Jeremybtc/status/2080332863560724727).
- X, @Azyxbt, 10 September 2026: [https://x.com/Azyxbt/status/2097908076791890327](https://x.com/Azyxbt/status/2097908076791890327).
- X, @0xWenMoon, 9 September 2026: [https://x.com/0xWenMoon/status/2097568208777814150](https://x.com/0xWenMoon/status/2097568208777814150).
- Clanker operator uncertainty, Messari, 10 September 2026: [https://messari.io/project/tokenbot-clanker](https://messari.io/project/tokenbot-clanker).

---

## What I could not find out

These are real gaps, not leftovers.

1. **ETHGlobal prize contracts.** Public prize pages and `ethglobal.com/rules` are silent on token launches. I did not find a participant agreement, sponsor prize T&C PDF, or judging rubric that says yes or no. Hedera’s “token with a name on it” line is the closest published snub.
2. **Whether Uniswap v4 / `app.uniswap.org` is a MiCA trading platform.** Commission Q&A 2671 leaves it to NCAs and does not define “fully decentralised.” I found no BaFin or ATVP decision applying Recital 22 to Uniswap, Aerodrome, or a Base bonding curve in 2025–2026.
3. **A published NCA case that is this fact pattern.** Identifiable EU devs, live product, fair-launch meme, no fraud allegations. Magnetix is fraud/police, not a Title II white-paper ruling. BaFin 2026 warnings I found are unauthorised CASP activity and suspected tokenised securities, not a clean meme.
4. **ZIUTK penalty schedule in euros.** CMS confirms ZIUTK sets the Slovenian sanctions regime; I did not pull the Official Gazette 95/2024 fine table. Use MiCA Article 111 minima as the floor, not the Slovenian number.
5. **Whether this team already has a legal person, and where.** The whole Article 4(1)(a) / home-NCA analysis depends on it. Not in the brief.
6. **Privy enterprise terms.** Public Developer ToS + AUP only. A paid plan may add a restricted-business list I cannot see.
7. **Live X Ads crypto policy by country.** The Paid Partnerships EU/UK/AU ban is well attested (March 2026). The ads-policy HTML (business.x.com financial-services) did not return a clean fetch in this session; country-level advertiser-licence rules should be re-read immediately before any paid campaign.
8. **Railway, Base, Circle, Hedera customer ToS** on token issuance by apps running on their rails. Not reviewed here. Circle EMT status of USDC does not licence a second token.
9. **Tax.** Token issuance, airdrops, and founder allocations are taxable events in DE/SI. No 2026 tax opinion in this file.
10. **US, UK, and other extra-EEA users of the live app.** The product is on the public internet. Howey / FCA financial-promotions exposure if Americans or Brits can buy from a widget in the app was not mapped beyond the SEC February 2025 staff statement.
11. **Whether Froggy’s current activity is already a CASP service.** Selling your own x402 services for USDC/HBAR is generally not “operating a trading platform” or “exchanging crypto-assets for funds” as a third-party service. I did not do a full CASP perimeter memo. Adding a token you also list and swap in-app could change that.
12. **ETHOnline 2026 teams that launched tokens this week.** Too early; submissions are still open. No 2026 online-event post-mortem exists yet.

If you do only one thing before Sunday: **do not put a contract address in the submission.** If you do only one thing after Sunday: **talk to ATVP/BaFin counsel with the classification fork in §1.3 on the table, before anyone deploys.**
