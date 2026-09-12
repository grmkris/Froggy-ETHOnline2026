import { expect, test } from "bun:test";

import type { TradingAddress } from "@froggy/domain";
import { getAddress, keccak256, toHex } from "viem";
import type { Address, Hex } from "viem";

import type { TradeEvmClient } from "../evm-chain";
import {
  CLANKER_DEPLOYMENTS,
  CLANKER_TOKEN_TEMPLATE,
  clankerLaunchVenue,
  stubClankerLaunchVenue,
} from "./clanker";
import { CLANKER_TOKEN_RUNTIME } from "./clanker-token-fixture";
import { verifyPinnedDeployments } from "./common";
import { flaunchLaunchVenue, stubFlaunchLaunchVenue } from "./flaunch";
import { stubVirtualsLaunchVenue, virtualsLaunchVenue } from "./virtuals";
import { stubZoraLaunchVenue, zoraLaunchVenue } from "./zora";

// SAFETY: fixed 20-byte hex literal used as an Address fixture.
const TOKEN = getAddress(`0x${"aa".repeat(20)}`) as Address;
// SAFETY: checksummed fixture address used as TradingAddress in venue calls.
const tokenAddress = TOKEN as TradingAddress;
const BLOCK = 51_206_991n;

const stubClient = (partial: {
  readonly getCode?: TradeEvmClient["getCode"];
  readonly readContract?: TradeEvmClient["readContract"];
}): TradeEvmClient => {
  const client = {
    getCode:
      partial.getCode ??
      (() => Promise.resolve(toHex(new Uint8Array([1, 2, 3])))),
    getLogs: () => Promise.resolve([]),
    readContract:
      partial.readContract ??
      (() => Promise.reject(new Error("unexpected readContract"))),
  };
  // SAFETY: venue adapters only call getCode/getLogs/readContract on this stub.
  // oxlint-disable-next-line anti-slop/no-chained-type-assertions -- PublicClient is too wide to stub without unknown.
  return client as unknown as TradeEvmClient;
};

test("stub Base venues never claim registration and mark stubbed", async () => {
  for (const venue of [
    stubClankerLaunchVenue(),
    stubZoraLaunchVenue(),
    stubFlaunchLaunchVenue(),
    stubVirtualsLaunchVenue(),
  ]) {
    expect(venue.stubbed).toBe(true);
    expect(await venue.verifyDeployments(BLOCK)).toEqual([]);
    const registration = await venue.registration(tokenAddress, BLOCK);
    expect(registration.registered).toBe(false);
    expect(venue.template("0x").status).toBe(
      venue.id === "clanker" ? "unavailable" : "not_applicable"
    );
    expect(venue.template("0x").matches).toBeNull();
    expect(await venue.tradeEvents(tokenAddress, tokenAddress, 0n, 1n)).toEqual(
      []
    );
  }
});

test("Clanker template matches a captured token runtime and nothing else", () => {
  const venue = clankerLaunchVenue(stubClient({}));
  const observed = venue.template(CLANKER_TOKEN_RUNTIME);
  expect(observed).toMatchObject({
    status: "observed",
    matches: true,
    hash: CLANKER_TOKEN_TEMPLATE.hash,
    venue: "clanker",
    note: null,
  });
  expect(venue.template().status).toBe("not_indexed");

  const bytes = Buffer.from(CLANKER_TOKEN_RUNTIME.slice(2), "hex");
  expect(bytes.length).toBe(CLANKER_TOKEN_TEMPLATE.length);
  const otherAdmin = Buffer.from(bytes);
  for (const region of CLANKER_TOKEN_TEMPLATE.regions) {
    otherAdmin.fill(0x5a, region.offset, region.offset + region.length);
  }
  expect(venue.template(`0x${otherAdmin.toString("hex")}`).matches).toBe(true);

  const flipped = Buffer.from(bytes);
  flipped[100] = flipped[100] === 0 ? 1 : 0;
  const mismatch = venue.template(`0x${flipped.toString("hex")}`);
  expect(mismatch.matches).toBe(false);
  expect(mismatch.note).toContain("does not match");
  expect(
    venue.template(`0x${bytes.subarray(0, -1).toString("hex")}`).matches
  ).toBe(false);
});

