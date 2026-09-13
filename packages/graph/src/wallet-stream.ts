import { createConnectTransport } from "@connectrpc/connect-web";
import {
  createRegistry,
  createRequest,
  createSubstream,
  streamBlocks,
  unpackMapOutput,
} from "@substreams/core";
import { Effect, Schedule, Schema, Stream } from "effect";

const address = Schema.String.check(Schema.isPattern(/^0x[0-9a-f]{40}$/u));
const hash = Schema.String.check(Schema.isPattern(/^0x[0-9a-f]{64}$/u));
const unsigned = Schema.String.check(Schema.isPattern(/^[0-9]{1,78}$/u));
const signed = Schema.String.check(Schema.isPattern(/^-?[0-9]{1,78}$/u));
const integer = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
const bounded = <S extends Schema.Top>(schema: S) =>
  Schema.Array(schema).check(Schema.isMaxLength(200));
const location = Schema.Struct({
  contract: address,
  logIndex: integer,
  callIndex: integer,
  beginOrdinal: unsigned,
  endOrdinal: unsigned,
});
const swapAmounts = {
  location,
  sender: address,
  recipient: address,
  amount0In: unsigned,
  amount1In: unsigned,
  amount0Out: unsigned,
  amount1Out: unsigned,
};
const swapPrice = {
  location,
  sender: address,
  amount0: signed,
  amount1: signed,
  sqrtPriceX96: unsigned,
  liquidity: unsigned,
  tick: signed,
};
export const WalletStreamTransaction = Schema.Struct({
  wallet: address,
  hash,
  transactionFrom: address,
  transfers: bounded(
    Schema.Struct({
      asset: Schema.Union([Schema.Literal("native"), address]),
      from: address,
      to: address,
      amount: unsigned,
      ordinal: unsigned,
      callIndex: integer,
      callKnown: Schema.Boolean,
      logIndex: integer,
    })
  ),
  swapsV2: bounded(Schema.Struct(swapAmounts)),
  swapsAerodrome: bounded(Schema.Struct(swapAmounts)),
  swapsV3: bounded(Schema.Struct({ ...swapPrice, recipient: address })),
  swapsV4: bounded(
    Schema.Struct({ ...swapPrice, poolId: hash, fee: unsigned })
  ),
  curvesPons: Schema.optional(
    bounded(
      Schema.Struct({
        location,
        side: Schema.Literals(["buy", "sell"]),
        actor: address,
        recipient: address,
        amountIn: unsigned,
        amountOut: unsigned,
        fee: unsigned,
        tax: unsigned,
      })
    )
  ),
  truncated: Schema.Boolean,
});
export type WalletStreamTransaction = typeof WalletStreamTransaction.Type;
const sourceKey = Schema.String.check(
  Schema.isPattern(/^[A-Za-z0-9:_./-]{1,200}$/u)
);
const BlockOutput = Schema.Struct({
  v: Schema.Literal(1),
  number: unsigned,
  hash,
  timestamp: unsigned,
  extended: Schema.Boolean,
  truncated: Schema.Boolean,
  transactions: bounded(WalletStreamTransaction),
  changedSources: Schema.optional(
    Schema.Array(sourceKey).check(Schema.isMaxLength(20))
  ),
});
export interface WalletStreamBlock {
  readonly kind: "block";
  readonly cursor: string;
  readonly number: number;
  readonly hash: string;
  readonly timestamp: number;
  readonly finalizedBlock: number;
  readonly extended: boolean;
  readonly truncated: boolean;
  readonly transactions: readonly WalletStreamTransaction[];
  readonly changedSources?: readonly string[];
  readonly stubbed: boolean;
}
export type WalletStreamMessage =
  | WalletStreamBlock
  | {
      readonly kind: "undo";
      readonly lastValidBlock: number;
      readonly lastValidHash: string;
      readonly cursor: string;
    };
export interface WalletStreamPriceSource {
  readonly key: string;
  readonly contract: string;
  readonly poolId: string | null;
}
export interface WalletStreamRequest {
  readonly addresses: readonly string[];
  readonly priceSources?: readonly WalletStreamPriceSource[];
  readonly startBlock: number;
  readonly cursor?: string;
  readonly signal: AbortSignal;
}
export interface WalletStream {
  readonly stubbed: boolean;
  readonly available: boolean;
  readonly identity?: () => Promise<string>;
  readonly blocks: (
    request: WalletStreamRequest
  ) => AsyncIterable<WalletStreamMessage>;
}
const PriceSources = Schema.Array(
  Schema.Struct({
    key: sourceKey,
    contract: address,
    poolId: Schema.NullOr(hash),
  })
).check(Schema.isMaxLength(100));

