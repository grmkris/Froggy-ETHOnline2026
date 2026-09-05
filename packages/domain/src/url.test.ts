import { describe, expect, test } from "bun:test";

import { isPrivateAddress, publicHttpUrl } from "./url";

describe("isPrivateAddress", () => {
  test("knows the private ranges", () => {
    for (const ip of [
      "127.0.0.1",
      "10.1.2.3",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "::1",
      "::",
      "fd00::1",
      "fe80::1",
      "::ffff:127.0.0.1",
      "[::1]",
    ]) {
      expect(isPrivateAddress(ip)).toBe(true);
    }
  });

  test("lets public addresses through", () => {
    for (const ip of ["8.8.8.8", "172.32.0.1", "100.128.0.1", "2606:4700::1"]) {
      expect(isPrivateAddress(ip)).toBe(false);
    }
  });
});

describe("publicHttpUrl", () => {
  test("accepts an ordinary https URL", () => {
    const check = publicHttpUrl("https://example.com/path?x=1");
    expect(check.ok).toBe(true);
  });

  test("refuses every scheme but http and https", () => {
    for (const bad of [
      "file:///etc/passwd",
      "chrome://settings",
      ["java", "script:alert(1)"].join(""),
      "data:text/html,hi",
      "ftp://example.com",
    ]) {
      expect(publicHttpUrl(bad).ok).toBe(false);
    }
  });

  test("refuses the private network by name and by literal", () => {
    for (const bad of [
      "http://localhost:3001/api/wallet",
      "http://app.localhost/",
      "http://postgres.railway.internal:5432/",
      "http://169.254.169.254/latest/meta-data/",
      "http://[::1]:3001/",
      "http://10.0.0.5/",
    ]) {
      const check = publicHttpUrl(bad);
      expect(check.ok).toBe(false);
    }
  });

  test("refuses embedded credentials and non-URLs", () => {
    expect(publicHttpUrl("https://user:pw@example.com/").ok).toBe(false);
    expect(publicHttpUrl("not a url").ok).toBe(false);
  });

  test("lets the private network through only when asked, for local development", () => {
    expect(
      publicHttpUrl("http://localhost:3000/oracle/snapshot", {
        allowPrivate: true,
      }).ok
    ).toBe(true);
  });
});