test("verifyDeployments fails when runtime hash does not match the pin", async () => {
  const wrong = toHex(new Uint8Array([9, 9, 9]));
  const cases = [
    {
      venue: clankerLaunchVenue(
        stubClient({
          getCode: ({ address }) =>
            Promise.resolve(
              Object.values(CLANKER_DEPLOYMENTS).some(
                (deployment) =>
                  deployment.address.toLowerCase() === address.toLowerCase()
              )
                ? wrong
                : undefined
            ),
        })
      ),
      expected: ["factory", "feeLocker", "lpLocker"],
    },
    {
      venue: zoraLaunchVenue(
        stubClient({ getCode: () => Promise.resolve(wrong) })
      ),
      expected: ["factory"],
    },
    {
      venue: flaunchLaunchVenue(
        stubClient({ getCode: () => Promise.resolve(wrong) })
      ),
      expected: ["flaunch", "positionManager"],
    },
    {
      venue: virtualsLaunchVenue(
        stubClient({ getCode: () => Promise.resolve(wrong) })
      ),
      expected: ["bondingCurve"],
    },
  ] as const;

  for (const { venue, expected } of cases) {
    const changed = await venue.verifyDeployments(BLOCK);
    expect(changed.toSorted()).toEqual([...expected].toSorted());
  }
});

test("verifyPinnedDeployments passes for matching synthetic code", async () => {
  // SAFETY: fixed bytecode hex used only to exercise keccak pin matching.
  const knownCode = "0x6001600055" as Hex;
  const knownHash = keccak256(knownCode);
  const factory = getAddress("0x1111111111111111111111111111111111111111");
  const ok = await verifyPinnedDeployments(
    stubClient({
      getCode: () => Promise.resolve(knownCode),
    }),
    { factory: { address: factory, hash: knownHash } },
    BLOCK,
    false
  );
  expect(ok).toEqual([]);
});

test("registration returns false when the venue view says the token is unknown", async () => {
  const zero = getAddress("0x0000000000000000000000000000000000000000");
  const zeroInfo = {
    token: zero,
    hook: zero,
    locker: zero,
    extensions: [] as const,
  };

  const clanker = clankerLaunchVenue(
    stubClient({
      // SAFETY: zeroed DeploymentInfo fixture matches tokenDeploymentInfo return.
      readContract: (() =>
        Promise.resolve(zeroInfo)) as TradeEvmClient["readContract"],
    })
  );
  const clankerRegistration = await clanker.registration(tokenAddress, BLOCK);
  expect(clankerRegistration.registered).toBe(false);

  const flaunch = flaunchLaunchVenue(
    stubClient({
      // SAFETY: tokenId 0n is the Flaunch "unknown memecoin" sentinel.
      readContract: (() =>
        Promise.resolve(0n)) as TradeEvmClient["readContract"],
    })
  );
  const flaunchRegistration = await flaunch.registration(tokenAddress, BLOCK);
  expect(flaunchRegistration.registered).toBe(false);

  const virtuals = virtualsLaunchVenue(
    stubClient({
      // SAFETY: zeroed tokenInfo tuple matches the Virtuals public mapping getter.
      readContract: (() =>
        Promise.resolve([
          zero,
          zero,
          zero,
          zero,
          {
            token: zero,
            name: "",
            _name: "",
            ticker: "",
            supply: 0n,
            price: 0n,
            marketCap: 0n,
            liquidity: 0n,
            volume: 0n,
            volume24H: 0n,
            prevPrice: 0n,
            lastUpdated: 0n,
          },
          "",
          [],
          "",
          "",
          "",
          "",
          "",
          false,
          false,
        ])) as TradeEvmClient["readContract"],
    })
  );
  const virtualsRegistration = await virtuals.registration(tokenAddress, BLOCK);
  expect(virtualsRegistration.registered).toBe(false);

  const zora = zoraLaunchVenue(
    stubClient({
      // SAFETY: rejected coin views mean the address is not a Zora coin.
      readContract: (() =>
        Promise.reject(
          new Error("not a coin")
        )) as TradeEvmClient["readContract"],
    })
  );
  const zoraRegistration = await zora.registration(tokenAddress, BLOCK);
  expect(zoraRegistration.registered).toBe(false);
});
