/**
 * GoPlus token security screen. Keyless; chain id is mapped from CAIP-2.
 * Distinguishes observed / not_indexed / unavailable — never collapses an
 * absent index into a clean screen.
 */

import type { TokenScreenFact, TradingNetwork } from "@froggy/domain";
import { Schema } from "effect";

import { boundedBytes, safeFetch } from "../outbound";
import type { OutboundOptions } from "../outbound";
import { PONS_NETWORK } from "./networks";

const chainIdFor = (network: TradingNetwork): string | undefined => {
  switch (network) {
    case "eip155:1": {
      return "1";
    }
    case "eip155:8453": {
      return "8453";
    }
    case PONS_NETWORK: {
      return "4663";
    }
    default: {
      return undefined;
    }
  }
};

const BODY_LIMIT = 64 * 1024;
const Flag = Schema.optionalKey(Schema.Union([Schema.String, Schema.Null]));
const ScreenRow = Schema.Struct({
  is_honeypot: Flag,
  is_mintable: Flag,
  is_proxy: Flag,
  transfer_pausable: Flag,
  is_blacklisted: Flag,
  can_take_back_ownership: Flag,
  owner_percent: Flag,
  is_open_source: Flag,
});
const Envelope = Schema.Struct({
  code: Schema.optionalKey(Schema.Int),
  result: Schema.optionalKey(
    Schema.Record(Schema.String, Schema.NullOr(ScreenRow))
  ),
});

export interface GoPlusScreen {
  readonly stubbed: boolean;
  readonly screen: (
    network: TradingNetwork,
    address: string
  ) => Promise<TokenScreenFact>;
}

const flag = (value: string | null | undefined): boolean | null => {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (value === "0" || value.toLowerCase() === "false") {
    return false;
  }
  if (value === "1" || value.toLowerCase() === "true") {
    return true;
  }
  return null;
};

const percent = (value: string | null | undefined): number | null => {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    return null;
  }
  return parsed;
};

export const liveGoPlus = (options: {
  readonly baseUrl: string;
  readonly outbound?: OutboundOptions;
}): GoPlusScreen => ({
  stubbed: false,
  screen: async (network, address) => {
    const chainId = chainIdFor(network);
    if (chainId === undefined) {
      return {
        status: "not_applicable",
        isHoneypot: null,
        isMintable: null,
        isProxy: null,
        transferPausable: null,
        isBlacklisted: null,
        canTakeBackOwnership: null,
        ownerPercent: null,
        note: `GoPlus has no chain mapping for ${network}.`,
      };
    }
    const url = new URL(
      `/api/v1/token_security/${chainId}`,
      options.baseUrl.endsWith("/") ? options.baseUrl : `${options.baseUrl}/`
    );
    url.searchParams.set("contract_addresses", address.toLowerCase());
    try {
      const response = await safeFetch(
        url.toString(),
        { method: "GET", headers: { accept: "application/json" } },
        { ...options.outbound, maxRedirects: 0, timeoutMs: 15_000 }
      );
      if (!response.ok) {
        await response.body?.cancel();
        return {
          status: "unavailable",
          isHoneypot: null,
          isMintable: null,
          isProxy: null,
          transferPausable: null,
          isBlacklisted: null,
          canTakeBackOwnership: null,
          ownerPercent: null,
          note: `GoPlus returned HTTP ${response.status}.`,
        };
      }
      const body: unknown = JSON.parse(
        new TextDecoder().decode(await boundedBytes(response, BODY_LIMIT))
      );
      const envelope = Schema.decodeUnknownSync(Envelope)(body);
      const row =
        envelope.result?.[address.toLowerCase()] ??
        envelope.result?.[Object.keys(envelope.result ?? {})[0] ?? ""];
      if (row === null || row === undefined) {
        return {
          status: "not_indexed",
          isHoneypot: null,
          isMintable: null,
          isProxy: null,
          transferPausable: null,
          isBlacklisted: null,
          canTakeBackOwnership: null,
          ownerPercent: null,
          note: "GoPlus has no security record for this address.",
        };
      }
      return {
        status: "observed",
        isHoneypot: flag(row.is_honeypot),
        isMintable: flag(row.is_mintable),
        isProxy: flag(row.is_proxy),
        transferPausable: flag(row.transfer_pausable),
        isBlacklisted: flag(row.is_blacklisted),
        canTakeBackOwnership: flag(row.can_take_back_ownership),
        ownerPercent: percent(row.owner_percent),
        note: null,
      };
    } catch {
      return {
        status: "unavailable",
        isHoneypot: null,
        isMintable: null,
        isProxy: null,
        transferPausable: null,
        isBlacklisted: null,
        canTakeBackOwnership: null,
        ownerPercent: null,
        note: "GoPlus transport failed or returned an invalid response.",
      };
    }
  },
});

export const stubGoPlus = (): GoPlusScreen => ({
  stubbed: true,
  screen: async () => {
    await Promise.resolve();
    return {
      status: "unavailable",
      isHoneypot: null,
      isMintable: null,
      isProxy: null,
      transferPausable: null,
      isBlacklisted: null,
      canTakeBackOwnership: null,
      ownerPercent: null,
      note: "GoPlus is not configured. This is a stub, not a clean screen.",
    };
  },
});
