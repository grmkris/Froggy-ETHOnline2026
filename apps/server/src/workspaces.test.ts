/**
 * What these tests are actually protecting.
 *
 * The single-session build handed every visitor the same mandate, the same
 * receipts and the same Chrome. The registry is what stopped that, so the
 * properties worth asserting are the isolation ones: two DIDs never share a
 * session, and a profile path never leaks the DID that produced it. On top
 * of that sit the seats: a cap that counts browsers with a process behind
 * them, a line that seats people in order, a seat held for the judge, and
 * a sweep that releases what nobody is using.
 */

import { describe, expect, test } from "bun:test";

import type { BrowserHandle, BrowserSessionOptions } from "@froggy/browser";
import { parQuote, userId } from "@froggy/domain";
import type { SessionId } from "@froggy/domain";
import type {
  BrowserClientMessage,
  BrowserState,
  ServiceModes,
} from "@froggy/protocol";
import { memoryLedger, memoryStore } from "@froggy/wallet";

import {
  BrowserLimitReachedError,
  profileDirectoryFor,
  Workspaces,
} from "./workspaces";

const ALICE = userId("did:privy:alice");
const BOB = userId("did:privy:bob");
const CAROL = userId("did:privy:carol");
const JUDGE = userId("did:privy:judge");

const MODES: ServiceModes = {
  database: "stub",
  graph: "stub",
  hedera: "stub",
  model: "stub",
  privy: "stub",
};

/**
 * A browser that never spawns anything.
 *
 * It does what the registry can observe: it reports a state, and it
 * publishes that state through the `onStateChange` it was built with — the
 * same channel a worker uses — so a seat is taken and given back the way it
 * is in production, by the browser saying so.
 */
interface FakeBrowser extends BrowserHandle {
  readonly run: () => void;
  readonly started: (string | undefined)[];
}

/** A resolved promise, for the methods the registry never calls. */
const settled = async (): Promise<void> => {
  await Promise.resolve();
};

const createFakeBrowser = (options: BrowserSessionOptions): FakeBrowser => {
  const started: (string | undefined)[] = [];
  let status: BrowserState["status"] = "idle";
  const state = (): BrowserState => ({
    activeTabId: null,
    error: null,
    frozen: false,
    interaction: "idle",
    queue: null,
    status,
    tabs: [],
    viewport: { height: 800, width: 1280 },
  });
  const run = (): void => {
    status = "running";
    options.onStateChange?.(state());
  };
  return {
    agentClick: async () => {
      await settled();
      return { note: "", ok: false };
    },
    agentNavigate: async () => {
      await settled();
      return "skipped";
    },
    agentSnapshot: async () => {
      await settled();
      return { snapshot: { text: "", title: "", url: "" }, wait: "skipped" };
    },
    agentType: settled,
    close: async () => {
      await settled();
      status = "idle";
      options.onStateChange?.(state());
    },
    freeze: settled,
    handleClientMessage: async (message: BrowserClientMessage) => {
      await settled();
      if (message.type === "browser.start") {
        started.push(message.url);
        run();
      }
    },
    resendLatest: () => {
      // Nothing cached.
    },
    run,
    started,
    state,
    subscribe: () => () => {
      // Nothing to release.
    },
    takePage: settled,
    unfreeze: settled,
  };
};

const noop = (): void => {
  // Sinks the registry publishes into. These tests read state, not events.
};

interface RegistryOptions {
  readonly demoUserId?: typeof JUDGE | null;
  readonly maxBrowsers?: number;
  readonly reservedBrowsers?: number;
}

const createRegistry = (options: RegistryOptions = {}) => {
  const browsers = new Map<string, FakeBrowser>();
  const profiles: string[] = [];
  const published: { userId: string; queue: BrowserState["queue"] }[] = [];
  const busy = new Set<SessionId>();
  let now = 1_000_000;
  const workspaces = new Workspaces({
    blockPrivateNetwork: true,
    browserIdleMs: 10_000,
    createBrowser: (browserOptions: BrowserSessionOptions) => {
      const browser = createFakeBrowser(browserOptions);
      browsers.set(browserOptions.profileDirectory, browser);
      profiles.push(browserOptions.profileDirectory);
      return browser;
    },
    demoUserId: options.demoUserId ?? null,
    isBusy: (sessionId) => busy.has(sessionId),
    ledger: memoryLedger(),
    maxBrowsers: options.maxBrowsers ?? 0,
    modes: MODES,
    now: () => now,
    onBrowserState: (user, state) => {
      published.push({ queue: state.queue, userId: user });
    },
    onMandate: noop,
    onPolicyDecision: noop,
    onReceipt: noop,
    oracleHost: "oracle.test",
    oraclePayTo: "0.0.5005",
    profileRoot: "/tmp/froggy-test-profiles",
    quote: (_asset, at) => parQuote(at),
    reservedBrowsers: options.reservedBrowsers ?? 0,
    store: memoryStore(),
  });
  const browserOf = (user: typeof ALICE): FakeBrowser => {
    workspaces.for(user);
    const browser = browsers.get(
      profileDirectoryFor("/tmp/froggy-test-profiles", user)
    );
    if (browser === undefined) {
      throw new Error("no browser");
    }
    return browser;
  };
  const advance = (ms: number): void => {
    now += ms;
  };
  return { advance, browserOf, busy, profiles, published, workspaces };
};

const settle = async (): Promise<void> => {
  await Bun.sleep(5);
};

