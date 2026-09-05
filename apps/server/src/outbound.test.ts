import { describe, expect, test } from "bun:test";

import { OutboundRefusedError, readCapped, safeFetch } from "./outbound";

const publicLookup = async (): Promise<readonly string[]> => {
  await Promise.resolve();
  return ["93.184.216.34"];
};

/** A fake network: a map from URL to what it answers. */
const network = (answers: Record<string, () => Response>): typeof fetch => {
  const fake = async (input: string | URL | Request): Promise<Response> => {
    await Promise.resolve();
    const key = String(input instanceof Request ? input.url : input);
    const answer = answers[key];
    if (answer === undefined) {
      throw new Error(`unexpected request to ${key}`);
    }
    return answer();
  };
  // SAFETY: a test double for `fetch` with the one overload these tests use.
  return fake as typeof fetch;
};

const refused = async (work: Promise<unknown>): Promise<string> => {
  try {
    await work;
    return "resolved";
  } catch (error) {
    return error instanceof OutboundRefusedError ? error.message : "other";
  }
};

describe("safeFetch", () => {
  test("refuses a private literal before touching the network", async () => {
    let requests = 0;
    const message = await refused(
      safeFetch(
        "http://169.254.169.254/latest/meta-data/",
        {},
        {
          fetch: network({}),
          lookup: async () => {
            requests += 1;
            await Promise.resolve();
            return ["169.254.169.254"];
          },
        }
      )
    );
    expect(message).toContain("private network");
    expect(requests).toBe(0);
  });

  test("refuses a public name that resolves to the private network", async () => {
    const message = await refused(
      safeFetch(
        "https://evil.example/",
        {},
        {
          fetch: network({}),
          lookup: async () => {
            await Promise.resolve();
            return ["10.0.0.7"];
          },
        }
      )
    );
    expect(message).toContain("10.0.0.7");
  });

  test("follows a redirect and re-checks its target", async () => {
    const message = await refused(
      safeFetch(
        "https://example.com/start",
        {},
        {
          fetch: network({
            "https://example.com/start": () =>
              new Response(null, {
                headers: { location: "http://localhost:3001/api/wallet" },
                status: 302,
              }),
          }),
          lookup: publicLookup,
        }
      )
    );
    expect(message).toContain("localhost");
  });

  test("returns the final response of a public redirect chain", async () => {
    const response = await safeFetch(
      "https://example.com/a",
      {},
      {
        fetch: network({
          "https://example.com/a": () =>
            new Response(null, {
              headers: { location: "/b" },
              status: 301,
            }),
          "https://example.com/b": () => new Response("done", { status: 200 }),
        }),
        lookup: publicLookup,
      }
    );
    expect(await response.text()).toBe("done");
  });

  test("gives up after too many redirects", async () => {
    const message = await refused(
      safeFetch(
        "https://example.com/loop",
        {},
        {
          fetch: network({
            "https://example.com/loop": () =>
              new Response(null, {
                headers: { location: "/loop" },
                status: 302,
              }),
          }),
          lookup: publicLookup,
          maxRedirects: 2,
        }
      )
    );
    expect(message).toContain("redirects");
  });

  test("lets the private network through only for local development", async () => {
    const response = await safeFetch(
      "http://localhost:3000/oracle/snapshot",
      {},
      {
        allowPrivate: true,
        fetch: network({
          "http://localhost:3000/oracle/snapshot": () =>
            new Response("402", { status: 402 }),
        }),
      }
    );
    expect(response.status).toBe(402);
  });
});

describe("readCapped", () => {
  test("cuts a large body and says so", async () => {
    const text = await readCapped(new Response("x".repeat(50)), 10);
    expect(text.startsWith("xxxxxxxxxx")).toBe(true);
    expect(text).toContain("truncated");
  });
});
