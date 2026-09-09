import type {
  Trade,
  TradeInput,
  TradePayload,
  TradeStep,
} from "@froggy/domain";
import {
  decodeFunctionData,
  encodeAbiParameters,
  encodeFunctionData,
  getAddress,
  isHex,
  parseAbi,
  parseAbiParameters,
} from "viem";

import { PONS_ABI, PONS_DEPLOYMENTS, ponsToken } from "./pons";
import type { PonsSnapshot } from "./pons";

const TOKEN = parseAbi([
  "function approve(address spender,uint256 amount) returns(bool)",
]);
const PERMIT = parseAbi([
  "function approve(address token,address spender,uint160 amount,uint48 expiration)",
]);
const ROUTER = parseAbi([
  "function execute(bytes commands,bytes[] inputs,uint256 deadline) payable",
]);
const SINGLE = parseAbiParameters(
  "((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,uint256 minHopPriceX36,bytes hookData)"
);
type EvmPayload = Extract<TradePayload, { kind: "evm" }>;

const ponsSwapData = (
  input: TradeInput,
  state: PonsSnapshot,
  minimum: bigint,
  deadline: bigint
) => {
  ponsToken(input);
  if (minimum <= 0n || minimum >= 2n ** 128n) {
    throw new Error(
      "trade.minimum: choose a positive bounded Pons output minimum."
    );
  }
  if (state.phase === "curve") {
    return {
      to: state.curve,
      data: encodeFunctionData({
        abi: PONS_ABI,
        functionName: state.buy ? "buy" : "sell",
        args: [BigInt(input.amount), minimum, getAddress(input.wallet)],
      }),
    };
  }
  const swap = encodeAbiParameters(SINGLE, [
    {
      poolKey: state.pool,
      zeroForOne:
        state.pool.currency0.toLowerCase() === input.tokenIn.toLowerCase(),
      amountIn: BigInt(input.amount),
      amountOutMinimum: minimum,
      minHopPriceX36: 0n,
      hookData: "0x",
    },
  ]);
  const settle = encodeAbiParameters(parseAbiParameters("address,uint256"), [
    getAddress(input.tokenIn),
    BigInt(input.amount),
  ]);
  const take = encodeAbiParameters(parseAbiParameters("address,uint256"), [
    getAddress(input.tokenOut),
    minimum,
  ]);
  // SETTLE_ALL caps actual debt; TAKE_ALL sends the net credit to msgSender.
  return {
    to: PONS_DEPLOYMENTS.router.address,
    data: encodeFunctionData({
      abi: ROUTER,
      functionName: "execute",
      args: [
        "0x10",
        [
          encodeAbiParameters(parseAbiParameters("bytes,bytes[]"), [
            "0x060c0f",
            [swap, settle, take],
          ]),
        ],
        deadline,
      ],
    }),
  };
};

