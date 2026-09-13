import { expect, test } from "bun:test";

import { Schema } from "effect";

import { AddressPresence } from "./address-presence";
import {
  WalletMonitor,
  monitorCoverage,
  monitorStartBlock,
  supportedPresence,
} from "./wallet-monitor";

const monitor = Schema.decodeUnknownSync(WalletMonitor)({
  v: 1,
  id: "wmon_01h455vb4pex5vsknk084sn02q",
  revision: 1,
  enabled: true,
  startedAt: 1,
  expiresAt: 2,
  startBlock: 100,
  telegram: false,
  swaps: true,
  transfers: true,
  networks: [
    { network: "eip155:8453", startBlock: 100 },
    { network: "eip155:4663", startBlock: 7 },
  ],
});

test("monitorStartBlock reads per-network coverage and null when uncovered", () => {
  expect(monitorStartBlock(monitor, "eip155:8453")).toBe(100);
  expect(monitorStartBlock(monitor, "eip155:4663")).toBe(7);
  expect(monitorCoverage({ ...monitor, networks: undefined })).toEqual([]);
  expect(
    monitorStartBlock({ ...monitor, networks: undefined }, "eip155:8453")
  ).toBe(null);
});

const row = (network: string, status: AddressPresence["status"]) =>
  Schema.decodeUnknownSync(AddressPresence)({
    network,
    status,
    kind: "eoa",
    block: null,
    nativeBalance: null,
    usdc: null,
    token: null,
    observedAt: 1,
    stubbed: false,
    note: null,
  });

test("supportedPresence keeps only observed rows on chains the stream can watch", () => {
  expect(
    supportedPresence([
      row("eip155:1", "observed"),
      row("eip155:8453", "observed"),
      row("eip155:4663", "absent"),
      row("eip155:84532", "observed"),
    ])
  ).toEqual(["eip155:8453"]);
});
