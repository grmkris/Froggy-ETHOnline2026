import { describe, expect, test } from "bun:test";

import { createSubstream } from "@substreams/core";
import { Schema } from "effect";

import {
  WalletStreamTransaction,
  walletStreamParameters,
  liveWalletStream,
  packagedWalletStream,
  boundedConnectBody,
  demoWalletStream,
  stubWalletStream,
} from "./wallet-stream";

const consume = async (chunks: readonly Uint8Array[]): Promise<number> => {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  }).pipeThrough(boundedConnectBody());
  const buffer = await new Response(stream).arrayBuffer();
  return buffer.byteLength;
};
describe("wallet stream transport bounds", () => {
  test("accepts envelopes split across arbitrary network chunks", async () => {
    const bytes = Uint8Array.of(
      0,
      0,
      0,
      0,
      3,
      10,
      20,
      30,
      2,
      0,
      0,
      0,
      2,
      123,
      125
    );
    expect(await consume([...bytes].map((byte) => Uint8Array.of(byte)))).toBe(
      bytes.length
    );
  });
  test("rejects an oversized frame from its header before reading a payload", async () => {
    const error = await consume([Uint8Array.of(0, 0, 128, 0, 1)]).then(
      () => null,
      String
    );
    expect(error).toContain("bounded response");
  });
  test("a truncated envelope cannot look like a completed stream", async () => {
    const errors = await Promise.all(
      [[Uint8Array.of(0, 0, 0)], [Uint8Array.of(0, 0, 0, 0, 5, 1)]].map(
        async (chunks) => await consume(chunks).then(() => null, String)
      )
    );
    for (const error of errors) {
      expect(error).toContain("partial frame");
    }
  });
  test("a stub never claims live provider availability", () => {
    expect(stubWalletStream().available).toBe(false);
    expect(stubWalletStream().stubbed).toBe(true);
  });
});

const CONTRACT = `0x${"a".repeat(40)}`;
const POOL = `0x${"b".repeat(64)}`;
const source = (key: string, contract = CONTRACT) => ({
  key,
  contract,
  poolId: null,
});

describe("wallet and price stream parameters", () => {
  test("keeps the legacy empty and normalized address-only request", () => {
    expect(walletStreamParameters({ addresses: [] })).toBe("");
    expect(
      walletStreamParameters({
        addresses: [CONTRACT, CONTRACT.toUpperCase().replace("0X", "0x")],
      })
    ).toBe(CONTRACT);
  });
  test("price watches run with no wallet and canonicalize identical subscriptions", () => {
    const params = walletStreamParameters({
      addresses: [],
      priceSources: [source("token:usd"), source("token:usd")],
    });
    expect(JSON.parse(params)).toEqual({
      addresses: [],
      priceSources: [source("token:usd")],
    });
    expect(
      walletStreamParameters({
        addresses: [],
        priceSources: [
          {
            key: "pool",
            contract: CONTRACT.toUpperCase().replace("0X", "0x"),
            poolId: POOL.toUpperCase().replace("0X", "0x"),
          },
        ],
      })
    ).toContain(POOL);
  });
  test("allows multiple feeds for a logical key but caps distinct keys and concrete sources", () => {
    const subscriptions = Array.from({ length: 100 }, (_, index) =>
      source(`price:${index % 20}`, `0x${index.toString(16).padStart(40, "0")}`)
    );
    expect(
      Schema.decodeUnknownSync(
        Schema.Struct({ priceSources: Schema.Array(Schema.Unknown) })
      )(
        JSON.parse(
          walletStreamParameters({ addresses: [], priceSources: subscriptions })
        )
      ).priceSources
    ).toHaveLength(100);
    expect(() =>
      walletStreamParameters({
        addresses: [],
        priceSources: Array.from({ length: 21 }, (_, index) =>
          source(`price:${index}`)
        ),
      })
    ).toThrow("twenty");
    expect(() =>
      walletStreamParameters({
        addresses: [],
        priceSources: [...subscriptions, source("extra")],
      })
    ).toThrow();
  });
  test("does not accept arbitrary pool ids or unbounded source keys", () => {
    expect(() =>
      walletStreamParameters({
        addresses: [],
        priceSources: [{ ...source("pool"), poolId: CONTRACT }],
      })
    ).toThrow();
    expect(() =>
      walletStreamParameters({
        addresses: [],
        priceSources: [source("x".repeat(201))],
      })
    ).toThrow();
    expect(() =>
      walletStreamParameters({
        addresses: [],
        priceSources: [source("bad\nkey")],
      })
    ).toThrow();
  });
});

