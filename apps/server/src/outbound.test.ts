import { describe, expect, test } from "bun:test";

import { OutboundRefusedError, readCapped, safeFetch } from "./outbound";

const publicLookup = async (): Promise<readonly string[]> => {
  await Promise.resolve();
  return ["93.184.216.34"];
};

/** A fake network: a map from URL to what it answers. */
const network = (
  answers: Record<string, (init?: RequestInit) => Response>
): typeof fetch => {
  const fake = async (
    input: string | URL | Request,
    init?: RequestInit
  ): Promise<Response> => {
    await Promise.resolve();
    const key = String(input instanceof Request ? input.url : input);
    const answer = answers[key];
    if (answer === undefined) {
      throw new Error(`unexpected request to ${key}`);
    }
    return answer(init);
  };
  // SAFETY: a test double for `fetch` with the one overload these tests use.
  return fake as typeof fetch;
};

const failureOf = async (work: Promise<unknown>): Promise<Error | null> => {
  try {
    await work;
    return null;
  } catch (error) {
    return error instanceof Error ? error : null;
  }
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

  test.each([
    "https://other.example/report",
    "http://example.com/report",
    "https://example.com:444/report",
  ])(
    "never sends credentials or payment across an origin change to %s",
    async (target) => {
      const requests: string[] = [];
      const headers = {
        authorization: "Bearer test-only",
        cookie: "session=test-only",
        "payment-signature": "test-payment",
        "x-payment": "test-payment",
      };
      const message = await refused(
        safeFetch(
          "https://example.com/start",
          { headers },
          {
            fetch: network({
              "https://example.com/start": () => {
                requests.push("original");
                return new Response(null, {
                  headers: { location: target },
                  status: 307,
                });
              },
              [target]: () => {
                requests.push("redirect");
                return new Response("leaked");
              },
            }),
            lookup: publicLookup,
          }
        )
      );
      expect(message).toContain("across origins");
      expect(requests).toEqual(["original"]);
    }
  );

  test("also refuses cross-origin redirects while discovering an unpaid offer", async () => {
    const message = await refused(
      safeFetch(
        "https://example.com/start",
        {},
        {
          fetch: network({
            "https://example.com/start": () =>
              new Response(null, {
                headers: { location: "https://other.example/offer" },
                status: 302,
              }),
          }),
          lookup: publicLookup,
        }
      )
    );
    expect(message).toContain("across origins");
  });

  test("cancels redirect bodies and retains payment headers on the same origin", async () => {
    let cancelled = false;
    let initialSignal: AbortSignal | null | undefined;
    const response = await safeFetch(
      "https://example.com/start",
      { headers: { "payment-signature": "test-payment" } },
      {
        fetch: network({
          "https://example.com/start": (init) => {
            initialSignal = init?.signal;
            return new Response(
              new ReadableStream<Uint8Array>({
                cancel() {
                  cancelled = true;
                },
              }),
              { headers: { location: "/report" }, status: 307 }
            );
          },
          "https://example.com/report": (init) => {
            expect(cancelled).toBe(true);
            expect(new Headers(init?.headers).get("payment-signature")).toBe(
              "test-payment"
            );
            expect(init?.signal).toBe(initialSignal);
            return new Response("report");
          },
        }),
        lookup: publicLookup,
      }
    );
    expect(await response.text()).toBe("report");
  });

  test("an aborted caller cannot send another redirect request", async () => {
    const stop = new AbortController();
    const request = safeFetch(
      "https://example.com/start",
      { signal: stop.signal },
      {
        fetch: network({
          "https://example.com/start": () => {
            stop.abort(new Error("purchase stopped"));
            return new Response(null, {
              headers: { location: "/report" },
              status: 307,
            });
          },
        }),
        lookup: publicLookup,
      }
    );
    const error = await failureOf(request);
    expect(error?.message).toBe("purchase stopped");
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
  test("stops and cancels an unbounded stream once the byte limit is reached", async () => {
    let reads = 0;
    let cancelled = false;
    const response = new Response(
      new ReadableStream<Uint8Array>({
        pull(controller) {
          reads += 1;
          controller.enqueue(new TextEncoder().encode("xxxxxx"));
        },
        cancel() {
          cancelled = true;
        },
      })
    );
    const text = await readCapped(response, 10);
    expect(text).toBe("xxxxxxxxxx\n… (body truncated at 10 bytes)");
    expect(cancelled).toBe(true);
    expect(reads).toBeLessThanOrEqual(3);
  });

  test("counts UTF-8 bytes and preserves characters split between chunks", async () => {
    const bytes = new TextEncoder().encode("€🙂z");
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes.subarray(0, 2));
          controller.enqueue(bytes.subarray(2, 5));
          controller.enqueue(bytes.subarray(5));
          controller.close();
        },
      })
    );
    expect(await readCapped(response, 7)).toBe(
      "€🙂\n… (body truncated at 7 bytes)"
    );
    expect(await readCapped(new Response("€🙂z"), 5)).toBe(
      "€\n… (body truncated at 5 bytes)"
    );
    expect(await readCapped(new Response("€"), 3)).toBe("€");
  });

  test("preserves response stream failures for the payment coordinator", async () => {
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.error(new Error("connection lost after payment"));
        },
      })
    );
    const error = await failureOf(readCapped(response));
    expect(error?.message).toBe("connection lost after payment");
  });

  test("rejects invalid byte limits", async () => {
    const error = await failureOf(readCapped(new Response("body"), -1));
    expect(error).toBeInstanceOf(RangeError);
  });

  test("cuts a large body and says so", async () => {
    const text = await readCapped(new Response("x".repeat(50)), 10);
    expect(text.startsWith("xxxxxxxxxx")).toBe(true);
    expect(text).toContain("truncated");
  });
});
