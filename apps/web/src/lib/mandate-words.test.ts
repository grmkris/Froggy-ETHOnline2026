import { describe, expect, it } from "bun:test";

import { MandateId, RuleId, SessionId, usd } from "@froggy/domain";
import type { Mandate } from "@froggy/domain";

import {
  capsLine,
  mandateLists,
  networkWords,
  windowWords,
} from "./mandate-words";

const mandate: Mandate = {
  createdAt: 1,
  frozen: false,
  id: MandateId.generate(),
  rules: [
    { _tag: "per_tx_cap", id: RuleId.generate(), maxUsdMicros: usd(2) },
    {
      _tag: "window_cap",
      id: RuleId.generate(),
      maxUsdMicros: usd(10),
      windowMs: 86_400_000,
    },
    {
      _tag: "window_cap",
      id: RuleId.generate(),
      maxUsdMicros: usd(4),
      windowMs: 3_600_000,
    },
    {
      _tag: "approval_threshold",
      id: RuleId.generate(),
      overUsdMicros: usd(1),
    },
    {
      _tag: "host_allowlist",
      hosts: ["127.0.0.1:3100"],
      id: RuleId.generate(),
    },
    {
      _tag: "payee_allowlist",
      id: RuleId.generate(),
      payeeIds: ["0x000000000000000000000000000000000000dEaD"],
    },
    {
      _tag: "network_allowlist",
      id: RuleId.generate(),
      networks: ["hedera:testnet", "eip155:84532"],
    },
  ],
  sessionId: SessionId.generate(),
};

describe("capsLine", () => {
  it("reads the leash as one line, widest window first among windows", () => {
    expect(capsLine(mandate)).toBe(
      "$2.00 a payment · $10.00 a day · your call above $1.00"
    );
  });

  it("is null when there are no caps to speak of", () => {
    expect(capsLine({ ...mandate, rules: [] })).toBeNull();
  });
});

describe("windowWords", () => {
  it("names the common windows and measures the rest", () => {
    expect(windowWords(86_400_000)).toBe("a day");
    expect(windowWords(3_600_000)).toBe("an hour");
    expect(windowWords(6 * 3_600_000)).toBe("6h");
    expect(windowWords(900_000)).toBe("15 min");
  });
});

describe("mandateLists and networkWords", () => {
  it("lists hosts, short payees and networks by name", () => {
    expect(mandateLists(mandate)).toEqual({
      hosts: ["127.0.0.1:3100"],
      networks: ["Hedera testnet", "Base Sepolia"],
      payees: ["0x0000…dEaD"],
    });
  });

  it("falls back to the id for a chain it has no name for", () => {
    expect(networkWords("eip155:10")).toBe("eip155:10");
  });
});
