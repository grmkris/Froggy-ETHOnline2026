/**
 * Ask a URL what it costs, without paying.
 *
 * A 402 is a claim; this reads the claim and says whether this wallet could
 * honour it. The reasons are sentences a person can act on — "names no fee
 * payer" is something a seller can fix, "is not Hedera testnet" is something
 * this wallet cannot — and the fetch is the caller's, so the same private
 * network rules apply as to any other outbound request.
 */

import { Schema } from "effect";

import { HEDERA_TESTNET, isHederaNetwork } from "./types";
import type { PaymentChallenge } from "./types";
import { challengeFrom } from "./wire";

export interface ProbeOption {
  readonly amount: string;
  readonly asset: string;
  readonly network: string;
  readonly payTo: string;
  /** Why this wallet cannot pay it, or null when it can. */
  readonly reason: string | null;
  readonly scheme: string;
  readonly supported: boolean;
}

export type ProbeSummary =
  | {
      readonly kind: "free";
      readonly host: string;
      readonly status: number;
      readonly url: string;
    }
  | {
      readonly kind: "paid";
      readonly host: string;
      readonly options: readonly ProbeOption[];
      /** At least one option this wallet can pay. */
      readonly supported: boolean;
      readonly url: string;
    }
  | {
      readonly kind: "unreachable";
      readonly host: string;
      readonly reason: string;
      readonly url: string;
    };

type Requirement = PaymentChallenge["accepts"][number];

export interface Assessment {
  /** Why this wallet cannot pay it, or null when it can. */
  readonly reason: string | null;
  readonly supported: boolean;
}

/** Whole tinybars, at least one. */
const WHOLE_POSITIVE = /^[1-9]\d*$/u;

/** Hedera's exact scheme needs the facilitator's account in `extra`. */
const FeePayer = Schema.Struct({ feePayer: Schema.String });
const decodeFeePayer = Schema.decodeUnknownResult(FeePayer);

/** An EVM seller says how the asset moves; absent means the EIP-3009 default. */
const TransferMethod = Schema.Struct({
  assetTransferMethod: Schema.optional(Schema.String),
});
const decodeTransferMethod = Schema.decodeUnknownResult(TransferMethod);

export interface ProbeOptions {
  /** The networks this wallet has a payer for. Hedera testnet alone by default. */
  readonly payable: readonly string[];
}

const HEDERA_ONLY: ProbeOptions = { payable: [HEDERA_TESTNET] };

export const assess = (
  requirement: Requirement,
  probeOptions: ProbeOptions = HEDERA_ONLY
): Assessment => {
  if (requirement.scheme !== "exact") {
    return {
      reason: `the ${requirement.scheme} scheme is not supported; only exact is`,
      supported: false,
    };
  }
  if (!probeOptions.payable.includes(requirement.network)) {
    return {
      reason: `${requirement.network} is not payable from this wallet; ${probeOptions.payable.join(", ")} ${probeOptions.payable.length === 1 ? "is" : "are"}`,
      supported: false,
    };
  }
  if (!isHederaNetwork(requirement.network)) {
    // An EVM exact payment is an EIP-3009 authorization; nothing else is built.
    const decoded = decodeTransferMethod(requirement.extra ?? {});
    const method =
      decoded._tag === "Failure"
        ? "an unreadable method"
        : (decoded.success.assetTransferMethod ?? "eip3009");
    return method === "eip3009"
      ? { reason: null, supported: true }
      : {
          reason: `the seller wants ${method}; only eip3009 authorizations are signed`,
          supported: false,
        };
  }
  if (!WHOLE_POSITIVE.test(requirement.amount)) {
    return {
      reason: "the amount is not a whole, positive number of tinybars",
      supported: false,
    };
  }
  const feePayer = decodeFeePayer(requirement.extra ?? {});
  if (feePayer._tag === "Failure" || feePayer.success.feePayer === "") {
    return {
      reason:
        "the challenge names no fee payer, so a Hedera payment cannot be built from it",
      supported: false,
    };
  }
  return { reason: null, supported: true };
};

const hostOf = (url: string): string => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

export const probe402 = async (
  url: string,
  fetcher: (url: string) => Promise<Response>,
  probeOptions: ProbeOptions = HEDERA_ONLY
): Promise<ProbeSummary> => {
  const host = hostOf(url);
  let response: Response;
  try {
    response = await fetcher(url);
  } catch (error) {
    return {
      host,
      kind: "unreachable",
      reason: error instanceof Error ? error.message : "request failed",
      url,
    };
  }
  if (response.status !== 402) {
    return { host, kind: "free", status: response.status, url };
  }
  const decoded = await challengeFrom(response);
  if (decoded === null) {
    return {
      host,
      kind: "unreachable",
      reason: "answered 402 without an x402 challenge in its header or body",
      url,
    };
  }
  const options = decoded.accepts.map((requirement) => ({
    amount: requirement.amount,
    asset: requirement.asset,
    network: requirement.network,
    payTo: requirement.payTo,
    scheme: requirement.scheme,
    ...assess(requirement, probeOptions),
  }));
  return {
    host,
    kind: "paid",
    options,
    supported: options.some((option) => option.supported),
    url,
  };
};