describe("profileDirectoryFor", () => {
  test("gives each user their own directory", () => {
    expect(profileDirectoryFor("/data", ALICE)).not.toBe(
      profileDirectoryFor("/data", BOB)
    );
  });

  test("is stable, so a returning user keeps their logins", () => {
    expect(profileDirectoryFor("/data", ALICE)).toBe(
      profileDirectoryFor("/data", ALICE)
    );
  });

  test("does not name the user", () => {
    expect(profileDirectoryFor("/data", ALICE)).not.toContain("alice");
  });

  test("is a single path segment with no separators of its own", () => {
    const leaf = profileDirectoryFor("/data", ALICE).slice("/data/".length);
    expect(leaf).toMatch(/^[0-9a-f]+$/u);
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
    expect(alice.session).not.toBe(bob.session);
    expect(alice.session.id).not.toBe(bob.session.id);
    expect(alice.browser).not.toBe(bob.browser);
  });

  test("gives two users separate profile directories", () => {
    const { profiles, workspaces } = createRegistry();
    workspaces.for(ALICE);
    workspaces.for(BOB);
    expect(new Set(profiles).size).toBe(2);
  });

  test("counts browsers with a process behind them, not workspaces that exist", () => {
    const { browserOf, workspaces } = createRegistry();
    workspaces.for(ALICE);
    workspaces.for(BOB);
    expect(workspaces.runningBrowsers).toBe(0);
    browserOf(ALICE).run();
    expect(workspaces.runningBrowsers).toBe(1);
  });

  test("admits everyone when uncapped", () => {
    const { browserOf, workspaces } = createRegistry();
    for (const user of [ALICE, BOB, CAROL]) {
      workspaces.admitBrowser(user);
      browserOf(user).run();
    }
    expect(workspaces.runningBrowsers).toBe(3);
  });

  test("puts the next person in line once every seat is taken, with their position", () => {
    const { browserOf, published, workspaces } = createRegistry({
      maxBrowsers: 1,
    });
    workspaces.admitBrowser(ALICE);
    browserOf(ALICE).run();
    const refusal = (): void => {
      workspaces.admitBrowser(BOB, "https://example.com/");
    };
    expect(refusal).toThrow(BrowserLimitReachedError);
    expect(workspaces.stateOf(BOB).queue).toEqual({ ahead: 0, position: 1 });
    expect(() => workspaces.admitBrowser(CAROL)).toThrow(/2 in line/u);
    expect(workspaces.stateOf(CAROL).queue).toEqual({ ahead: 1, position: 2 });
    // Asking again keeps the place rather than moving to the back.
    expect(refusal).toThrow(/next in line/u);
    expect(published.some((p) => p.userId === BOB && p.queue !== null)).toBe(
      true
    );
  });

  test("still admits a user whose browser is already running", () => {
    const { browserOf, workspaces } = createRegistry({ maxBrowsers: 1 });
    workspaces.admitBrowser(ALICE);
    browserOf(ALICE).run();
    expect(() => workspaces.admitBrowser(ALICE)).not.toThrow();
  });

  test("seats the next in line when a browser stops, starting the page they asked for", async () => {
    const { browserOf, workspaces } = createRegistry({ maxBrowsers: 1 });
    workspaces.admitBrowser(ALICE);
    browserOf(ALICE).run();
    expect(() =>
      workspaces.admitBrowser(BOB, "https://example.com/")
    ).toThrow();
    await browserOf(ALICE).close();
    await settle();
    expect(workspaces.stateOf(BOB).queue).toBeNull();
    expect(browserOf(BOB).started).toEqual(["https://example.com/"]);
    expect(workspaces.runningBrowsers).toBe(1);
  });

  test("leaves the line when the last browser socket closes", () => {
    const { browserOf, workspaces } = createRegistry({ maxBrowsers: 1 });
    workspaces.admitBrowser(ALICE);
    browserOf(ALICE).run();
    workspaces.watch(BOB);
    expect(() => workspaces.admitBrowser(BOB)).toThrow();
    workspaces.unwatch(BOB);
    expect(workspaces.stateOf(BOB).queue).toBeNull();
  });

  test("holds a seat for the demo account while it is away", () => {
    const { browserOf, workspaces } = createRegistry({
      demoUserId: JUDGE,
      maxBrowsers: 2,
      reservedBrowsers: 1,
    });
    workspaces.admitBrowser(ALICE);
    browserOf(ALICE).run();
    // One seat left, and it is the judge's.
    expect(() => workspaces.admitBrowser(BOB)).toThrow(
      BrowserLimitReachedError
    );
    expect(() => workspaces.admitBrowser(JUDGE)).not.toThrow();
    browserOf(JUDGE).run();
    expect(workspaces.runningBrowsers).toBe(2);
  });

  test("releases a browser nobody is watching or driving after the idle period", async () => {
    const { advance, browserOf, busy, workspaces } = createRegistry({
      maxBrowsers: 1,
    });
    workspaces.admitBrowser(ALICE);
    browserOf(ALICE).run();
    // Watched: stays.
    workspaces.watch(ALICE);
    advance(60_000);
    await workspaces.sweepIdle();
    expect(workspaces.runningBrowsers).toBe(1);
    // Unwatched but the agent is mid-turn: stays.
    workspaces.unwatch(ALICE);
    busy.add(workspaces.for(ALICE).session.id);
    advance(60_000);
    await workspaces.sweepIdle();
    expect(workspaces.runningBrowsers).toBe(1);
    // Nobody looking, nothing running, long quiet: released.
    busy.clear();
    advance(60_000);
    await workspaces.sweepIdle();
    await settle();
    expect(workspaces.runningBrowsers).toBe(0);
    expect(workspaces.stateOf(ALICE).status).toBe("idle");
  });
});
