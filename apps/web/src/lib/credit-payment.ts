/**
 * Paying a USDC credit quote from the browser.
 *
 * The person is the x402 client for their own purchase: read the frozen quote
 * the server answers with a 402, build the EIP-3009 authorization from it, sign
 * with the embedded wallet, and hand the header back. The server pins the
 * header to the quote, checks the signature, and settles from the treasury.
 * Nothing here can widen the payment: every number in the signed document
 * comes from the quote, and the server refuses anything that differs.
 */
import {
  CreditPurchase,
  X402Challenge,
  encodeExactPaymentHeader,
  exactEvmTypedData,
  nonceHex,
  selectExactEvmAccept,
} from "@froggy/protocol";
import { Schema } from "effect";

import type { Identity } from "./privy";

export type CreditPaymentOutcome =
  | { readonly kind: "submitted"; readonly purchase: CreditPurchase }
  | { readonly kind: "closed" }
  | { readonly kind: "no-signer" }
  | { readonly kind: "expired" }
  | { readonly kind: "refused"; readonly reason: string };

const OUTCOME_WORDS = {
  closed: "Nothing was signed. Confirm again when you are ready.",
  "no-signer": "Paying with USDC needs a Privy sign-in in this browser.",
  expired: "This quote expired. Start a new purchase.",
} satisfies Record<string, string>;

/** Every outcome but the happy one, as the sentence shown under the button. */
export const creditPaymentWords = (
  outcome: Exclude<CreditPaymentOutcome, { kind: "submitted" }>
): string =>
  outcome.kind === "refused" ? outcome.reason : OUTCOME_WORDS[outcome.kind];

const ErrorBody = Schema.Struct({
  code: Schema.optional(Schema.String),
  error: Schema.String,
});
const decodeError = Schema.decodeUnknownResult(ErrorBody);
const decodeChallenge = Schema.decodeUnknownResult(X402Challenge);
const decodePurchase = Schema.decodeUnknownResult(CreditPurchase);

const UNREACHABLE = "Froggy could not be reached. Nothing was paid.";

const refusal = async (
  response: Response
): Promise<Extract<CreditPaymentOutcome, { kind: "expired" | "refused" }>> => {
  const body: unknown = await response.json().catch(() => null);
  const decoded = decodeError(body);
  if (decoded._tag !== "Success") {
    return { kind: "refused", reason: "Froggy answered unexpectedly." };
  }
  return decoded.success.code === "quote_expired"
    ? { kind: "expired" }
    : { kind: "refused", reason: decoded.success.error };
};

const randomNonce = (): Uint8Array =>
  crypto.getRandomValues(new Uint8Array(32));

export const payCreditPurchaseInBrowser = async (input: {
  readonly purchase: CreditPurchase;
  readonly address: string | null;
  readonly sign: Identity["signTypedData"];
  readonly token: string | null;
  readonly randomBytes?: () => Uint8Array;
}): Promise<CreditPaymentOutcome> => {
  const { purchase, address, sign } = input;
  if (sign === null || address === null) {
    return { kind: "no-signer" };
  }
  const url = `/api/credits/purchases/${purchase.id}/pay`;
  const authorization = `Bearer ${input.token ?? ""}`;

  let quoted: Response;
  try {
    quoted = await fetch(url, {
      method: "GET",
      headers: { authorization },
      cache: "no-store",
    });
  } catch {
    return { kind: "refused", reason: UNREACHABLE };
  }
  if (quoted.status !== 402) {
    return await refusal(quoted);
  }
  const challenge = decodeChallenge(await quoted.json().catch(() => null));
  if (challenge._tag !== "Success" || challenge.success.x402Version !== 2) {
    return { kind: "refused", reason: "Froggy answered unexpectedly." };
  }
  const accept = selectExactEvmAccept(challenge.success, purchase.network);
  if (accept === null) {
    return {
      kind: "refused",
      reason: "This quote no longer offers USDC on your network.",
    };
  }

  // Anchored to the server's clock, not the browser's: the quote's expiry
  // plus the offer's window is exactly what the server will accept.
  const validBefore =
    Math.floor(purchase.expiresAt / 1000) + accept.maxTimeoutSeconds;
  const typedData = exactEvmTypedData({
    accept,
    from: address,
    nonce: nonceHex((input.randomBytes ?? randomNonce)()),
    validBefore,
  });
  const signed = await sign({
    typedData,
    address,
    words: {
      title: `Pay ${purchase.amount} USDC base units for credits`,
      description:
        "Authorizes one USDC transfer to Froggy for this purchase. Nothing else, and it expires with the quote.",
      buttonText: "Sign and pay",
    },
  });
  if (signed.kind === "closed") {
    return { kind: "closed" };
  }
  if (signed.kind === "refused") {
    return {
      kind: "refused",
      reason: `Your wallet did not sign the payment: ${signed.reason}`,
    };
  }

  const header = encodeExactPaymentHeader({
    accept,
    resource: challenge.success.resource,
    authorization: typedData.message,
    signature: signed.signature,
  });
  let accepted: Response;
  try {
    accepted = await fetch(url, {
      method: "POST",
      headers: { authorization, "payment-signature": header },
      cache: "no-store",
    });
  } catch {
    return { kind: "refused", reason: UNREACHABLE };
  }
  if (!accepted.ok) {
    return await refusal(accepted);
  }
  const claimed = decodePurchase(await accepted.json().catch(() => null));
  if (claimed._tag !== "Success") {
    return { kind: "refused", reason: "Froggy answered unexpectedly." };
  }
  return { kind: "submitted", purchase: claimed.success };
};
