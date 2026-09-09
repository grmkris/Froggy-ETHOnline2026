/**
 * The headers that keep the page honest in a browser.
 *
 * Privy's embedded wallet runs in an iframe from `auth.privy.io`, so the
 * Content Security Policy must name that origin and nothing else may frame
 * us. The directives follow Privy's implementation guide, tightened to what
 * this app actually loads: its own bundle, inline styles for motion, data and
 * blob images for the screencast, its own WebSockets. `CSP_MODE=report` turns
 * the policy into a report-only header without a redeploy of code, for the
 * day a directive proves too strict; the framing headers stay enforced.
 *
 * The card onramp is the one thing Privy loads into *our* document rather
 * than its iframe: `@stripe/stripe-js` and `@stripe/crypto` fetch
 * `js.stripe.com/v3` and `crypto-js.stripe.com/crypto-onramp-outer.js`, and
 * the checkout renders in frames from `crypto.link.com` and `*.js.stripe.com`
 * (Stripe's own CSP guide for the embedded crypto onramp). Without those
 * origins the onramp fails with "Something went wrong setting up checkout",
 * which is how the first real top-up on 7 Sep ended. MoonPay is the fallback
 * quote provider Privy calls directly.
 */

const DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self' https://challenges.cloudflare.com https://js.stripe.com https://*.js.stripe.com https://crypto-js.stripe.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.stripe.com",
  "font-src 'self' data:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "child-src https://auth.privy.io https://verify.walletconnect.com https://verify.walletconnect.org https://js.stripe.com https://*.js.stripe.com https://hooks.stripe.com https://crypto.link.com",
  "frame-src https://auth.privy.io https://live.browser-use.com https://verify.walletconnect.com https://verify.walletconnect.org https://challenges.cloudflare.com https://js.stripe.com https://*.js.stripe.com https://hooks.stripe.com https://crypto.link.com",
  "connect-src 'self' https://auth.privy.io wss://relay.walletconnect.com wss://relay.walletconnect.org wss://www.walletlink.org https://*.rpc.privy.systems https://explorer-api.walletconnect.com https://api.stripe.com https://crypto.link.com https://api.moonpay.com",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
];

export type CspMode = "enforce" | "report";

/** The policy, one line, as the header carries it. */
export const contentSecurityPolicy = (): string => DIRECTIVES.join("; ");

/** Everything a page response gets, keyed the way `Headers.set` wants it. */
const securityHeaders = (mode: CspMode) => ({
  [mode === "report"
    ? "content-security-policy-report-only"
    : "content-security-policy"]: contentSecurityPolicy(),
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
});

/** Adds the headers to an HTML page response and leaves every other response alone. */
export const withSecurityHeaders = (
  response: Response,
  mode: CspMode
): Response => {
  const type = response.headers.get("content-type") ?? "";
  if (!type.startsWith("text/html")) {
    return response;
  }
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(securityHeaders(mode))) {
    headers.set(name, value);
  }
  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
};

/** `report` only when asked in those letters; anything else enforces. */
export const cspModeOf = (raw: string | undefined): CspMode =>
  raw?.trim().toLowerCase() === "report" ? "report" : "enforce";
