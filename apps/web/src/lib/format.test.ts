import { describe, expect, it } from "bun:test";

import { compactUsd, explorerUrl, hcsMessageUrl } from "./format";

describe("explorerUrl", () => {
  it("sends a Hedera id to HashScan with its @ encoded", () => {
    expect(
      explorerUrl("hedera:testnet", "0.0.7162784@1788674975.439553201")
    ).toBe(
      "https://hashscan.io/testnet/transaction/0.0.7162784%401788674975.439553201"
    );
  });

  it("knows Base Sepolia and Base", () => {
    expect(explorerUrl("eip155:84532", "0xabc")).toBe(
      "https://sepolia.basescan.org/tx/0xabc"
    );
    expect(explorerUrl("eip155:8453", "0xabc")).toBe(
      "https://basescan.org/tx/0xabc"
    );
  });

  it("would rather show no explorer than a wrong one", () => {
    expect(explorerUrl("eip155:1", "0xabc")).toBeNull();
  });
});

describe("compactUsd", () => {
  it("sizes a market at a glance", () => {
    expect(compactUsd(96_000_000)).toBe("$96M");
    expect(compactUsd(1_230_000_000)).toBe("$1.2B");
    expect(compactUsd(412_000)).toBe("$412K");
    expect(compactUsd(950)).toBe("$950");
  });
});

describe("hcsMessageUrl", () => {
  it("points at the note on the topic", () => {
    expect(hcsMessageUrl("0.0.10381647", 2)).toBe(
      "https://hashscan.io/testnet/topic/0.0.10381647/message/2"
    );
  });
});
