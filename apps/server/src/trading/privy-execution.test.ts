import { expect, test } from "bun:test";

import type { TradeInput } from "@froggy/domain";
import {
  encodeAbiParameters,
  encodeEventTopics,
  getAddress,
  parseAbi,
  parseAbiParameters,
} from "viem";
import type { TransactionReceipt } from "viem";
import { entryPoint07Address } from "viem/account-abstraction";

import { managedSwapSettlement } from "./privy-execution";
import { uniswapDeployment } from "./uniswap-transactions";

const wallet = "0x1111111111111111111111111111111111111111";
const token = "0x2222222222222222222222222222222222222222";
const paymaster = "0x3333333333333333333333333333333333333333";
const weth = "0x4200000000000000000000000000000000000006";
const hash = `0x${"aa".repeat(32)}` as const;
const opHash = `0x${"bb".repeat(32)}` as const;
const otherHash = `0x${"cc".repeat(32)}` as const;
const abi = parseAbi([
  "event BeforeExecution()",
  "event UserOperationEvent(bytes32 indexed userOpHash,address indexed sender,address indexed paymaster,uint256 nonce,bool success,uint256 actualGasCost,uint256 actualGasUsed)",
  "event Transfer(address indexed from,address indexed to,uint256 value)",
  "event Withdrawal(address indexed src,uint256 wad)",
]);
const input: TradeInput = {
  network: "eip155:8453",
  venue: "uniswap",
  action: "swap",
  wallet,
  tokenIn: token,
  tokenOut: "native",
  amount: "100",
  position: null,
  slippageBps: 50,
  maxNativeFee: "10",
};
const log = (
  address: `0x${string}`,
  topics: readonly (`0x${string}` | `0x${string}`[] | null)[],
  data: `0x${string}`
): TransactionReceipt["logs"][number] => {
  const [first, ...rest] = topics.filter(
    (topic): topic is `0x${string}` => typeof topic === "string"
  );
  return {
    address,
    data,
    topics: first === undefined ? [] : [first, ...rest],
    blockNumber: 1n,
    blockHash: hash,
    logIndex: 0,
    transactionHash: hash,
    transactionIndex: 0,
    removed: false,
  };
};

const boundary = () =>
  log(
    entryPoint07Address,
    encodeEventTopics({ abi, eventName: "BeforeExecution" }),
    "0x"
  );
const event = (
  success: boolean,
  operationHash: `0x${string}` = opHash,
  sender: `0x${string}` = wallet
) =>
  log(
    entryPoint07Address,
    encodeEventTopics({
      abi,
      eventName: "UserOperationEvent",
      args: { userOpHash: operationHash, sender, paymaster },
    }),
    encodeAbiParameters(parseAbiParameters("uint256,bool,uint256,uint256"), [
      0n,
      success,
      10n,
      10n,
    ])
  );
const withdrawal = (amount: bigint) => {
  const router = uniswapDeployment(input.network)?.router;
  if (router === undefined) {
    throw new Error("Missing reviewed router");
  }
  return log(
    weth,
    encodeEventTopics({
      abi,
      eventName: "Withdrawal",
      args: { src: getAddress(router) },
    }),
    encodeAbiParameters(parseAbiParameters("uint256"), [amount])
  );
};
const principal = () =>
  log(
    token,
    encodeEventTopics({
      abi,
      eventName: "Transfer",
      args: { from: wallet, to: paymaster },
    }),
    encodeAbiParameters(parseAbiParameters("uint256"), [100n])
  );
const receipt = (logs: TransactionReceipt["logs"]): TransactionReceipt => ({
  to: entryPoint07Address,
  from: paymaster,
  status: "success",
  logs,
  transactionHash: hash,
  blockHash: hash,
  blockNumber: 1n,
  transactionIndex: 0,
  contractAddress: null,
  cumulativeGasUsed: 100n,
  effectiveGasPrice: 1n,
  gasUsed: 100n,
  logsBloom: "0x",
  type: "eip1559",
});

test("a reverted user operation is not success even when its enclosing transaction succeeds", () => {
  const result = managedSwapSettlement(
    { input },
    receipt([boundary(), event(false)]),
    opHash,
    10
  );
  expect(result.state).toBe("reverted");
});

test("native proceeds come only from the reviewed router within this user operation", () => {
  const result = managedSwapSettlement(
    { input },
    receipt([
      boundary(),
      withdrawal(9999n),
      event(true, otherHash),
      principal(),
      withdrawal(200n),
      event(true),
    ]),
    opHash,
    10
  );
  expect(result).toEqual({
    state: "confirmed",
    nativeFee: "0",
    sponsoredNativeFee: "10",
    actualInput: "100",
    output: "200",
    at: 10,
  });
});

test("missing operation, mismatched wallet, and unreviewed EntryPoint never release capital", () => {
  expect(() =>
    managedSwapSettlement(
      { input },
      receipt([boundary(), event(true, otherHash)]),
      opHash,
      10
    )
  ).toThrow("absent");
  expect(() =>
    managedSwapSettlement(
      { input },
      receipt([boundary(), event(true, opHash, paymaster)]),
      opHash,
      10
    )
  ).toThrow("sender");
  expect(() =>
    managedSwapSettlement(
      { input },
      { ...receipt([boundary(), event(true)]), to: wallet },
      opHash,
      10
    )
  ).toThrow("EntryPoint");
});