export const buildPonsTransactions = (
  input: TradeInput,
  state: PonsSnapshot,
  context: {
    readonly nonce: number;
    readonly tokenAllowance: bigint;
    readonly maxFeePerGas: bigint;
    readonly maxPriorityFeePerGas: bigint;
    readonly expectedOutput: bigint;
    readonly now: number;
  }
) => {
  const minimum =
    (context.expectedOutput * BigInt(10_000 - input.slippageBps)) / 10_000n;
  const expiresAt = context.now + 120_000;
  const deadline = BigInt(Math.floor(expiresAt / 1000));
  const spender =
    state.phase === "curve" ? state.curve : PONS_DEPLOYMENTS.permit.address;
  const transactions: {
    kind: "approve" | "swap";
    description: string;
    payload: EvmPayload;
  }[] = [];
  const add = (
    kind: "approve" | "swap",
    to: string,
    data: string,
    gas: bigint,
    description: string
  ) => {
    transactions.push({
      kind,
      description,
      payload: {
        kind: "evm",
        to,
        data,
        value: "0",
        nonce: context.nonce + transactions.length,
        gasLimit: gas.toString(),
        maxFeePerGas: context.maxFeePerGas.toString(),
        maxPriorityFeePerGas: context.maxPriorityFeePerGas.toString(),
      },
    });
  };
  if (context.tokenAllowance < BigInt(input.amount)) {
    if (context.tokenAllowance !== 0n) {
      add(
        "approve",
        input.tokenIn,
        encodeFunctionData({
          abi: TOKEN,
          functionName: "approve",
          args: [spender, 0n],
        }),
        150_000n,
        "Reset the existing Pons input allowance"
      );
    }
    add(
      "approve",
      input.tokenIn,
      encodeFunctionData({
        abi: TOKEN,
        functionName: "approve",
        args: [spender, BigInt(input.amount)],
      }),
      150_000n,
      "Approve only this trade's maximum input"
    );
  }
  if (state.phase === "graduated") {
    add(
      "approve",
      PONS_DEPLOYMENTS.permit.address,
      encodeFunctionData({
        abi: PERMIT,
        functionName: "approve",
        args: [
          getAddress(input.tokenIn),
          PONS_DEPLOYMENTS.router.address,
          BigInt(input.amount),
          Number(deadline),
        ],
      }),
      150_000n,
      "Authorize the reviewed router for this exact amount until the quote expires"
    );
  }
  const swap = ponsSwapData(input, state, minimum, deadline);
  add(
    "swap",
    swap.to,
    swap.data,
    5_000_000n,
    state.phase === "curve"
      ? "Pons bonding-curve swap; a graduation fill may consume less input at the approved price bound"
      : "Pons graduated pool swap; hook fees are included in the net quote"
  );
  const feeBound = transactions.reduce(
    (total, tx) =>
      total + BigInt(tx.payload.gasLimit) * BigInt(tx.payload.maxFeePerGas),
    0n
  );
  if (feeBound > BigInt(input.maxNativeFee)) {
    throw new Error(
      "trade.gas: Pons transaction caps exceed the approved native fee budget."
    );
  }
  return {
    transactions,
    expectedOutput: context.expectedOutput.toString(),
    minimumOutput: minimum.toString(),
    expiresAt,
    phase: state.phase,
  };
};

const validateApproval = (
  input: TradeInput,
  state: PonsSnapshot,
  step: TradeStep,
  payload: EvmPayload
): void => {
  const spender =
    state.phase === "curve" ? state.curve : PONS_DEPLOYMENTS.permit.address;
  if (!isHex(payload.data)) {
    throw new Error("trade.payload: invalid EVM calldata.");
  }
  if (payload.to.toLowerCase() === input.tokenIn.toLowerCase()) {
    const decoded = decodeFunctionData({ abi: TOKEN, data: payload.data });
    if (
      decoded.args[0].toLowerCase() !== spender.toLowerCase() ||
      (decoded.args[1] !== 0n && decoded.args[1] !== BigInt(input.amount))
    ) {
      throw new Error(
        "trade.approval: Pons token allowance differs from the approved input cap."
      );
    }
    return;
  }
  if (
    state.phase !== "graduated" ||
    payload.to.toLowerCase() !== PONS_DEPLOYMENTS.permit.address.toLowerCase()
  ) {
    throw new Error("trade.approval: unsupported Pons approval target.");
  }
  const decoded = decodeFunctionData({ abi: PERMIT, data: payload.data });
  const [token, router, amount, expiry] = decoded.args;
  if (
    token.toLowerCase() !== input.tokenIn.toLowerCase() ||
    router.toLowerCase() !== PONS_DEPLOYMENTS.router.address.toLowerCase() ||
    amount !== BigInt(input.amount) ||
    expiry !== Math.floor(step.expiresAt / 1000)
  ) {
    throw new Error(
      "trade.approval: Permit2 amount, router or expiry differs from the immutable quote."
    );
  }
};

export const validatePonsStep = (
  trade: Trade,
  step: TradeStep,
  state: PonsSnapshot
): void => {
  const { input } = trade;
  ponsToken(input);
  const { payload } = step;
  if (
    payload.kind !== "evm" ||
    payload.value !== "0" ||
    state.phase !== trade.phase ||
    trade.minimumOutput === null
  ) {
    throw new Error(
      "trade.phase: native Pons phase or value differs from the approved transaction."
    );
  }
  if (step.kind === "approve") {
    validateApproval(input, state, step, payload);
    return;
  }
  if (step.kind !== "swap") {
    throw new Error("trade.action: unsupported native Pons action.");
  }
  const expected = ponsSwapData(
    input,
    state,
    BigInt(trade.minimumOutput),
    BigInt(Math.floor(step.expiresAt / 1000))
  );
  if (
    expected.to.toLowerCase() !== payload.to.toLowerCase() ||
    expected.data.toLowerCase() !== payload.data.toLowerCase()
  ) {
    throw new Error(
      "trade.payload: Pons recipient, input, minimum, pool or commands differ from the immutable proposal."
    );
  }
};
