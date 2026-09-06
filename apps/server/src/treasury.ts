/**
 * What Froggy buys with its own money.
 *
 * The person pays Froggy; Froggy pays its suppliers. The Graph's gateway
 * prices a query with a 402 on Base, and the treasury wallet, a Privy app
 * wallet whose policy allows exactly that payment and nothing else, signs
 * it. No mandate is consulted: this is not the person's money, and the
 * policy is the leash. Every settlement is noted on HCS like any other.
 */

import type { HcsWriter, Payer } from "@froggy/payments";
import {
  challengeFrom,
  decodeSettlementHeader,
  paymentHeaders,
  settlementHeaderFrom,
} from "@froggy/payments";

import { safeFetch } from "./outbound";
import type { OutboundOptions } from "./outbound";

export interface TreasuryDeps {
  readonly hcs: HcsWriter;
  readonly outbound: OutboundOptions;
  readonly payer: Payer;
}

/**
 * A fetch that pays a 402 from the treasury and returns the paid answer.
 * A challenge the treasury cannot meet comes back as the 402 itself with
 * the reason in the body, never as a throw: the caller decides what an
 * unpaid supplier means for the person.
 */
export const treasuryFetch = async (
  deps: TreasuryDeps,
  url: string,
  init: RequestInit
): Promise<Response> => {
  const first = await safeFetch(url, init, deps.outbound);
  if (first.status !== 402) {
    return first;
  }
  const challenge = await challengeFrom(first);
  if (challenge === null) {
    return Response.json(
      {
        errors: [
          {
            message:
              "The supplier asked for payment without usable requirements.",
          },
        ],
      },
      { status: 402 }
    );
  }
  const attempt = await deps.payer.pay(challenge);
  if (attempt.header === null || attempt.requirements === null) {
    return Response.json(
      {
        errors: [
          {
            message: `The treasury could not pay: ${attempt.error ?? "no payment could be built"}.`,
          },
        ],
      },
      { status: 402 }
    );
  }
  const headers = new Headers(init.headers);
  const payment = paymentHeaders(attempt.header);
  headers.set("x-payment", payment["x-payment"]);
  headers.set("payment-signature", payment["payment-signature"]);
  const paid = await safeFetch(url, { ...init, headers }, deps.outbound);
  const settlement = decodeSettlementHeader(settlementHeaderFrom(paid.headers));
  if (settlement !== null) {
    // Best effort, like every note: the payment already happened.
    await deps.hcs.record({
      amount: attempt.requirements.amount,
      asset: attempt.requirements.asset,
      at: Date.now(),
      kind: "paid",
      network: settlement.network ?? attempt.requirements.network,
      ref: null,
      transactionId: settlement.transactionId,
    });
  }
  return paid;
};
