import { expect, test } from "bun:test";

import { Schema } from "effect";

import { EvmAddress } from "./address";
import { AddressPresence } from "./address-presence";
import {
  WalletMonitor,
  flowAmount,
  flowAsset,
  foreignSigner,
  monitorCoverage,
  monitorStartBlock,
  shortAddress,
  supportedPresence,
  exchangeLegs,
  suspectedPoisoning,
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

test("a token is called by its known symbol only when it is the known contract", () => {
  const evm = Schema.decodeUnknownSync(EvmAddress);
  const usdc = evm("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
  const fake = evm("0x6c9458b7e1c1742c68d2662ea6a41ac5de43d28c");
  expect(flowAsset({ asset: usdc, symbol: "USDC" }, "eip155:8453")).toEqual({
    label: "USDC",
    doubt: null,
  });
  expect(flowAsset({ asset: "native", symbol: null }, "eip155:8453")).toEqual({
    label: "ETH",
    doubt: null,
  });
  // The same symbol from another contract is a lookalike, whatever it claims.
  expect(flowAsset({ asset: fake, symbol: "usdc" }, "eip155:8453")).toEqual({
    label: `"usdc" ${shortAddress(fake)}`,
    doubt: "lookalike",
  });
  // Homoglyphs and invisible characters read as USDC to a person, not to this check.
  expect(flowAsset({ asset: fake, symbol: "UṢDC" }, "eip155:8453").doubt).toBe(
    "lookalike"
  );
  expect(flowAsset({ asset: fake, symbol: null }, "eip155:8453")).toEqual({
    label: `token ${shortAddress(fake)}`,
    doubt: "no_symbol",
  });
  // An ordinary self-reported symbol is printed as is, without a caution.
  expect(flowAsset({ asset: fake, symbol: "LAPTOP" }, "eip155:8453")).toEqual({
    label: "LAPTOP",
    doubt: null,
  });
});

test("amounts use the token's decimals and fall back to raw units", () => {
  expect(flowAmount({ amount: "2454063", decimals: 6 })).toBe("2.454063");
  expect(flowAmount({ amount: "100000", decimals: 6 })).toBe("0.1");
  expect(flowAmount({ amount: "1000000000000000", decimals: 18 })).toBe(
    "0.001"
  );
  expect(flowAmount({ amount: "7", decimals: 0 })).toBe("7");
  expect(flowAmount({ amount: "100000", decimals: null })).toBe(
    "100000 raw units of"
  );
});

test("an exchange no pool vouched for has two legs; anything else has none", () => {
  const evm = Schema.decodeUnknownSync(EvmAddress);
  const stranger = evm("0xefbb49a7ebf66f8a10435a2a2ffd19981f719c8e");
  const usdc = evm("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
  const sentEth = {
    asset: "native" as const,
    amount: "1",
    direction: "sent" as const,
    counterparty: stranger,
    symbol: null,
    decimals: 18,
  };
  const gotUsdc = {
    ...sentEth,
    asset: usdc,
    direction: "received" as const,
    symbol: "USDC",
    decimals: 6,
  };
  expect(exchangeLegs({ kind: "transfer", flows: [sentEth, gotUsdc] })).toEqual(
    { sent: sentEth, received: gotUsdc }
  );
  // A verified swap is already a swap; one leg, or the same asset both ways, is not an exchange.
  expect(exchangeLegs({ kind: "swap", flows: [sentEth, gotUsdc] })).toBeNull();
  expect(exchangeLegs({ kind: "transfer", flows: [sentEth] })).toBeNull();
  expect(
    exchangeLegs({
      kind: "activity",
      flows: [sentEth, { ...sentEth, direction: "received" as const }],
    })
  ).toBeNull();
});

test("a transfer a stranger signed of a token nobody can vouch for is suspected poisoning", () => {
  const evm = Schema.decodeUnknownSync(EvmAddress);
  const wallet = evm("0x0Cf84F01C311Dc093969136B1814F05B5b3167F6");
  const stranger = evm("0xefbb49a7ebf66f8a10435a2a2ffd19981f719c8e");
  const fake = evm("0x6c9458b7e1c1742c68d2662ea6a41ac5de43d28c");
  const usdc = evm("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
  const network = "eip155:8453";
  const fakeSend = {
    asset: fake,
    amount: "100000",
    direction: "sent" as const,
    counterparty: stranger,
    symbol: "UṢDC",
    decimals: 6,
  };
  expect(
    suspectedPoisoning({
      wallet,
      network,
      transactionFrom: stranger,
      flows: [fakeSend],
    })
  ).toBe(true);
  // The same lie signed by the wallet itself is the wallet's own doing.
  expect(
    suspectedPoisoning({
      wallet,
      network,
      transactionFrom: wallet,
      flows: [fakeSend],
    })
  ).toBe(false);
  // A relayed send of the real USDC is a smart account at work, not poisoning.
  expect(
    suspectedPoisoning({
      wallet,
      network,
      transactionFrom: stranger,
      flows: [{ ...fakeSend, asset: usdc, symbol: "USDC" }],
    })
  ).toBe(false);
  // Receiving a fake token is spam, not a forged send.
  expect(
    suspectedPoisoning({
      wallet,
      network,
      transactionFrom: stranger,
      flows: [{ ...fakeSend, direction: "received" as const }],
    })
  ).toBe(false);
});

test("a foreign signer is named only when something left the wallet", () => {
  const evm = Schema.decodeUnknownSync(EvmAddress);
  const wallet = evm("0x0Cf84F01C311Dc093969136B1814F05B5b3167F6");
  const stranger = evm("0xefbb49a7ebf66f8a10435a2a2ffd19981f719c8e");
  const sent = {
    asset: "native" as const,
    amount: "1",
    direction: "sent" as const,
    counterparty: stranger,
    symbol: null,
    decimals: 18,
  };
  const received = { ...sent, direction: "received" as const };
  expect(
    foreignSigner({ wallet, transactionFrom: stranger, flows: [sent] })
  ).toBe(stranger);
  // The wallet signing for itself, in any hex case, is not foreign.
  expect(
    foreignSigner({
      wallet,
      transactionFrom: evm(wallet.toLowerCase()),
      flows: [sent],
    })
  ).toBeNull();
  // An incoming transfer is always signed by somebody else; that is not a caution.
  expect(
    foreignSigner({ wallet, transactionFrom: stranger, flows: [received] })
  ).toBeNull();
  expect(foreignSigner({ wallet, flows: [sent] })).toBeNull();
});
