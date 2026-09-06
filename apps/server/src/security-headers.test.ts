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
