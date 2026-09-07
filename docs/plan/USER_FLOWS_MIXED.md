# Mixed flows: an x402 service and a card checkout in one task

Three scenarios the team can pick from for the showcase the 7 Sep sync asked for: the agent buys a marketplace service over Hedera x402 and then pays a merchant with the person's card, in one task, without being blocked by either kind of payment. Each names what Froggy does, what the person sees, and which lane has to land first.

## 1. Plan a weekend

**Ask, in Telegram or the chat:** "Find me a cheap weekend in Vienna next month: train from Munich and a hotel under €120 a night. Book the hotel."

1. Froggy buys `web_search` twice ($0.03 each, paid in HBAR from the person's own Hedera account; You.com paid by the treasury on Base). Two Hedera settlements land in the wallet's activity, each with its HashScan link.
2. It presents three options with prices and asks which one. The person answers in the chat or on Telegram.
3. Froggy opens the hotel's booking page in the shared Chrome, fills the form, and at the payment step fills the card by name: the model asks for "the card ending 1234", never sees the number, and the frames are masked while the fields are filled.
4. 3-D Secure arrives as an approval ticket, on the web and on Telegram: "Finish the bank check for hotel.example in the page." The person takes the page, completes it, and hands it back.
5. The order confirmation is captured into the task with the order id. The receipts show two x402 settlements and one card charge, in that order.

Needs: lane 7 tasks 3.2 (sealed card, masked fill), the 3DS ticket, confirmation capture. Cheapest to record because the two purchases are small and the merchant can be a test shop.

## 2. A gift with a picture

**Ask:** "Make a birthday card for Ana with a frog on a bicycle and order ten prints to my address."

1. Froggy buys `image` ($0.12) over Hedera; BlockRun is paid by the treasury. The picture shows in the services page and in the chat.
2. It opens a print shop, uploads the image, fills the address from what the person typed, and reaches checkout.
3. The card account on Linea is read: balance and allowance. If the allowance is short of the total, Froggy quotes a CCTP fast transfer from the Privy wallet as a ticket; if the person says no, the task ends with a plain refusal and the picture is still theirs.
4. Otherwise the card is filled by name, 3-D Secure is a ticket, the order id is captured.

Needs: 3.1 (Linea read), 3.2, and 3.3 if the allowance top-up is shown; 3.3 can be skipped by pre-funding the card.

## 3. Research, then subscribe, then be stopped

**Ask:** "Which of these three note-taking tools is best for a team of four? Subscribe us to the winner."

1. Froggy asks `inference` ($0.03) for a comparison from the three pricing pages it fetched, and shows it.
2. It opens the winner's sign-up page and reaches a $48 a month plan.
3. With spending limits on for the demo, the approval threshold parks the checkout as a ticket. The person says "not this time". The receipt names the rule, the card is never filled, and the task ends with the comparison as its result.

Needs: 3.2 for the fill that does not happen; the ticket and the refusal exist today. The cheapest way to show the leash beside a marketplace purchase in one run.

## Order of work

Write 1 first. It exercises every piece once and the merchant can be a sandbox. 3 is the control beat and costs nothing extra once 1 works. 2 depends on the Linea read and, if shown, the bridge.
