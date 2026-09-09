import type { Trade, TradeStep } from "@froggy/domain";
import { decodeEventLog, parseAbi } from "viem";
import type { TransactionReceipt } from "viem";

import { PONS_ABI, ponsToken } from "./pons";

const TRANSFER = parseAbi([
  "event Transfer(address indexed from,address indexed to,uint256 value)",
]);
const netToken = (
  receipt: TransactionReceipt,
  token: string,
  wallet: string
): bigint => {
  let net = 0n;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== token.toLowerCase()) {
      continue;
    }
    let event;
    try {
      event = decodeEventLog({
        abi: TRANSFER,
        data: log.data,
        topics: log.topics,
      });
    } catch {
      continue;
    }
    if (event.args.to.toLowerCase() === wallet.toLowerCase()) {
      net += event.args.value;
    }
    if (event.args.from.toLowerCase() === wallet.toLowerCase()) {
      net -= event.args.value;
    }
  }
  return net;
};

const curveFill = (
  trade: Trade,
  step: TradeStep,
  receipt: TransactionReceipt,
  spent: bigint,
  received: bigint
): void => {
  if (step.payload.kind !== "evm") {
    throw new Error("trade.payload: expected Pons EVM transaction.");
  }
  const { buy } = ponsToken(trade.input);
  let found = 0;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== step.payload.to.toLowerCase()) {
      continue;
    }
    let event;
    try {
      event = decodeEventLog({
        abi: PONS_ABI,
        data: log.data,
        topics: log.topics,
      });
    } catch {
      continue;
    }
    const buyEvent = event.eventName === "CurveBuy";
    const actor =
      event.eventName === "CurveBuy" ? event.args.buyer : event.args.seller;
    const input =
      event.eventName === "CurveBuy" ? event.args.quoteIn : event.args.tokensIn;
    const output =
      event.eventName === "CurveBuy"
        ? event.args.tokensOut
        : event.args.quoteOut;
    if (
      buyEvent !== buy ||
      actor.toLowerCase() !== trade.input.wallet.toLowerCase() ||
      event.args.recipient.toLowerCase() !== trade.input.wallet.toLowerCase() ||
      input !== spent ||
      output !== received
    ) {
      throw new Error(
        "trade.receipt: Pons curve fill disagrees with wallet transfers or the approved owner."
      );
    }
    found += 1;
  }
  if (found !== 1 || (!buy && spent !== BigInt(trade.input.amount))) {
    throw new Error(
      "trade.receipt: missing, duplicate or partial Pons curve sell evidence."
    );
  }
};

/** Net Transfer deltas include curve refunds and all hook fees; fee amounts are not subtracted twice. */
export const ponsSettlementValues = (
  trade: Trade,
  step: TradeStep,
  receipt: TransactionReceipt
) => {
  if (step.kind === "approve") {
    return { output: null };
  }
  const spent = -netToken(receipt, trade.input.tokenIn, trade.input.wallet);
  const received = netToken(receipt, trade.input.tokenOut, trade.input.wallet);
  if (spent <= 0n || spent > BigInt(trade.input.amount) || received <= 0n) {
    throw new Error(
      "trade.receipt: Pons wallet principal or output could not be established within the cap."
    );
  }
  if (trade.phase === "curve") {
    curveFill(trade, step, receipt, spent, received);
  }
  if (trade.phase === "graduated" && spent !== BigInt(trade.input.amount)) {
    throw new Error(
      "trade.receipt: graduated Pons input was not fully consumed."
    );
  }
  return { output: received.toString(), actualInput: spent.toString() };
};
