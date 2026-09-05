/**
 * Privy, client side.
 *
 * Three moves lifted from humanhook, each of which exists because the naive
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
  useContext,
  useEffect,
  useState,
} from "react";
import type { ReactElement, ReactNode } from "react";

import { privyAppId, privyConfigured } from "../environment";

export interface Identity {
  /** The money address: the smart account when there is one, else the signer. */
  readonly address: string | null;
  readonly authenticated: boolean;
  readonly login: () => void;
  readonly logout: () => void;
  readonly ready: boolean;
  /** The embedded EOA. What `personal_sign` recovers to; not where funds live. */
  readonly signer: string | null;
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
  stubbed: true,
  token: async () => await Promise.resolve(localToken()),
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

  useEffect(() => {
    onChange({
      // Smart account first: that is where money is. Falling back to the
      // embedded EOA covers a user who has one but no smart wallet.
      address: user?.smartWallet?.address ?? user?.wallet?.address ?? null,
      authenticated,
      login,
      logout: () => {
        void logout();
      },
      ready,
      signer: user?.wallet?.address ?? null,
      stubbed: false,
      token: getAccessToken,
    });
  }, [authenticated, getAccessToken, login, logout, onChange, ready, user]);

  return null;
};

interface QuarantineProps {
  readonly children: ReactNode;
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
 */
class Quarantine extends Component<QuarantineProps, QuarantineState> {
  constructor(props: QuarantineProps) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError(error: Error): QuarantineState {
    // Logged rather than swallowed silently: "sign-in did nothing" is a support
    // question, and this is the only place the answer exists.
    console.warn("Privy failed to initialise:", error.message);
    return { failed: true };
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
  const [identity, setIdentity] = useState<Identity>(LOCAL);
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
      if (!cancelled && loaded !== null) {
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
        <Quarantine>
          <module.PrivyProvider
            appId={privyAppId}
            config={{
              appearance: { theme: "dark" },
              embeddedWallets: {
                ethereum: { createOnLogin: "all-users" },
                showWalletUIs: false,
              },
              loginMethods: ["google", "email", "wallet"],
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
