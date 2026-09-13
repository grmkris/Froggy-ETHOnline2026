import { expect, test } from "bun:test";

import { CloudBrowser } from "./cloud";
import type { CloudBrowserRecord } from "./cloud";
import type { CloudApi, CloudBrowserInfo } from "./cloud-api";
import { HostedBrowserExpiredError } from "./hosted-agent";

const BROWSER = "ad041f9b-4102-4909-b3b9-65114f43f73c";
interface BrowserFixtureState {
  record: CloudBrowserRecord;
  confirmed: boolean;
  legacyCalls: number;
}
const fixture = () => {
  const state: BrowserFixtureState = {
    record: {
      profileId: "6f19ba70-e37c-4c63-913c-62bbc94f1740",
      browserId: BROWSER,
      apiVersion: 4,
      uncertain: false,
    },
    confirmed: false,
    legacyCalls: 0,
  };
  const info = (): CloudBrowserInfo => ({
    id: BROWSER,
    status: state.confirmed ? "stopped" : "active",
    cdpUrl: null,
    liveUrl: null,
    timeoutAt: new Date().toISOString(),
    browserCost: "0.01",
    proxyCost: "0",
  });
  const api: CloudApi = {
    get: async () => await Promise.resolve(info()),
    stop: async () => await Promise.resolve(info()),
    profile: async () => await Promise.resolve(state.record.profileId),
    create: async () => {
      state.legacyCalls += 1;
      return await Promise.resolve(info());
    },
    deleteProfile: async () => {
      await Promise.resolve();
    },
    socket: async () =>
      await Promise.reject(new Error("A stopped browser must not connect")),
  };
  const browser = new CloudBrowser({
    api: {
      ...api,
      stop: async () => {
        state.legacyCalls += 1;
        return await Promise.resolve(info());
      },
    },
    hostedApi: api,
    userKey: "hosted-fixture",
    load: async () => await Promise.resolve(state.record),
    save: async (record) => {
      state.record = record;
      await Promise.resolve();
    },
  });
  return { state, browser };
};

test("hosted shutdown retains the browser until V4 readback confirms it stopped", async () => {
  const { state, browser } = fixture();
  await browser.hosted.control("stopping");
  const failure = await browser.close().catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(Error);
  expect(state.record.browserId).toBe(BROWSER);
  expect(browser.state().cloud?.control).toBe("stopping");
  state.confirmed = true;
  await browser.close();
  expect(state.record.browserId).toBeNull();
  expect(state.record.apiVersion).toBe(3);
  expect(state.record.usage?.browserUsdMicros).toBe(10_000);
  expect(state.legacyCalls).toBe(0);
});

test("an expired hosted session never silently creates a replacement browser", async () => {
  const { state, browser } = fixture();
  state.confirmed = true;
  const failure = await browser.hosted
    .attach(BROWSER)
    .catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(HostedBrowserExpiredError);
  expect(state.record.browserId).toBe(BROWSER);
  expect(state.legacyCalls).toBe(0);
});

test("hosted ownership identifies the agent even when the local arbiter is idle", async () => {
  const { browser } = fixture();
  await browser.hosted.control("agent");
  expect(browser.state().interaction).toBe("agent");
  await browser.hosted.control("stopping");
  expect(browser.state().interaction).toBe("agent");
  await browser.hosted.control("human");
  expect(browser.state().interaction).toBe("human");
});