export const walletStreamParameters = (
  request: Pick<WalletStreamRequest, "addresses" | "priceSources">
): string => {
  const addresses = [
    ...new Set(request.addresses.map((value) => value.toLowerCase())),
  ].toSorted();
  Schema.decodeUnknownSync(Schema.Array(address).check(Schema.isMaxLength(20)))(
    addresses
  );
  const sources = Schema.decodeUnknownSync(PriceSources)(
    (request.priceSources ?? []).map((source) => ({
      ...source,
      contract: source.contract.toLowerCase(),
      poolId: source.poolId?.toLowerCase() ?? null,
    }))
  );
  if (new Set(sources.map((source) => source.key)).size > 20) {
    throw new Error("Expected at most twenty price source keys.");
  }
  const unique = new Map(
    sources.map((source) => [JSON.stringify(source), source])
  );
  const priceSources = [...unique.entries()]
    .toSorted(([left], [right]) => left.localeCompare(right))
    .map(([, source]) => source);
  // Legacy address-only requests retain the original module parameter identity.
  return priceSources.length === 0
    ? addresses.join(",")
    : JSON.stringify({ addresses, priceSources });
};
const safeNumber = (value: bigint | string): number => {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error("Invalid Substreams block number.");
  }
  return parsed;
};
const validCursor = (cursor: string): string => {
  if (!cursor || cursor.length > 4096) {
    throw new Error("Invalid Substreams cursor.");
  }
  return cursor;
};

/** Bound each Connect envelope before the SDK allocates its protobuf message. */
export const boundedConnectBody = (): TransformStream<
  Uint8Array,
  Uint8Array
> => {
  const header = new Uint8Array(5);
  let position = 0;
  let remaining = 0;
  return new TransformStream({
    transform(chunk, controller) {
      let offset = 0;
      while (offset < chunk.length) {
        if (remaining > 0) {
          const length = Math.min(remaining, chunk.length - offset);
          remaining -= length;
          offset += length;
        } else {
          header[position] = chunk.at(offset) ?? 0;
          position += 1;
          offset += 1;
          if (position === 5) {
            remaining = new DataView(header.buffer).getUint32(1);
            if (remaining > 8 * 1024 * 1024) {
              throw new Error(
                "Substreams frame exceeds the bounded response size."
              );
            }
            position = 0;
          }
        }
      }
      controller.enqueue(chunk);
    },
    flush() {
      if (remaining !== 0 || position !== 0) {
        throw new Error("Substreams ended with a partial frame.");
      }
    },
  });
};
export const liveWalletStream = (options: {
  readonly endpoint: string;
  readonly apiKey: string;
  readonly packageBytes: Uint8Array;
}): WalletStream => ({
  available: true,
  stubbed: false,
  identity: async () =>
    await Promise.resolve(
      `wallet-activity:v2:map_wallet_activity:${new Bun.CryptoHasher("sha256").update(options.packageBytes).digest("hex")}`
    ),
  async *blocks(request) {
    const params = walletStreamParameters(request);
    const pkg = createSubstream(options.packageBytes);
    const module = pkg.modules?.modules.find(
      (value) => value.name === "map_wallet_activity"
    );
    const parameter = module?.inputs.find(
      (input) => input.input.case === "params"
    );
    if (parameter?.input.case !== "params") {
      throw new Error(
        "Wallet activity package is missing its address parameter."
      );
    }
    if (
      (request.priceSources?.length ?? 0) > 0 &&
      !pkg.protoFiles.some(
        (file) =>
          file.package === "froggy.wallet.v1" &&
          file.messageType.some(
            (type) =>
              type.name === "BlockActivity" &&
              type.field.some((field) => field.name === "changed_sources")
          )
      )
    ) {
      throw new Error(
        "Wallet activity package must be rebuilt for price subscriptions."
      );
    }
    parameter.input.value.value = params;
    const registry = createRegistry(pkg);
    const transport = createConnectTransport({
      baseUrl: options.endpoint,
      useBinaryFormat: true,
      interceptors: [
        (next) => async (call) => {
          call.header.set("x-api-key", options.apiKey);
          return await next(call);
        },
      ],
      fetch: Object.assign(
        async (
          input: Parameters<typeof fetch>[0],
          init: Parameters<typeof fetch>[1]
        ) => {
          const response = await fetch(input, { ...init, redirect: "error" });
          return new Response(
            response.body?.pipeThrough(boundedConnectBody()) ?? null,
            {
              status: response.status,
              statusText: response.statusText,
              headers: response.headers,
            }
          );
        },
        { preconnect: fetch.preconnect }
      ),
    });
    const wire = createRequest({
      substreamPackage: pkg,
      outputModule: "map_wallet_activity",
      startBlockNum: request.startBlock,
      startCursor: request.cursor,
      productionMode: true,
      finalBlocksOnly: false,
    });
    for await (const response of streamBlocks(transport, wire, {
      signal: request.signal,
    })) {
      const { message } = response;
      if (message.case === "fatalError") {
        throw new Error(
          "Wallet activity module failed at the stream provider."
        );
      }
      if (message.case === "blockUndoSignal") {
        if (!message.value.lastValidBlock) {
          throw new Error("Substreams undo is missing its valid block.");
        }
        yield {
          kind: "undo",
          lastValidBlock: safeNumber(message.value.lastValidBlock.number),
          lastValidHash: message.value.lastValidBlock.id,
          cursor: validCursor(message.value.lastValidCursor),
        };
      }
      if (message.case !== "blockScopedData") {
        continue;
      }
      const data = Schema.decodeUnknownSync(BlockOutput)(
        unpackMapOutput(response, registry)?.toJson({ emitDefaultValues: true })
      );
      if (
        data.number !== String(message.value.clock?.number) ||
        data.hash.slice(2) !== message.value.clock?.id.replace(/^0x/u, "")
      ) {
        throw new Error(
          "Wallet activity does not match its sealed block clock."
        );
      }
      yield {
        kind: "block",
        cursor: validCursor(message.value.cursor),
        number: safeNumber(data.number),
        hash: data.hash,
        timestamp: safeNumber(data.timestamp) * 1000,
        finalizedBlock: safeNumber(message.value.finalBlockHeight),
        extended: data.extended,
        truncated: data.truncated,
        transactions: data.transactions,
        changedSources: data.changedSources ?? [],
        stubbed: false,
      };
    }
  },
});
export const stubWalletStream = (
  messages: readonly WalletStreamMessage[] = []
): WalletStream => ({
  available: false,
  stubbed: true,
  identity: async () => await Promise.resolve("stub:wallet-activity:v2"),
  async *blocks(request) {
    for (const message of messages) {
      if (request.signal.aborted) {
        return;
      }
      yield message.kind === "block" ? { ...message, stubbed: true } : message;
    }
  },
});

