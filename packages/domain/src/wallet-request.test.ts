import { describe, expect, it } from "bun:test";

import { Schema } from "effect";

import { EvmAddress } from "./address";
import {
  advanceWalletRequest,
  canonicalWalletRequest,
  WalletRequestEvent,
  WalletRequestStatus,
  walletRequestFinished,
} from "./wallet-request";

const address = Schema.decodeUnknownSync(EvmAddress);
const FROM = address("0x1111111111111111111111111111111111111111");
const TO = address("0x2222222222222222222222222222222222222222");

describe("advanceWalletRequest", () => {
  it("walks the happy path of a transaction in order", () => {
    let status: ReturnType<typeof advanceWalletRequest> = "pending";
    for (const event of [
      "card_shown",
      "approved",
      "signed",
      "sent",
      "confirmed",
    ] as const) {
      status = advanceWalletRequest(status ?? "pending", event);
    }
    expect(status).toBe("confirmed");
  });

  it("lets a signature be confirmed by delivery without a broadcast", () => {
    expect(advanceWalletRequest("signed", "confirmed")).toBe("confirmed");
  });

  it("lets a connection be confirmed straight from approval", () => {
    expect(advanceWalletRequest("approved", "confirmed")).toBe("confirmed");
  });

  it("never lets anything signed become unsigned again", () => {
    for (const status of ["signed", "sent", "uncertain"] as const) {
      expect(advanceWalletRequest(status, "card_shown")).toBeNull();
      expect(advanceWalletRequest(status, "approved")).toBeNull();
      expect(advanceWalletRequest(status, "declined")).toBeNull();
      expect(advanceWalletRequest(status, "cancelled")).toBeNull();
    }
  });

  it("leaves uncertain only through reconciliation, never a retry", () => {
    expect(advanceWalletRequest("uncertain", "signed")).toBeNull();
    expect(advanceWalletRequest("uncertain", "sent")).toBeNull();
    expect(advanceWalletRequest("uncertain", "reconciled_confirmed")).toBe(
      "confirmed"
    );
    expect(advanceWalletRequest("uncertain", "reconciled_failed")).toBe(
      "failed"
    );
  });

  it("refuses every event once a request is finished", () => {
    for (const status of WalletRequestStatus.literals) {
      if (!walletRequestFinished(status) || status === "uncertain") {
        continue;
      }
      for (const event of WalletRequestEvent.literals) {
        expect(advanceWalletRequest(status, event)).toBeNull();
      }
    }
  });

  it("can be refused by a rule only before anyone is asked", () => {
    expect(advanceWalletRequest("pending", "refused")).toBe("refused");
    expect(advanceWalletRequest("awaiting_approval", "refused")).toBeNull();
    expect(advanceWalletRequest("approved", "refused")).toBeNull();
  });
});

describe("canonicalWalletRequest", () => {
  it("ignores hex case so the same transaction fingerprints once", () => {
    const lower = canonicalWalletRequest({
      chainId: 8453,
      origin: "https://app.example",
      payload: {
        data: "0xa9059cbb",
        from: FROM,
        kind: "send_transaction",
        to: TO,
        value: "0x0",
      },
    });
    const upper = canonicalWalletRequest({
      chainId: 8453,
      origin: "https://app.example",
      payload: {
        data: "0xA9059CBB",
        from: address(FROM.toUpperCase().replace("0X", "0x")),
        kind: "send_transaction",
        to: TO,
        value: "0x0",
      },
    });
    expect(lower).toBe(upper);
  });

  it("changes when the origin, the chain or the payload changes", () => {
    const base = {
      chainId: 8453,
      origin: "https://app.example",
      payload: { kind: "connect" as const },
    };
    expect(canonicalWalletRequest(base)).not.toBe(
      canonicalWalletRequest({ ...base, origin: "https://evil.example" })
    );
    expect(canonicalWalletRequest(base)).not.toBe(
      canonicalWalletRequest({ ...base, chainId: 1 })
    );
    expect(canonicalWalletRequest(base)).not.toBe(
      canonicalWalletRequest({
        ...base,
        payload: { address: FROM, kind: "personal_sign", message: "0x68" },
      })
    );
  });
});
