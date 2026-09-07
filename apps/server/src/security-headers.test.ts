import { describe, expect, it } from "bun:test";

import {
  contentSecurityPolicy,
  cspModeOf,
  withSecurityHeaders,
} from "./security-headers";

describe("withSecurityHeaders", () => {
  it("names Privy's iframe origin, forbids framing, and enforces by default", () => {
    const page = withSecurityHeaders(
      new Response("<html></html>", {
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
      "enforce"
    );
    const csp = page.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("frame-src https://auth.privy.io");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("connect-src 'self' https://auth.privy.io");
    expect(page.headers.get("x-frame-options")).toBe("DENY");
    expect(page.headers.get("content-security-policy-report-only")).toBeNull();
    expect(contentSecurityPolicy()).not.toContain("unsafe-eval");
  });

  it("admits Stripe's onramp scripts and frames, which Privy loads into our page", () => {
    const csp = contentSecurityPolicy();
    const directive = (name: string): string =>
      csp.split("; ").find((entry) => entry.startsWith(`${name} `)) ?? "";
    expect(directive("script-src")).toContain("https://js.stripe.com");
    expect(directive("script-src")).toContain("https://crypto-js.stripe.com");
    expect(directive("frame-src")).toContain("https://crypto.link.com");
    expect(directive("connect-src")).toContain("https://api.stripe.com");
    // The page itself still runs only its own bundle and Stripe's.
    expect(directive("script-src")).not.toContain("'unsafe-inline'");
  });

  it("reports instead of enforcing when asked, and leaves non-HTML alone", () => {
    const page = withSecurityHeaders(
      new Response("<html></html>", {
        headers: { "content-type": "text/html" },
      }),
      "report"
    );
    expect(page.headers.get("content-security-policy")).toBeNull();
    expect(page.headers.get("content-security-policy-report-only")).toContain(
      "default-src 'self'"
    );
    const json = withSecurityHeaders(Response.json({ ok: true }), "enforce");
    expect(json.headers.get("content-security-policy")).toBeNull();
    expect(json.headers.get("x-frame-options")).toBeNull();
  });

  it("reads the mode leniently", () => {
    expect(cspModeOf("report")).toBe("report");
    expect(cspModeOf(" Report ")).toBe("report");
    expect(cspModeOf("")).toBe("enforce");
    expect(cspModeOf("anything")).toBe("enforce");
  });
});
