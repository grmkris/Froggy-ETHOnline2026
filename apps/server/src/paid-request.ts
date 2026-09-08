/**
 * One request that may cost money, under the mandate.
 *
 * This is the choke point every paid HTTP request goes through — the
 * `x402_fetch` tool, and The Graph's pay-per-query gateway — so the order of
 * checks is written once: the URL is public, the host is on the allowlist,
 * an unattended job has not already paid, the 402 decodes, a payer exists
 * for one of its offers, and only then does `session.spend` judge, reserve,
 * pay and file the receipt. Nothing here decides whether money moves; the
 * policy does, inside `spend`.
 */

import type { Evidence, Receipt } from "@froggy/domain";
import { publicHttpUrl } from "@froggy/domain";
import {
  challengeFrom,
  decodeSettlementHeader,
  describePayment,
  paymentHeaders,
  reconcileHederaPayment,
  settlementHeaderFrom,
  SignerRefusedError,
} from "@froggy/payments";
import type { PaymentAttempt, PaymentChallenge } from "@froggy/payments";
import { PrivySignerRefusedError } from "@froggy/wallet";

import { OutboundRefusedError, readCapped, safeFetch } from "./outbound";
import type { ChatRun } from "./runs";
import type { Services } from "./services";
import {
  isConversion,
  MalformedSpendError,
  UnpricedAssetError,
} from "./session";
import type { SpendRequest, WorkspaceSession } from "./session";
import { assetFor } from "./tools-assets";

export interface PaidRequestDeps {
  readonly budgetUsdMicros?: number | undefined;
  /** The Graph answer this purchase is justified by, when there is one. */
  readonly evidence?: Evidence | undefined;
  /** False for a job: nobody can be asked, and it pays at most once. */
  readonly interactive: boolean;
  readonly outbound: { readonly allowPrivate: boolean };
  readonly run: ChatRun;
  readonly services: Services;
  readonly session: WorkspaceSession;
}

export interface PaidRequestInput {
  /** Stable across retries of the same logical purchase. Defaults to URL and price. */
  readonly idempotencyKey?: string;
  readonly init?: RequestInit;
  /** What this pays for, on the receipt. Defaults to the path. */
  readonly purpose?: string;
  /** The tool call paying, so the receipt is filed under its card. */
  readonly toolCallId?: string | undefined;
  readonly url: string;
}

export type PaidRequestOutcome =
  | {
      readonly kind: "answered";
      readonly body: string;
      /** True when a payment was made to get this answer. */
      readonly paid: boolean;
      /** The receipt of the payment that bought this answer, when one was made. */
      readonly receipt: Receipt | null;
      readonly status: number;
    }
  | { readonly kind: "refused"; readonly message: string };

const refused = (message: string): PaidRequestOutcome => ({
  kind: "refused",
  message,
});

const withPayment = (
  init: RequestInit | undefined,
  payment: string
): RequestInit => {
  const headers = new Headers(init?.headers);
  const sent = paymentHeaders(payment);
  headers.set("payment-signature", sent["payment-signature"]);
  headers.set("x-payment", sent["x-payment"]);
  return { ...init, headers };
};

/**
 * Everything that must be true before a request leaves. Null when it may.
 */
const guard = (
  deps: PaidRequestDeps,
  target: URL
): PaidRequestOutcome | null => {
  const { session } = deps;
  // Checked before the request, not after it. Fetching first and consulting
  // the policy only once a 402 came back would let a prompt injection make
  // this server issue an arbitrary outbound request. The allowlist was always
  // the control; asking it first is what makes it one.
  if (!session.allowsHost(target.host)) {
    return refused(
      `Refused before sending: ${target.host} is not on the mandate's list of hosts this agent may pay. Nothing was requested. Use x402_probe to see what it costs; only the person can add it to the directory.`
    );
  }
  // A digest is a summary, not a shopping trip: unattended, it pays at most
  // once, however many paid pages it finds.
  if (
    !deps.interactive &&
    session.history.some(
      (receipt) =>
        receipt.runId === deps.run.id &&
        receipt.settlement !== undefined &&
        !isConversion(receipt)
    )
  ) {
    return refused(
      "Refused before sending: an unattended digest pays at most once, and this one already has. Write the summary with what you have."
    );
  }
  return null;
};

/** The spend's result, as a sentence the caller can pass on. Null when it paid. */
const explain = (
  result: Awaited<ReturnType<WorkspaceSession["spend"]>>
): PaidRequestOutcome | null => {
  if (result.abandoned !== null) {
    return refused(
      `Allowed by policy, but not sent: ${result.abandoned}. Stop here.`
    );
  }
  if (result.decision._tag === "deny") {
    return refused(
      `Refused by policy (${result.decision.code}): ${result.decision.message}`
    );
  }
  if (result.decision._tag === "ask") {
    return refused(
      `This spend is over the automatic limit and needs the human: ${result.decision.question}`
    );
  }
  if (result.receipt.failure !== undefined) {
    return refused(
      `Allowed by policy, but the payment did not go through: ${result.receipt.failure}`
    );
  }
  return null;
};

