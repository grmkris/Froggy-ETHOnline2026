import { expect, test } from "bun:test";

import { CardCheckoutId, PaymentMethodId } from "@froggy/domain";
import type { CardBridgeObservation, TradeInput } from "@froggy/domain";
import { Redacted, Schema } from "effect";
import {
  encodeAbiParameters,
  keccak256,
  pad,
  parseAbiParameters,
  toEventSelector,
  toHex,
} from "viem";

import { CARD_BRIDGE } from "./card-bridge";
import { ACROSS_ABI } from "./card-bridge-abi";
import { liveCardLinea } from "./card-bridge-observation";
import { tradeEvmClient } from "./evm-chain";

const wallet = "0x1111111111111111111111111111111111111111";
const recipient = "0x2222222222222222222222222222222222222222";
const relayer = "0x3333333333333333333333333333333333333333";
const hash = `0x${"a".repeat(64)}`;
const blockHash = `0x${"b".repeat(64)}`;
const input: TradeInput = {
  network: "eip155:8453",
  venue: "uniswap",
  action: "bridge",
  wallet,
  tokenIn: CARD_BRIDGE.inputToken,
  tokenOut: CARD_BRIDGE.outputToken,
  amount: "10000000",
  position: null,
  slippageBps: 50,
  maxNativeFee: "1",
  bridge: {
    destinationNetwork: "eip155:59144",
    recipient,
    provenance: "user",
    paymentMethodId: PaymentMethodId.generate(),
    paymentMethodRevision: 1,
    checkoutId: CardCheckoutId.generate(),
  },
};
const previous: CardBridgeObservation = {
  destinationStartBlock: "1",
  cursor: "1",
  depositId: null,
  sourceTransaction: hash,
  sourceBlockHash: null,
  fillTransaction: null,
  fillBlock: null,
  fillBlockHash: null,
  sourceConfirmed: false,
  destinationConfirmed: false,
  fillDeadline: 2_000_000,
};
const log = (
  address: string,
  topics: readonly string[],
  data: string,
  index: number
) => ({
  address,
  topics,
  data,
  logIndex: toHex(index),
  transactionHash: hash,
  transactionIndex: "0x0",
  blockNumber: "0xa",
  blockHash,
  removed: false,
});
const transfer = (
  token: string,
  from: `0x${string}`,
  to: `0x${string}`,
  amount: bigint
) =>
  log(
    token,
    [toEventSelector("Transfer(address,address,uint256)"), pad(from), pad(to)],
    encodeAbiParameters(parseAbiParameters("uint256"), [amount]),
    1
  );
const deposit = log(
  CARD_BRIDGE.sourcePool,
  [
    toEventSelector(ACROSS_ABI[1]),
    toHex(59_144n, { size: 32 }),
    toHex(7n, { size: 32 }),
    pad(wallet),
  ],
  encodeAbiParameters(
    parseAbiParameters(
      "bytes32, bytes32, uint256, uint256, uint32, uint32, uint32, bytes32, bytes32, bytes"
    ),
    [
      pad(CARD_BRIDGE.inputToken),
      pad(CARD_BRIDGE.outputToken),
      10_000_000n,
      9_900_000n,
      1000,
      2000,
      0,
      pad(recipient),
      pad("0x00"),
      "0x",
    ]
  ),
  2
);
const fill = (id = 7n, destination: `0x${string}` = recipient) =>
  log(
    CARD_BRIDGE.destinationPool,
    [
      toEventSelector(ACROSS_ABI[0]),
      toHex(8453n, { size: 32 }),
      toHex(id, { size: 32 }),
      pad(relayer),
    ],
    encodeAbiParameters(
      parseAbiParameters(
        "bytes32, bytes32, uint256, uint256, uint256, uint32, uint32, bytes32, bytes32, bytes32, bytes32, (bytes32,bytes32,uint256,uint8)"
      ),
      [
        pad(CARD_BRIDGE.inputToken),
        pad(CARD_BRIDGE.outputToken),
        10_000_000n,
        9_900_000n,
        8453n,
        2000,
        0,
        pad("0x00"),
        pad(wallet),
        pad(destination),
        keccak256("0x"),
        [pad(destination), keccak256("0x"), 9_900_000n, 0],
      ]
    ),
    2
  );
const rpc = (respond: (method: string) => Schema.Json) =>
  tradeEvmClient({
    endpoint: Redacted.make("https://rpc.example.test"),
    outbound: {
      lookup: async () => await Promise.resolve(["93.184.216.34"]),
      fetch: Object.assign(
        async (_url: URL | RequestInfo, init?: RequestInit) => {
          const request = Schema.decodeUnknownSync(
            Schema.Struct({ id: Schema.Int, method: Schema.String })
          )(JSON.parse(Schema.decodeUnknownSync(Schema.String)(init?.body)));
          return await Promise.resolve(
            Response.json({
              jsonrpc: "2.0",
              id: request.id,
              result: respond(request.method),
            })
          );
        },
        { preconnect: () => {} }
      ),
    },
  });
