/**
 * Privy, client side.
 *
 * Three moves, each of which exists because the naive
 * version broke:
 *
 *   1. **Dynamic `import()` inside an effect.** The bundle must not hard-depend
 *      on `@privy-io/react-auth`, so a build with no app id neither loads it nor
 *      fails on it.
 *   2. **The provider mounts *beside* the app, not around it.** A bridge
 *      component lifts Privy's state sideways into context, so the whole tree
 *      does not remount the moment Privy resolves.
 *   3. **An error boundary around Privy's render.** It throws at render time on
 *      an insecure origin or a bad app id, and an unhandled throw there is a
 *      white page rather than a sign-in button that does not work.
 *
 * Without an app id this degrades to a **local identity**: a random token kept
 * in `localStorage` and sent exactly like a real one. That matters more than it
 * sounds. The server has no anonymous path — every route and both sockets
 * demand a token — so a stub that produced no token would leave the whole
 * authenticated path unexercised until the day Privy went live, which is the
 * worst day to first run it. Instead the same code runs, against
 * `stubPrivyServer`, and the header says "local identity" so nobody mistakes
 * it for a login.
 *
 * A second local user is a second browser profile or an incognito window: the
 * token is per-origin storage, so those get different workspaces.
 */
import {
  Component,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { ReactElement, ReactNode } from "react";

import { onrampEnvironment, privyAppId, privyConfigured } from "../environment";

/** USDC on Base mainnet: where a card purchase lands. */
const USDC_BASE_MAINNET = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const BASE_MAINNET = "eip155:8453";

/**
 * What came of opening Privy's fiat onramp. `refused` carries Privy's own
 * words: the dashboard toggle being off, a region it does not serve, a
 * closed window.
 */
export type FundOutcome =
  | { readonly kind: "confirmed" | "submitted" }
  | { readonly kind: "refused"; readonly reason: string };

/**
 * What came of opening Privy's deposit flow: the person either completed a
 * deposit, closed the modal, or Privy refused the route. `refused` carries a
 * sentence already turned from Privy's error code into product words.
 */
type DepositOutcome =
  | { readonly kind: "closed" | "completed" }
  | { readonly kind: "refused"; readonly reason: string };

/**
 * Privy names the reason a deposit cannot proceed; a person needs the reason,
 * not the name. Anything unlisted keeps Privy's own words rather than a shrug.
 */
const DEPOSIT_REASONS = {
  AMOUNT_TOO_LOW: "That amount is too small to convert after fees.",
  DEPOSIT_ADDRESSES_NOT_ENABLED:
    "Deposits from other chains are not switched on for this app yet.",
  DEPOSIT_FAILED: "The deposit did not complete. Nothing was taken.",
  DEPOSIT_REFUNDED: "The deposit was sent back to where it came from.",
  INSUFFICIENT_LIQUIDITY:
    "There is not enough liquidity to convert that token right now.",
  NOT_AUTHENTICATED: "Sign in again and retry.",
  NO_SWAP_ROUTES_FOUND: "That token cannot be converted to USDC right now.",
  ROUTE_UNAVAILABLE: "That chain and token cannot reach USDC on Base today.",
  SANCTIONED_WALLET_ADDRESS: "That address cannot be used.",
  TIMEOUT_ORDER_COMPLETION:
    "The conversion is taking longer than expected; it may still land.",
  TIMEOUT_WAITING_FOR_NEXT_ORDER: "Nothing arrived before the window closed.",
  UNSUPPORTED_CHAIN: "That chain is not supported.",
  UNSUPPORTED_CURRENCY: "That token is not supported.",
  UNSUPPORTED_ROUTE: "That route is not supported.",
} satisfies Record<string, string>;

/** Privy's error text carries the code; find the words that belong to it. */
const depositReason = (words: string): string => {
  for (const [code, sentence] of Object.entries(DEPOSIT_REASONS)) {
    if (words.includes(code)) {
      return sentence;
    }
  }
  return words;
};

/**
 * What came of asking the person, through Privy's own prompt, to let the
 * agent sign on their wallet under the policy. `refused` carries Privy's words.
 */
type GrantOutcome =
  | { readonly kind: "granted" }
  | { readonly kind: "refused"; readonly reason: string };

/**
 * Where sign-in stands.
 *
 * `loading` is a real state, not a placeholder: with an app id configured the
 * first render has no idea whether there is a session, and showing a sign-in
 * button for the second Privy takes to answer flashes "signed out" at every
 * signed-in person. `failed` is Privy refusing to initialise at all — a bad
 * app id, an insecure origin — which deserves a sentence, not a dead button.
 */
type IdentityStatus = "failed" | "loading" | "local" | "ready";

export interface Identity {
  /**
   * Opens Privy's fiat onramp (card, Apple Pay where offered) toward USDC on
   * Base for `address`. Null without a Privy sign-in: the local identity has
   * no wallet to fund.
   */
  readonly addFunds:
    | ((input: { readonly address: string }) => Promise<FundOutcome>)
    | null;
  /** The money address: the smart account when there is one, else the signer. */
  readonly address: string | null;
  readonly authenticated: boolean;
  /**
   * Opens Privy's deposit flow: the person picks a chain and token, sends to
   * the address Privy mints, and Privy converts it to USDC on Base into this
   * wallet. Null without a Privy sign-in.
   */
  readonly startDeposit:
    | ((input: { readonly address: string }) => Promise<DepositOutcome>)
    | null;
  /**
   * Asks the person, in Privy's own prompt, to add the agent's key quorum as
   * a signer on their wallet under `policyId`. Privy's primary path for a
   * server signer, and the one that needs no dashboard toggle. Null without
   * a Privy sign-in.
   */
  readonly grantAgentSigner:
    | ((input: {
        readonly address: string;
        readonly policyId: string;
        readonly signerId: string;
      }) => Promise<GrantOutcome>)
    | null;
  readonly login: () => void;
  readonly logout: () => void;
  readonly ready: boolean;
  /** The embedded EOA. What `personal_sign` recovers to; not where funds live. */
  readonly signer: string | null;
  readonly status: IdentityStatus;
  readonly stubbed: boolean;
  readonly token: () => Promise<string | null>;
}

/** Neither signing in nor out does anything without a Privy app id. */
const unavailable = (): void => undefined;

const LOCAL_TOKEN_KEY = "froggy.local-identity";

/**
 * The local identity's token.
 *
 * Random, so two profiles are two users, and persisted, so a reload returns to
 * the same workspace rather than a fresh mandate every refresh. It is not a
 * credential — `stubPrivyServer` accepts any non-empty string — and it is only
 * ever used when no Privy app id is configured.
 */
const localToken = (): string => {
  try {
    const existing = globalThis.localStorage?.getItem(LOCAL_TOKEN_KEY);
    if (existing !== null && existing !== undefined && existing !== "") {
      return existing;
    }
    const minted = crypto.randomUUID();
    globalThis.localStorage?.setItem(LOCAL_TOKEN_KEY, minted);
    return minted;
  } catch {
    // Storage can throw outright in a locked-down context. A per-load token
    // still works; it just means a reload starts a new workspace.
    return crypto.randomUUID();
  }
};

const LOCAL: Identity = {
  addFunds: null,
  address: null,
  grantAgentSigner: null,
  startDeposit: null,
  // True: there *is* a caller, and the server will accept them. `stubbed`
  // is what tells the UI not to call it a sign-in.
  authenticated: true,
  login: unavailable,
  logout: unavailable,
  ready: true,
  signer: null,
  status: "local",
  stubbed: true,
  token: async () => await Promise.resolve(localToken()),
};

const nobody = async (): Promise<null> => await Promise.resolve(null);

/** Privy is configured and has not answered yet. */
const LOADING: Identity = {
  addFunds: null,
  address: null,
  grantAgentSigner: null,
  startDeposit: null,
  authenticated: false,
  login: unavailable,
  logout: unavailable,
  ready: false,
  signer: null,
  status: "loading",
  stubbed: false,
  token: nobody,
};

/** Privy is configured and could not start. */
const FAILED: Identity = {
  ...LOADING,
  ready: true,
  status: "failed",
};

const IdentityContext = createContext<Identity>(LOCAL);

export const useIdentity = (): Identity => useContext(IdentityContext);

interface PrivyModule {
  readonly PrivyProvider: (props: {
    appId: string;
    children: ReactNode;
    config: unknown;
  }) => React.ReactElement;
  readonly useFiatOnramp: () => {
    fund: (options: {
      destination: { address: string; asset: string; chain: string };
      environment: "production" | "sandbox";
      source: { defaultAsset: string };
    }) => Promise<{ status: "confirmed" | "submitted" }>;
  };
  readonly useDepositAddress: () => {
    createDepositAddress: (input: {
      destinationAddress: string;
      destinationChain: string;
      destinationCurrency: string;
    }) => Promise<void>;
  };
  readonly useLogin: () => { login: () => void };
  readonly useSigners: () => {
    addSigners: (input: {
      address: string;
      signers: { policyIds?: string[]; signerId: string }[];
    }) => Promise<object>;
  };
  readonly usePrivy: () => {
    authenticated: boolean;
    getAccessToken: () => Promise<string | null>;
    logout: () => Promise<void>;
    ready: boolean;
    user: {
      id?: string;
      smartWallet?: { address: string };
      wallet?: { address: string };
    } | null;
  };
  // SPIKE 0a (docs/plan/PLAN_USER_OWNED_POLICIES.md). Delete with the spike.
  readonly useAuthorizationSignature: () => {
    generateAuthorizationSignature: (input: {
      body: unknown;
      headers: Record<string, string>;
      method: string;
      url: string;
      version: number;
    }) => Promise<{ signature: string }>;
  };
}

/**
 * SPIKE 0a: can the person's own key change a policy the person owns?
 *
 * The server half proved our app secret cannot (`401 No valid authorization
 * keys or user signing keys available`). Only a signed-in browser holds the
 * user's signing key, so the question can be asked nowhere else. This exposes
 * exactly one function on `window`, only in a dev build, and only so the
 * question can be asked once by a human at a console.
 *
 * It is not a feature and must not become one: the whole block, the hook call
 * that drives it and the two `PrivyModule` additions above are deleted the
 * moment `docs/evidence/PRIVY.md` carries the verdict. It never signs anything
 * that moves money — the policy it edits is attached to no wallet.
 */
const RELAY = "http://127.0.0.1:8899";

/** What the spike relay answers. Optional throughout: a failure answers partially. */
interface MintReply {
  readonly error?: string;
  readonly expiry?: number;
  readonly payload?: {
    body: unknown;
    headers: Record<string, string>;
    method: string;
    url: string;
    version: number;
  };
  readonly policyId?: string;
}

interface PatchReply {
  readonly ok?: boolean;
  readonly status?: number;
  readonly text?: string;
}

const useSpikePolicyOwner = (
  did: string | null,
  sign: (input: {
    body: unknown;
    headers: Record<string, string>;
    method: string;
    url: string;
    version: number;
  }) => Promise<{ signature: string }>
): void => {
  useEffect(() => {
    // The same teardown on both paths, so the effect has one shape rather than
    // two, and a build that never installs the affordance still guarantees the
    // global is clear.
    const remove = (): void => {
      Reflect.deleteProperty(globalThis, "froggySpikePolicyOwner");
    };
    if (!import.meta.env.DEV) {
      return remove;
    }
    const run = async (): Promise<string> => {
      if (did === null) {
        return "FAIL: sign in first — no Privy user on this session.";
      }
      const minted = await fetch(`${RELAY}/mint`, {
        body: JSON.stringify({ did }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      // SAFETY: the relay on the other end of this is `tools/spikes/
      // privy-policy-owner-relay.ts`, ours and on loopback, and every field is
      // checked for `undefined` immediately below before anything is done with
      // it. A product path would decode; a spike may trust its own harness.
      const mint = (await minted.json()) as MintReply;
      if (
        mint.payload === undefined ||
        mint.policyId === undefined ||
        mint.expiry === undefined
      ) {
        return `FAIL at mint: ${mint.error ?? "the relay returned nothing usable"}`;
      }
      // The payload is signed exactly as the relay will send it; a mismatch of
      // one byte is a refusal that would look like a permissions answer.
      const { signature } = await sign(mint.payload);
      const patched = await fetch(`${RELAY}/patch`, {
        body: JSON.stringify({
          expiry: mint.expiry,
          policyId: mint.policyId,
          signature,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      // SAFETY: as above — our own relay, and every field is optional and
      // defaulted at each use below.
      const result = (await patched.json()) as PatchReply;
      if (result.ok === true) {
        return `PASS: the person's own key edited policy ${mint.policyId}, which the app secret could not. User-owned policies are reachable.\n${result.text ?? ""}`;
      }
      // A wrong signature and a missing one earn the same 401 from Privy, so a
      // failure here is not yet a verdict: it is either "the person's key may not
      // do this" or "the payload we signed differs by a byte from the one we
      // sent". Say so, rather than recording the stronger claim.
      return `FAIL (${result.status ?? "?"}): Privy did not accept the person's signature. This is not yet proof that it cannot — an identical 401 comes back when the signed payload and the sent payload disagree. ${result.text ?? ""}`;
    };
    // `Reflect.set` rather than an assertion on `globalThis`: this is a console
    // affordance, not a typed part of the app's surface, and widening the global
    // type for a spike would outlive the spike.
    Reflect.set(globalThis, "froggySpikePolicyOwner", async () => {
      try {
        const verdict = await run();
        console.warn(verdict);
        return verdict;
      } catch (error) {
        const verdict = `FAIL, threw: ${error instanceof Error ? error.message : String(error)}`;
        console.warn(verdict);
        return verdict;
      }
    });
    return remove;
  }, [did, sign]);
};

/**
 * Reads Privy's hooks and publishes them upward.
 *
 * It renders nothing. Its entire purpose is to be *inside* the provider (where
 * the hooks work) while the app is *outside* it (where a provider remount does
 * not cost the app its state).
 */
const PrivyBridge = ({
  module: mod,
  onChange,
}: {
  readonly module: PrivyModule;
  readonly onChange: (identity: Identity) => void;
}): null => {
  const { authenticated, getAccessToken, logout, ready, user } = mod.usePrivy();
  const { login } = mod.useLogin();
  const { fund } = mod.useFiatOnramp();
  const { addSigners } = mod.useSigners();
  const { createDepositAddress } = mod.useDepositAddress();
  const { generateAuthorizationSignature } = mod.useAuthorizationSignature();
  useSpikePolicyOwner(user?.id ?? null, generateAuthorizationSignature);

  /**
   * Privy's callbacks, held rather than depended on.
   *
   * `login`, `logout` and `getAccessToken` are a fresh function identity on
   * most renders. Listing them as effect dependencies meant the effect ran on
   * every render, published a brand-new identity object, re-rendered this
   * component through its parent's state, and ran again — an infinite loop
   * that React stops with error #185.
   *
   * It only ever fired once Privy was really configured, so it shipped: the
   * boundary below caught the throw and blamed HTTPS or the app id, which is
   * what the deployed app said while both were correct.
   */
  const callbacks = useRef({
    addSigners,
    createDepositAddress,
    fund,
    getAccessToken,
    login,
    logout,
  });
  useEffect(() => {
    callbacks.current = {
      addSigners,
      createDepositAddress,
      fund,
      getAccessToken,
      login,
      logout,
    };
  });

  // Stable for the life of the bridge, so a consumer can hold one in a
  // dependency array without inheriting Privy's churn.
  const doLogin = useCallback(() => {
    callbacks.current.login();
  }, []);
  const doLogout = useCallback(() => {
    void callbacks.current.logout();
  }, []);
  const token = useCallback(
    async () => await callbacks.current.getAccessToken(),
    []
  );
  const addFunds = useCallback(
    async ({ address }: { readonly address: string }): Promise<FundOutcome> => {
      try {
        const result = await callbacks.current.fund({
          destination: {
            address,
            asset: USDC_BASE_MAINNET,
            chain: "eip155:8453",
          },
          environment: onrampEnvironment,
          source: { defaultAsset: "eur" },
        });
        return { kind: result.status };
      } catch (error) {
        // Privy's words, verbatim: the toggle is off, the region is not
        // served, the person closed the window. Never a retry on its own.
        return {
          kind: "refused",
          reason: error instanceof Error ? error.message : String(error),
        };
      }
    },
    []
  );

  const grantAgentSigner = useCallback(
    async ({
      address: wallet,
      policyId,
      signerId,
    }: {
      readonly address: string;
      readonly policyId: string;
      readonly signerId: string;
    }): Promise<GrantOutcome> => {
      try {
        await callbacks.current.addSigners({
          address: wallet,
          signers: [{ policyIds: [policyId], signerId }],
        });
        return { kind: "granted" };
      } catch (error) {
        // Privy's words, verbatim: the person declined, or the dashboard
        // does not allow signers. Never a retry on its own.
        return {
          kind: "refused",
          reason: error instanceof Error ? error.message : String(error),
        };
      }
    },
    []
  );

  const startDeposit = useCallback(
    async ({
      address: wallet,
    }: {
      readonly address: string;
    }): Promise<DepositOutcome> => {
      try {
        await callbacks.current.createDepositAddress({
          destinationAddress: wallet,
          destinationChain: BASE_MAINNET,
          destinationCurrency: USDC_BASE_MAINNET,
        });
        return { kind: "completed" };
      } catch (error) {
        const words = error instanceof Error ? error.message : String(error);
        // Closing the modal is a choice, not a failure, and Privy says so
        // with its own code rather than an ordinary error.
        return words.includes("USER_EXITED")
          ? { kind: "closed" }
          : { kind: "refused", reason: depositReason(words) };
      }
    },
    []
  );

  // Smart account first: that is where money is. Falling back to the embedded
  // EOA covers a user who has one but no smart wallet.
  const address = user?.smartWallet?.address ?? user?.wallet?.address ?? null;
  const signer = user?.wallet?.address ?? null;

  useEffect(() => {
    onChange({
      addFunds,
      address,
      authenticated,
      grantAgentSigner,
      login: doLogin,
      logout: doLogout,
      ready,
      signer,
      startDeposit,
      status: "ready",
      stubbed: false,
      token,
    });
    // Primitives and stable callbacks only. `user` is deliberately absent: it
    // is a new object on every render, and the two strings that matter are
    // read out of it above.
  }, [
    addFunds,
    address,
    authenticated,
    doLogin,
    grantAgentSigner,
    doLogout,
    onChange,
    ready,
    signer,
    startDeposit,
    token,
  ]);

  return null;
};

interface QuarantineProps {
  readonly children: ReactNode;
  readonly onFail: () => void;
}

interface QuarantineState {
  readonly failed: boolean;
}

/**
 * Contains Privy's render-time throws.
 *
 * It throws on an insecure origin and on a bad app id — both of which are
 * ordinary states during setup — and an unhandled throw at render is a white
 * page rather than a sign-in button that does not work.
 *
 * The UI deliberately does *not* guess which of those it was. It used to say
 * "not HTTPS, or the app id does not match this origin", and the first real
 * failure was neither: it was React error #185, an infinite render loop in the
 * bridge above. A confident wrong diagnosis sent someone checking DNS and
 * dashboard settings that were both already correct, so the message now points
 * at the console and the console carries the actual error.
 */
class Quarantine extends Component<QuarantineProps, QuarantineState> {
  constructor(props: QuarantineProps) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError(error: Error): QuarantineState {
    // Logged rather than swallowed silently: "sign-in did nothing" is a support
    // question, and this is the only place the answer exists. The stack goes
    // with it — React's minified errors are a number and a URL, and without
    // the frames there is nothing to act on.
    console.warn("Privy failed to initialise:", error.message, error.stack);
    return { failed: true };
  }

  override componentDidCatch(): void {
    this.props.onFail();
  }

  override render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * Load Privy, or decide we are running without it.
 *
 * Outside the component because React Compiler cannot lower a dynamic `import`
 * inside one — and because "fetch a module" is not rendering. A failed load is
 * `null` rather than a throw: a network hiccup on a third-party script should
 * cost sign-in, not the whole workspace.
 */
const loadPrivy = async (): Promise<PrivyModule | null> => {
  try {
    const loaded: unknown = await import("@privy-io/react-auth");
    // SAFETY: `PrivyModule` names the three exports this file calls, all of
    // which are part of the package's documented API. The assertion exists
    // because the module is loaded dynamically and so has no static type here.
    return loaded as PrivyModule;
  } catch {
    return null;
  }
};

export const IdentityProvider = ({
  children,
}: {
  readonly children: ReactNode;
}): ReactElement => {
  const [identity, setIdentity] = useState<Identity>(
    privyConfigured ? LOADING : LOCAL
  );
  const [module, setModule] = useState<PrivyModule | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!privyConfigured) {
      // Still returns a cleanup, so the effect has one shape rather than two.
      return () => {
        cancelled = true;
      };
    }
    void (async () => {
      const loaded = await loadPrivy();
      if (cancelled) {
        return;
      }
      if (loaded === null) {
        setIdentity(FAILED);
      } else {
        setModule(loaded);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <IdentityContext.Provider value={identity}>
      {module === null ? null : (
        <Quarantine
          onFail={() => {
            setIdentity(FAILED);
          }}
        >
          <module.PrivyProvider
            appId={privyAppId}
            config={{
              appearance: {
                accentColor: "#3f8a4f",
                landingHeader: "Froggy",
                loginMessage: "An agent with a wallet you can watch.",
                theme: "light",
              },
              embeddedWallets: {
                ethereum: { createOnLogin: "all-users" },
                showWalletUIs: false,
              },
              // Social login only, on purpose: a person who connects an
              // existing wallet and then sees a second, minted one has two
              // answers to "which is mine", and the demo needs one.
              loginMethods: ["google", "email"],
            }}
          >
            <PrivyBridge module={module} onChange={setIdentity} />
          </module.PrivyProvider>
        </Quarantine>
      )}
      {children}
    </IdentityContext.Provider>
  );
};