type Requirement = PaymentChallenge["accepts"][number];

/**
 * The first offer this wallet can pay: the Hedera leg, paid by the person's
 * own account or the host pocket, or an EVM leg paid by the person's Privy
 * wallet with the agent as its signer. The Hedera payer is resolved by the
 * caller, because opening an account is a network call.
 */
const offerFor = (
  deps: PaidRequestDeps,
  challenge: PaymentChallenge
):
  | { readonly kind: "hedera"; readonly requirement: Requirement }
  | {
      readonly kind: "evm";
      readonly payer: Services["payer"];
      readonly requirement: Requirement;
    }
  | null => {
  const evm = deps.services.evmPayersFor(deps.session.agentWallet);
  for (const requirement of challenge.accepts) {
    if (requirement.scheme !== "exact") {
      continue;
    }
    if (requirement.network === deps.services.payer.network) {
      return { kind: "hedera", requirement };
    }
    const payer = evm.find(
      (candidate) => candidate.network === requirement.network
    );
    if (payer !== undefined) {
      return { kind: "evm", payer, requirement };
    }
  }
  return null;
};

/**
 * The payer for the offer: the EVM one it already names, or the person's
 * Hedera payer, which may mean opening their account and may fail with a
 * reason that belongs on the refusal.
 */
const payerOf = async (
  deps: PaidRequestDeps,
  offer: NonNullable<ReturnType<typeof offerFor>>
): Promise<
  | { readonly ok: true; readonly payer: Services["payer"] }
  | { readonly ok: false; readonly message: string }
> => {
  if (offer.kind === "evm") {
    return { ok: true, payer: offer.payer };
  }
  try {
    return {
      ok: true,
      payer: await deps.services.hederaPayerFor({
        openingUsdMicros: deps.session.pocket ?? 0,
        userId: deps.session.userId,
      }),
    };
  } catch (error) {
    return {
      message: `Could not open your Hedera account: ${error instanceof Error ? error.message : String(error)}. Nothing was paid.`,
      ok: false,
    };
  }
};

const describeOffers = (
  deps: PaidRequestDeps,
  challenge: PaymentChallenge
): string => {
  const wanted = challenge.accepts.map((entry) => entry.network).join(", ");
  const can = [
    deps.services.payer,
    ...deps.services.evmPayersFor(deps.session.agentWallet),
  ]
    .map((entry) => entry.network)
    .join(", ");
  return `The server asked for payment on ${wanted}, and this wallet can pay on ${can}. Nothing was paid.`;
};