const receipt = (logs: readonly ReturnType<typeof log>[]) => ({
  transactionHash: hash,
  from: wallet,
  to: CARD_BRIDGE.sourcePool,
  blockHash,
  blockNumber: "0xa",
  cumulativeGasUsed: "0x5208",
  gasUsed: "0x5208",
  effectiveGasPrice: "0x2",
  logs,
  status: "0x1",
  transactionIndex: "0x0",
  type: "0x2",
  contractAddress: null,
});
const fixture = () => {
  const state = {
    sourceHead: 10,
    destinationHead: 11,
    logs: [fill()],
    transfers: [
      transfer(CARD_BRIDGE.outputToken, relayer, recipient, 9_900_000n),
    ],
    reorg: false,
    outage: false,
    sourceWrong: false,
  };
  const source = rpc((method) => {
    if (method === "eth_chainId") {
      return toHex(8453);
    }
    if (method === "eth_blockNumber") {
      return toHex(state.sourceHead);
    }
    if (method === "eth_getBlockByNumber") {
      return { hash: blockHash, number: "0xa", transactions: [] };
    }
    if (method === "eth_getTransactionReceipt") {
      return receipt(
        state.sourceWrong
          ? []
          : [
              transfer(
                CARD_BRIDGE.inputToken,
                wallet,
                CARD_BRIDGE.sourcePool,
                10_000_000n
              ),
              deposit,
            ]
      );
    }
    throw new Error("Unexpected source RPC");
  });
  const destination = rpc((method) => {
    if (state.outage) {
      throw new Error("RPC offline");
    }
    if (method === "eth_chainId") {
      return toHex(59_144);
    }
    if (method === "eth_blockNumber") {
      return toHex(state.destinationHead);
    }
    if (method === "eth_getBlockByNumber") {
      return {
        hash: state.reorg ? `0x${"c".repeat(64)}` : blockHash,
        number: "0xa",
        transactions: [],
      };
    }
    if (method === "eth_getLogs") {
      return state.logs;
    }
    if (method === "eth_getTransactionReceipt") {
      return receipt([...state.transfers, ...state.logs]);
    }
    throw new Error("Unexpected destination RPC");
  });
  return {
    state,
    reader: liveCardLinea(source, destination, 3, 2, () => 1_500_000),
  };
};
test("destination fill may precede source confirmation and each remains separate", async () => {
  const f = fixture();
  const first = await f.reader.observe(input, "9900000", previous);
  expect(first.sourceConfirmed).toBe(false);
  expect(first.destinationConfirmed).toBe(true);
  expect(first.depositId).toBe("7");
  expect(first.cursor).toBe("11");
  f.state.sourceHead = 12;
  const second = await f.reader.observe(input, "9900000", first);
  expect(second.sourceConfirmed).toBe(true);
  expect(second.destinationConfirmed).toBe(true);
});
test("unrelated transfers, deposit ids and recipients never complete funding", async () => {
  const f = fixture();
  f.state.logs = [];
  const observation0 = await f.reader.observe(input, "9900000", previous);
  expect(observation0.destinationConfirmed).toBe(false);
  f.state.logs = [fill(8n)];
  const observation1 = await f.reader.observe(input, "9900000", previous);
  expect(observation1.destinationConfirmed).toBe(false);
  f.state.logs = [fill(7n, wallet)];
  const observation2 = await f.reader.observe(input, "9900000", previous);
  expect(observation2.destinationConfirmed).toBe(false);
  f.state.logs = [fill()];
  f.state.transfers = [];
  const observation3 = await f.reader.observe(input, "9900000", previous);
  expect(observation3.destinationConfirmed).toBe(false);
});
test("RPC outage cannot advance cursors; destination reorg clears the old fill", async () => {
  const f = fixture();
  const first = await f.reader.observe(input, "9900000", previous);
  f.state.outage = true;
  expect(f.reader.observe(input, "9900000", first)).rejects.toThrow();
  f.state.outage = false;
  f.state.reorg = true;
  f.state.logs = [];
  const changed = await f.reader.observe(input, "9900000", first);
  expect(changed.destinationConfirmed).toBe(false);
  expect(changed.fillTransaction).toBeNull();
  f.state.sourceWrong = true;
  expect(f.reader.observe(input, "9900000", previous)).rejects.toThrow(
    "deposit"
  );
});
