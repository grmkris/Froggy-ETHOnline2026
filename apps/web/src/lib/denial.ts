/**
 * Which layer said no, in one sentence each.
 *
 * Two things can refuse a spend and they are different facts. The mandate
 * refuses before any key is touched, and its code says which rule. The
 * signer refuses after the mandate allowed, in its own words, under its own
 * policy. A person reading a refused ticket should be able to tell which
 * happened without knowing what a policy engine is.
 */

import type { DenialCode, Receipt } from "@froggy/domain";

const CODE_WORDS: Record<DenialCode, string> = {
  approval_denied: "You said no.",
  approval_timeout: "Nobody answered in time.",
  approval_unavailable: "There was no one to ask.",
  conversion_failed:
    "Your USDC could not be turned into HBAR for this payment; the receipt says who refused.",
  expired: "The mandate has expired.",
  frozen: "The wallet is frozen.",
  host_not_allowed: "That host is not on the list.",
  network_not_allowed: "That network is not allowed.",
  payee_not_allowed: "That payee is not on the list.",
  per_tx_cap_exceeded: "Over the cap for one payment.",
  pocket_exhausted: "The pocket does not hold enough. A top-up fixes it.",
  unpriceable: "The asset could not be priced, so nothing was judged.",
  untrusted_provenance:
    "The address came from a page or from the model, not from you.",
  window_cap_exceeded: "Over the rolling cap.",
};

export interface Layer {
  /** Who refused, and when in the chain. */
  readonly who: string;
  /** Why, in plain words. */
  readonly why: string;
}

/** Null for a receipt nothing refused. */
export const layerOf = (receipt: Receipt): Layer | null => {
  if (receipt.decision._tag === "deny") {
    return {
      who: "The mandate refused, before any key was touched.",
      why: CODE_WORDS[receipt.decision.code],
    };
  }
  if (receipt.failure !== undefined) {
    return /privy|policy/iu.test(receipt.failure)
      ? {
          who: "The mandate allowed; the signer refused, under its own policy.",
          why: receipt.failure,
        }
      : {
          who: "The mandate allowed; the payment did not go through.",
          why: receipt.failure,
        };
  }
  return null;
};