test("Pons curve candidates retain actor, recipient, integer amounts and fees", () => {
  const curve = {
    location: {
      contract: CONTRACT,
      logIndex: 1,
      callIndex: 2,
      beginOrdinal: "1",
      endOrdinal: "4",
    },
    side: "buy",
    actor: CONTRACT,
    recipient: CONTRACT,
    amountIn: "9007199254740993",
    amountOut: "20",
    fee: "1",
    tax: "2",
  };
  const tx = {
    wallet: CONTRACT,
    hash: POOL,
    transactionFrom: CONTRACT,
    transfers: [],
    swapsV2: [],
    swapsV3: [],
    swapsV4: [],
    swapsAerodrome: [],
    curvesPons: [curve],
    truncated: false,
  };
  expect(
    Schema.decodeUnknownSync(WalletStreamTransaction)(tx).curvesPons?.[0]
      ?.amountIn
  ).toBe("9007199254740993");
  expect(() =>
    Schema.decodeUnknownSync(WalletStreamTransaction)({
      ...tx,
      curvesPons: [{ ...curve, side: "transfer" }],
    })
  ).toThrow();
  const { curvesPons: _curves, ...legacy } = tx;
  expect(
    Schema.decodeUnknownSync(WalletStreamTransaction)(legacy).curvesPons
  ).toBeUndefined();
});

test("packaged descriptor and identity match the rebuilt subscription artifact", async () => {
  const bytes = await Bun.file(
    new URL("../substreams/froggy-wallet-activity-v0.1.0.spkg", import.meta.url)
  ).bytes();
  const pkg = createSubstream(bytes);
  const output = pkg.protoFiles.find(
    (file) => file.package === "froggy.wallet.v1"
  );
  expect(
    output?.messageType
      .find((type) => type.name === "BlockActivity")
      ?.field.some((field) => field.name === "changed_sources")
  ).toBe(true);
  expect(
    output?.messageType
      .find((type) => type.name === "WalletTransaction")
      ?.field.some((field) => field.name === "curves_pons")
  ).toBe(true);
  const options = { endpoint: "https://unused.invalid", apiKey: "unused" };
  const identity = await packagedWalletStream(options).identity?.();
  expect(identity).toBe(
    await liveWalletStream({ ...options, packageBytes: bytes }).identity?.()
  );
  expect(identity).toContain(
    new Bun.CryptoHasher("sha256").update(bytes).digest("hex")
  );
});

test("vendored and rebuilt artifact hashes match their provenance record", async () => {
  const root = new URL("../substreams/", import.meta.url);
  const manifest = Schema.decodeUnknownSync(
    Schema.Struct({ sha256: Schema.Record(Schema.String, Schema.String) })
  )(await Bun.file(new URL("vendor/sources.json", root)).json());
  await Promise.all(
    Object.entries(manifest.sha256).map(async ([path, expected]) => {
      const bytes = await Bun.file(new URL(path, root)).bytes();
      expect(new Bun.CryptoHasher("sha256").update(bytes).digest("hex")).toBe(
        expected
      );
    })
  );
});

test("an aborted demo stream stops without producing a false heartbeat", async () => {
  const controller = new AbortController();
  controller.abort();
  const messages = await Array.fromAsync(
    demoWalletStream().blocks({
      addresses: [],
      startBlock: 10,
      signal: controller.signal,
    })
  );
  expect(messages).toEqual([]);
});
