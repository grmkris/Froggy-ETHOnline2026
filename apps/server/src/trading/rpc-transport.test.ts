import { expect, test } from "bun:test";

import { Redacted, Schema } from "effect";

import { boundedRpc } from "./rpc-transport";

const Call = Schema.Struct({
  id: Schema.Int,
  method: Schema.String,
  params: Schema.Array(Schema.Record(Schema.String, Schema.Json)),
});
const fixture = (respond: (call: typeof Call.Type) => Response) => {
  const calls: (typeof Call.Type)[] = [];
  const fetchImpl: typeof fetch = Object.assign(
    async (_url: RequestInfo | URL, init?: RequestInit) => {
      const call = Schema.decodeUnknownSync(Schema.fromJsonString(Call))(
        init?.body
      );
      calls.push(call);
      return await Promise.resolve(respond(call));
    },
    { preconnect: () => {} }
  );
  return {
    calls,
    rpc: boundedRpc({
      endpoint: Redacted.make("https://rpc.example.test/private-key"),
      outbound: {
        fetch: fetchImpl,
        lookup: async () => await Promise.resolve(["93.184.216.34"]),
      },
    }),
  };
};
test("oversized successful log responses split with no overlap, preserving filters and all logs", async () => {
  const f = fixture((call) => {
    const [filter] = call.params;
    const from = Number(
      BigInt(Schema.decodeUnknownSync(Schema.String)(filter?.["fromBlock"]))
    );
    const to = Number(
      BigInt(Schema.decodeUnknownSync(Schema.String)(filter?.["toBlock"]))
    );
    return Response.json({
      jsonrpc: "2.0",
      id: call.id,
      result: Array.from({ length: to - from + 1 }, (_, i) => ({
        blockNumber: from + i,
        data: "a".repeat(650),
      })),
    });
  });
  const logs = await f.rpc("eth_getLogs", [
    {
      fromBlock: "0x0",
      toBlock: "0x24f",
      address: "0x1111111111111111111111111111111111111111",
      topics: ["transfer"],
    },
  ]);
  expect(
    Schema.decodeUnknownSync(Schema.Array(Schema.Json))(logs)
  ).toHaveLength(592);
  expect(f.calls).toHaveLength(3);
  expect(f.calls[1]?.params[0]?.["toBlock"]).toBe("0x127");
  expect(f.calls[2]?.params[0]?.["fromBlock"]).toBe("0x128");
  expect(f.calls[2]?.params[0]?.["topics"]).toEqual(["transfer"]);
});
test("oversized single blocks stop without repeated requests or secret exposure", async () => {
  const f = fixture((call) =>
    Response.json({
      jsonrpc: "2.0",
      id: call.id,
      result: ["x".repeat(260_000)],
    })
  );
  const failure = await f
    .rpc("eth_getLogs", [{ fromBlock: "0x1", toBlock: "0x1" }])
    .catch(Schema.decodeUnknownSync(Schema.instanceOf(Error)));
  expect(
    Schema.decodeUnknownSync(Schema.instanceOf(Error))(failure).message
  ).toContain("eth_getLogs response_limit");
  expect(f.calls).toHaveLength(1);
});
test("HTTP, malformed JSON and provider error codes remain distinct", async () => {
  for (const [response, message] of [
    [new Response("bad", { status: 503 }), "http (503)"],
    [new Response("not json"), "invalid_json"],
    [
      Response.json({
        jsonrpc: "2.0",
        id: 1,
        error: { code: -32_000, message: "secret upstream details" },
      }),
      "provider (-32000)",
    ],
  ] as const) {
    const f = fixture(() => response);
    // oxlint-disable-next-line eslint/no-await-in-loop -- distinct bounded response cases
    const failure = await f
      .rpc("eth_sendRawTransaction", [{}])
      .catch(Schema.decodeUnknownSync(Schema.instanceOf(Error)));
    expect(
      Schema.decodeUnknownSync(Schema.instanceOf(Error))(failure).message
    ).toContain(message);
    expect(f.calls).toHaveLength(1);
  }
});
test("wrong response IDs are refused", async () => {
  const f = fixture(() =>
    Response.json({ jsonrpc: "2.0", id: 999, result: [] })
  );
  const failure = await f
    .rpc("eth_getLogs", [{}])
    .catch(Schema.decodeUnknownSync(Schema.instanceOf(Error)));
  expect(
    Schema.decodeUnknownSync(Schema.instanceOf(Error))(failure).message
  ).toContain("invalid_envelope");
});

test("rate-limited reads retry within a fixed budget", async () => {
  let count = 0;
  const f = fixture((call) => {
    count += 1;
    return count === 1
      ? new Response(null, { status: 429 })
      : Response.json({ jsonrpc: "2.0", id: call.id, result: [] });
  });
  expect(await f.rpc("eth_getLogs", [{}])).toEqual([]);
  expect(f.calls).toHaveLength(2);
});
