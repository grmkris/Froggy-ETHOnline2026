/**
 * What these tests are actually protecting.
 *
 * The single-session build handed every visitor the same mandate, the same
 * receipts and the same Chrome. The registry is what stopped that, so the
 * properties worth asserting are the isolation ones: two DIDs never share a
 * session, and a profile path never leaks the DID that produced it.
 */

import { describe, expect, test } from "bun:test";

import { BrowserSession } from "@froggy/browser";
import type { BrowserSessionOptions } from "@froggy/browser";
import { parQuote, userId } from "@froggy/domain";
import type { BrowserState, ServiceModes } from "@froggy/protocol";
import { memoryLedger } from "@froggy/wallet";

import {
  BrowserLimitReachedError,
  profileDirectoryFor,
  Workspaces,
} from "./workspaces";

const ALICE = userId("did:privy:alice");
const BOB = userId("did:privy:bob");

const MODES: ServiceModes = {
  database: "stub",
  graph: "stub",
  hedera: "stub",
  model: "stub",
  privy: "stub",
};

/**
 * A browser that never spawns Chrome.
 *
 * A subclass rather than a hand-built double: `BrowserSession`'s constructor
 * only wires an arbitrator, a tab registry and a screencast — Chrome appears
 * on `start()`, which nothing here calls. So the real object is already the
 * cheap one, and overriding two methods is enough to drive the cap without
 * casting a two-method literal into a thirty-method class.
 */
class TestBrowser extends BrowserSession {
  private running = false;

  run(): void {
    this.running = true;
  }

  override state(): BrowserState {
    return { ...super.state(), status: this.running ? "running" : "idle" };
  }

  override close(): void {
    this.running = false;
  }
}

const noop = (): void => {
  // Sinks the registry publishes into. These tests read state, not events.
};

const createRegistry = (maxBrowsers = 0) => {
  const browsers: TestBrowser[] = [];
  const profiles: string[] = [];
  const workspaces = new Workspaces({
    createBrowser: (options: BrowserSessionOptions) => {
      const browser = new TestBrowser(options);
      browsers.push(browser);
      profiles.push(options.profileDirectory);
      return browser;
    },
    ledger: memoryLedger(),
    maxBrowsers,
    modes: MODES,
    onBrowserState: noop,
    onPolicyDecision: noop,
    onReceipt: noop,
    oracleHost: "froggy.test",
    oraclePayTo: "0.0.1",
    profileRoot: "/tmp/froggy-test",
    quote: (_asset, now) => parQuote(now),
  });
  return { browsers, profiles, workspaces };
};

describe("profileDirectoryFor", () => {
  test("gives each user their own directory", () => {
    expect(profileDirectoryFor("/p", ALICE)).not.toBe(
      profileDirectoryFor("/p", BOB)
    );
  });

  test("is stable, so a returning user keeps their logins", () => {
    expect(profileDirectoryFor("/p", ALICE)).toBe(
      profileDirectoryFor("/p", ALICE)
    );
  });

  test("does not name the user", () => {
    // A directory listing on the host is readable by anyone with shell access
    // and by anything that ships logs. It should not enumerate who signed in.
    expect(profileDirectoryFor("/p", ALICE)).not.toContain("alice");
  });

  test("is a single path segment with no separators of its own", () => {
    // DIDs contain colons and could contain anything a future method scheme
    // allows. A hash means the path cannot be steered out of the root.
    const directory = profileDirectoryFor("/p", ALICE).slice("/p/".length);
    expect(directory).toMatch(/^[0-9a-f]{24}$/u);
  });
});

describe("Workspaces", () => {
  test("returns the same workspace for the same user", () => {
    const { workspaces } = createRegistry();
    expect(workspaces.for(ALICE)).toBe(workspaces.for(ALICE));
  });

  test("gives two users separate sessions and separate browsers", () => {
    const { workspaces } = createRegistry();
    const alice = workspaces.for(ALICE);
    const bob = workspaces.for(BOB);
    expect(alice.session.id).not.toBe(bob.session.id);
    expect(alice.browser).not.toBe(bob.browser);
    // Separate mandates, so one person freezing does not freeze the other.
    expect(alice.session.currentMandate.id).not.toBe(
      bob.session.currentMandate.id
    );
  });

  test("gives two users separate profile directories", () => {
    const { profiles, workspaces } = createRegistry();
    workspaces.for(ALICE);
    workspaces.for(BOB);
    expect(profiles[0]).not.toBe(profiles[1]);
  });

  test("counts running browsers, not workspaces that exist", () => {
    const { browsers, workspaces } = createRegistry();
    workspaces.for(ALICE);
    workspaces.for(BOB);
    expect(workspaces.runningBrowsers).toBe(0);
    browsers[0]?.run();
    expect(workspaces.runningBrowsers).toBe(1);
  });

  test("admits everyone when uncapped", () => {
    const { browsers, workspaces } = createRegistry(0);
    workspaces.admitBrowser(ALICE);
    browsers[0]?.run();
    expect(() => workspaces.admitBrowser(BOB)).not.toThrow();
  });

  test("refuses a new browser once the cap is reached", () => {
    const { browsers, workspaces } = createRegistry(1);
    workspaces.admitBrowser(ALICE);
    browsers[0]?.run();
    expect(() => workspaces.admitBrowser(BOB)).toThrow(
      BrowserLimitReachedError
    );
  });

  test("still admits a user whose browser is already running", () => {
    // Otherwise the cap would lock out the very people it is protecting: at
    // the limit, everyone with a Chrome would stop being able to type into it.
    const { browsers, workspaces } = createRegistry(1);
    workspaces.admitBrowser(ALICE);
    browsers[0]?.run();
    expect(() => workspaces.admitBrowser(ALICE)).not.toThrow();
  });
});
