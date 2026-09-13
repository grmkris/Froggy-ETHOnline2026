import type { HostedRunInput } from "@froggy/browser";
import type { CardCheckout } from "@froggy/domain";

import type { Services } from "./services";
import type { Workspace } from "./workspaces";

const cardInspectionPrompt =
  'Inspect the current checkout in this shared Chrome. Do not submit an order or payment and do not enter card data. Establish the final total after shipping and tax. Ask the human to take over for login, CAPTCHA, shipping choices or missing totals. Return ONLY JSON: {"v":1,"merchant":"actual-top-level-host.example","item":"short item description","total":"12.34","currency":"USD","finalTotal":true,"paymentHosts":["necessary-card-iframe-host.example"]}. Include only current required payment-frame hosts. Never guess totals, recipients or permissions. If incomplete, return {"v":1,"needsHelp":true}.';
export const cardRunInput = async (
  services: Services,
  workspace: Workspace,
  checkout: CardCheckout,
  stage: "inspect" | "pay" | "reconcile"
): Promise<Pick<HostedRunInput, "task" | "secretBindings">> => {
  if (stage === "inspect") {
    return { task: cardInspectionPrompt };
  }
  if (stage === "reconcile" || checkout.paymentDispatchedAt !== null) {
    return {
      task: 'Inspect the existing order page in the same Chrome session. A card payment may already have been submitted. Do not enter card data, click Pay/Buy/Place order, or create another order. Wait for the human to complete any login, CAPTCHA or 3DS challenge. Report ONLY JSON {"v":1,"status":"order_observed"|"needs_help"|"unknown","order":"short observed order reference or null"}. No card information or page dumps.',
    };
  }
  if (checkout.stubbed && services.environment.modes.browser === "live") {
    throw new Error(
      "card.stub: simulated funding cannot release card credentials into a live browser."
    );
  }
  const { inspection } = checkout;
  if (inspection === null || workspace.browser.checkoutFrames === undefined) {
    throw new Error("card.frames: current payment frames cannot be verified.");
  }
  const frames = await workspace.browser.checkoutFrames();
  const credentials = await services.cards.dispatchCredentials(
    workspace.userId,
    checkout.id,
    frames
  );
  const domains = [
    ...new Set([inspection.merchant, ...inspection.paymentHosts]),
  ];
  const entries = {
    card_name: credentials.name,
    card_number: credentials.number,
    card_month: credentials.expiryMonth,
    card_year: credentials.expiryYear,
    card_cvc: credentials.cvc,
  };
  return {
    task: `Complete this explicitly approved purchase in the same shared Chrome. Approved merchant: ${inspection.merchant}. Exact approved total: ${inspection.total} ${inspection.currency}. Before typing any alias and immediately before submitting, verify the visible merchant and final total match exactly. If either changed, return changed and do not submit. Fill the card fields using the server-side secret aliases card_name, card_number, card_month, card_year, card_cvc with the iframe-capable browser entry tool. Never read back, print, screenshot, save, share or include card fields in a result. Do not use scripts or HTTP to retrieve secrets. Submit the order once only. On decline, do not retry. For login, CAPTCHA, shipping details or 3DS, request human takeover; do not solve them. Return ONLY JSON {"v":1,"status":"order_observed"|"needs_help"|"declined"|"changed"|"unknown","order":"short observed order reference or null"}. An order confirmation is not proof of an issuer charge.`,
    secretBindings: Object.entries(entries).map(([alias, value]) => ({
      alias,
      source: { type: "inline", value },
      allowedDomains: domains,
    })),
  };
};