export const packagedWalletStream = (options: {
  readonly endpoint: string;
  readonly apiKey: string;
}): WalletStream => {
  let bytes: Promise<Uint8Array> | undefined;
  const packageBytes = async (): Promise<Uint8Array> => {
    bytes ??= Bun.file(
      new URL(
        "../substreams/froggy-wallet-activity-v0.1.0.spkg",
        import.meta.url
      )
    ).bytes();
    return await bytes;
  };
  return {
    available: true,
    stubbed: false,
    identity: async () =>
      `wallet-activity:v2:map_wallet_activity:${new Bun.CryptoHasher("sha256").update(await packageBytes()).digest("hex")}`,
    async *blocks(request) {
      yield* liveWalletStream({
        ...options,
        packageBytes: await packageBytes(),
      }).blocks(request);
    },
  };
};
export const demoWalletStream = (): WalletStream => ({
  available: true,
  stubbed: true,
  identity: async () => await Promise.resolve("stub:wallet-activity:v2"),
  async *blocks(request) {
    const start =
      request.startBlock < 0
        ? Math.floor(Date.now() / 1000)
        : request.startBlock;
    const interrupted = Effect.callback<null>((resume) => {
      const stop = (): void => {
        resume(Effect.succeed(null));
      };
      request.signal.addEventListener("abort", stop, { once: true });
      if (request.signal.aborted) {
        stop();
      }
      return Effect.sync(() => {
        request.signal.removeEventListener("abort", stop);
      });
    });
    const ticks = Stream.interruptWhen(
      Stream.fromSchedule(Schedule.spaced("1 second")),
      interrupted
    );
    for await (const tick of Stream.toAsyncIterable(ticks)) {
      const number = start + tick;
      yield {
        kind: "block",
        cursor: `stub:${number}`,
        number,
        hash: `0x${number.toString(16).padStart(64, "0")}`,
        timestamp: Date.now(),
        finalizedBlock: Math.max(0, number - 10),
        extended: true,
        truncated: false,
        transactions: [],
        changedSources: [],
        stubbed: true,
      };
    }
  },
});
