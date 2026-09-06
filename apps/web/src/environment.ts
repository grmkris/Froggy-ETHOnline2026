/**
 * The client's half of the stub spine.
 *
 * Mirrors `apps/server/src/environment.ts`: a variable still holding its
 * placeholder counts as unset, and the feature it gates degrades rather than
 * crashing. `privyConfigured` is the important one — when it is false,
 * `@privy-io/react-auth` is never imported at all, so a missing app id costs a
 * dynamic import rather than a blank page.
 *
 * Vite inlines these at **build** time. A variable set on the Railway service
 * but not declared as an `ARG` in the Dockerfile never reaches the bundle,
 * which is a failure that looks exactly like the feature being switched off.
 */

const PLACEHOLDER_PRIVY_APP_ID = "REPLACE_ME_PRIVY_APP_ID";

const value = (raw: string | undefined, placeholder: string): string =>
  raw === undefined || raw.trim() === "" || raw.trim() === placeholder
    ? ""
    : raw;

export const privyAppId: string = value(
  import.meta.env.VITE_PRIVY_APP_ID,
  PLACEHOLDER_PRIVY_APP_ID
);

export const privyConfigured: boolean = privyAppId !== "";

/**
 * Which side of Privy's fiat onramp a build talks to. Production for the
 * built bundle, the sandbox for `vite dev`, unless the variable says
 * otherwise; a sandbox purchase moves no money and says so on Privy's screen.
 */
const onrampRaw = import.meta.env["VITE_ONRAMP_ENVIRONMENT"];
export const onrampEnvironment: "production" | "sandbox" =
  onrampRaw === "sandbox" ||
  (onrampRaw !== "production" && !import.meta.env.PROD)
    ? "sandbox"
    : "production";

/** Same-origin by construction; the dev server proxies. See `vite.config.ts`. */
export const socketUrl = (path: string): string => {
  const protocol = globalThis.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${globalThis.location.host}${path}`;
};