export const paidRequest = async (
  deps: PaidRequestDeps,
  input: PaidRequestInput
): Promise<PaidRequestOutcome> => {
  const { services, session } = deps;
  const check = publicHttpUrl(input.url, deps.outbound);
  if (!check.ok) {
    return refused(
      `Refused before sending: ${check.reason}. Nothing was requested.`
    );
  }
  const target = check.url;
  const stopped = guard(deps, target);
  if (stopped !== null) {
    return stopped;
  }

  let first: Response;
  try {
    first = await safeFetch(input.url, input.init ?? {}, deps.outbound);
  } catch (error) {
    if (error instanceof OutboundRefusedError) {
      return refused(error.message);
    }
    throw error;
  }
  if (first.status !== 402) {
    return {
      body: await readCapped(first),
      kind: "answered",
      paid: false,
      receipt: null,
      status: first.status,
    };
  }

  // Decoded, not asserted: this is a *seller* telling the agent what to pay
  // and where to send it. Either dialect: the v2 header or the v1 body.
  const challenge = await challengeFrom(first);
  if (challenge === null) {
    return refused(
      "That server asked for payment but its 402 did not carry usable requirements."
    );
  }
  const offer = offerFor(deps, challenge);
  if (offer === null) {
    return refused(describeOffers(deps, challenge));
  }
  const { requirement } = offer;
  const resolved = await payerOf(deps, offer);
  if (!resolved.ok) {
    return refused(resolved.message);
  }
  const { payer } = resolved;
  const amount = assetFor(requirement);
  if (amount === null) {
    return refused(
      `The server wants to be paid on ${requirement.network}, which this wallet does not know. Nothing was paid.`
    );
  }

  let paidBody: string | null = null;
  let paidStatus = 0;
  // What the reconciler needs when the seller goes quiet after the header
  // left: the id the seller reported, or failing that the id inside our own
  // signed payload, which Hedera assigns before anything is sent.
  let sentHeader: string | null = null;
  let reportedTransactionId: string | null = null;
  const request: SpendRequest = {
    amount,
    host: target.host,
    idempotencyKey:
      input.idempotencyKey ?? `x402:${input.url}:${requirement.amount}`,
    budgetUsdMicros: deps.budgetUsdMicros,
    interactive: deps.interactive,
    payeeId: requirement.payTo,
    payeeLabel: `${target.host} (x402)`,
    // `server`, because the payee came out of a 402 challenge from a host
    // that is itself on the mandate's allowlist — not out of page text and
    // not out of the model.
    provenance: "server",
    purpose: input.purpose ?? `x402 payment for ${target.pathname}`,
    runId: deps.run.id,
    signal: deps.run.signal,
    toolCallId: input.toolCallId,
    reconcile: async () => {
      // Only Hedera has a mirror to ask, and only a real payment is on it.
      if (!requirement.network.startsWith("hedera:") || payer.mode !== "live") {
        return "unknown";
      }
      const transactionId =
        reportedTransactionId ??
        (sentHeader === null
          ? null
          : describePayment(sentHeader).transactionId);
      if (transactionId === null) {
        return "unknown";
      }
      return await reconcileHederaPayment({
        network: requirement.network,
        transactionId,
      });
    },
    settle: async () => {
      let attempt: PaymentAttempt;
      try {
        attempt = await payer.pay(challenge);
      } catch (error) {
        // The signer said no — Privy, naming its policy — and that is the
        // leash working. It goes on the receipt in those words.
        if (
          error instanceof SignerRefusedError ||
          error instanceof PrivySignerRefusedError
        ) {
          return {
            error: error.message,
            network: requirement.network,
            ok: false,
            sent: false,
            stubbed: false,
            transactionId: null,
          };
        }
        throw error;
      }
      if (attempt.header === null) {
        return {
          error: attempt.error ?? "no payment could be built",
          network: requirement.network,
          ok: false,
          sent: false,
          stubbed: attempt.stubbed,
          transactionId: null,
        };
      }
      // From here the header has left the process, so every failure is one
      // that may have moved money and is reported as sent.
      sentHeader = attempt.header;
      let paid: Response;
      try {
        paid = await safeFetch(
          input.url,
          withPayment(input.init, attempt.header),
          deps.outbound
        );
      } catch (error) {
        return {
          error: `the seller could not be reached: ${error instanceof Error ? error.message : "unknown error"}`,
          network: requirement.network,
          ok: false,
          sent: true,
          stubbed: attempt.stubbed,
          transactionId: null,
        };
      }
      paidStatus = paid.status;
      paidBody = await readCapped(paid);
      // The settlement comes back as x402's base64 envelope; an older
      // seller's bare id is accepted too. Neither is trusted as more than a
      // transaction reference for the receipt.
      const settlement = decodeSettlementHeader(
        settlementHeaderFrom(paid.headers)
      );
      reportedTransactionId = settlement?.transactionId ?? null;
      const outcome = {
        network: settlement?.network ?? requirement.network,
        ok: paid.ok,
        sent: true,
        stubbed: attempt.stubbed,
        transactionId: settlement?.transactionId ?? null,
      };
      if (!paid.ok) {
        return { ...outcome, error: `the seller answered ${paid.status}` };
      }
      if (outcome.transactionId === null || attempt.stubbed) {
        return outcome;
      }
      // The buyer's public note, awaited: its sequence number belongs on the
      // receipt, and a note that fails to post costs nothing but the number.
      const note = await services.hcs.record({
        amount: requirement.amount,
        asset: requirement.asset,
        at: Date.now(),
        kind: "paid",
        network: outcome.network,
        ref: null,
        transactionId: outcome.transactionId,
      });
      return note === null
        ? outcome
        : { ...outcome, hcsSequence: note.sequenceNumber };
    },
  };
  if (deps.evidence !== undefined) {
    request.evidence = deps.evidence;
  }

  let result: Awaited<ReturnType<WorkspaceSession["spend"]>>;
  try {
    result = await session.spend(request);
  } catch (error) {
    // A policy refusal is a *result*; these two are the policy saying it
    // could not be evaluated, which is a different fact and reads differently.
    if (
      error instanceof UnpricedAssetError ||
      error instanceof MalformedSpendError
    ) {
      return refused(error.message);
    }
    throw error;
  }
  const explained = explain(result);
  if (explained !== null) {
    return explained;
  }
  return {
    body: paidBody ?? "Paid, but the server returned no body.",
    kind: "answered",
    paid: true,
    receipt: result.receipt,
    status: paidStatus,
  };
};
