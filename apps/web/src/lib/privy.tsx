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

import { privyAppId, privyConfigured } from "../environment";

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
  /** The money address: the smart account when there is one, else the signer. */
  readonly address: string | null;
  readonly authenticated: boolean;
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
  address: null,
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
  address: null,
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
  readonly useLogin: () => { login: () => void };
  readonly usePrivy: () => {
    authenticated: boolean;
    getAccessToken: () => Promise<string | null>;
    logout: () => Promise<void>;
    ready: boolean;
    user: {
      smartWallet?: { address: string };
      wallet?: { address: string };
    } | null;
  };
}

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
  const callbacks = useRef({ getAccessToken, login, logout });
  useEffect(() => {
    callbacks.current = { getAccessToken, login, logout };
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

  // Smart account first: that is where money is. Falling back to the embedded
  // EOA covers a user who has one but no smart wallet.
  const address = user?.smartWallet?.address ?? user?.wallet?.address ?? null;
  const signer = user?.wallet?.address ?? null;

  useEffect(() => {
    onChange({
      address,
      authenticated,
      login: doLogin,
      logout: doLogout,
      ready,
      signer,
      status: "ready",
      stubbed: false,
      token,
    });
    // Primitives and stable callbacks only. `user` is deliberately absent: it
    // is a new object on every render, and the two strings that matter are
    // read out of it above.
  }, [
    address,
    authenticated,
    doLogin,
    doLogout,
    onChange,
    ready,
    signer,
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
