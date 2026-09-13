import type { CardBridgeObservation, TradeInput } from "@froggy/domain";
import {
  decodeEventLog,
  erc20Abi,
  getAddress,
  isHex,
  keccak256,
  pad,
} from "viem";
import type { Log, TransactionReceipt } from "viem";

import { CARD_BRIDGE } from "./card-bridge";
import { ACROSS_ABI } from "./card-bridge-abi";
import type { TradeEvmClient } from "./evm-chain";

const same = (a: string, b: string): boolean =>
  a.toLowerCase() === b.toLowerCase();
const address32 = (address: string) => pad(getAddress(address));
const cardBridgeDepositEvent = (
  input: TradeInput,
  logs: TransactionReceipt["logs"],
  minimum: string
) => {
  const matches = logs.flatMap((log) => {
    if (!same(log.address, CARD_BRIDGE.sourcePool)) {
      return [];
    }
    try {
      const event = decodeEventLog({
        abi: ACROSS_ABI,
        data: log.data,
        topics: log.topics,
      });
      if (
        event.eventName !== "FundsDeposited" &&
        event.eventName !== "V3FundsDeposited"
      ) {
        return [];
      }
      const { args } = event;
      const normalize =
        event.eventName === "FundsDeposited" ? address32 : getAddress;
      if (
        input.bridge === undefined ||
        args.destinationChainId !== BigInt(CARD_BRIDGE.destinationChainId) ||
        !same(args.depositor, normalize(input.wallet)) ||
        !same(args.recipient, normalize(input.bridge.recipient)) ||
        !same(args.inputToken, normalize(input.tokenIn)) ||
        !same(args.outputToken, normalize(input.tokenOut)) ||
        args.inputAmount !== BigInt(input.amount) ||
        args.outputAmount !== BigInt(minimum) ||
        args.message !== "0x"
      ) {
        return [];
      }
      return [
        {
          depositId: args.depositId.toString(),
          amount: args.outputAmount.toString(),
          fillDeadline: args.fillDeadline,
          exclusivityDeadline: args.exclusivityDeadline,
          exclusiveRelayer: args.exclusiveRelayer,
        },
      ];
    } catch {
      return [];
    }
  });
  if (matches.length !== 1 || matches[0] === undefined) {
    throw new Error(
      "trade.bridge_receipt: missing or ambiguous matching Across deposit."
    );
  }
  return matches[0];
};
export const bridgeSourceSettlement = (
  input: TradeInput,
  logs: TransactionReceipt["logs"],
  minimum: string
): void => {
  cardBridgeDepositEvent(input, logs, minimum);
  let debit = 0n;
  for (const log of logs) {
    if (!same(log.address, CARD_BRIDGE.inputToken)) {
      continue;
    }
    try {
      const event = decodeEventLog({
        abi: erc20Abi,
        eventName: "Transfer",
        data: log.data,
        topics: log.topics,
      });
      if (same(event.args.from, input.wallet)) {
        debit += event.args.value;
      }
      if (same(event.args.to, input.wallet)) {
        debit -= event.args.value;
      }
    } catch {
      /* Non-transfer token logs do not establish the debit. */
    }
  }
  if (debit !== BigInt(input.amount)) {
    throw new Error("trade.bridge_debit: source debit differs from approval.");
  }
};
export interface CardLineaReader {
  readonly stubbed: boolean;
  readonly balance: (address: string) => Promise<{
    readonly units: string;
    readonly block: string;
    readonly observedAt: number;
  }>;
  readonly observe: (
    input: TradeInput,
    minimum: string,
    previous: CardBridgeObservation
  ) => Promise<CardBridgeObservation>;
}
const matchingFill = (
  input: TradeInput,
  minimum: string,
  deposit: ReturnType<typeof cardBridgeDepositEvent>,
  log: Log
): boolean => {
  const event = decodeEventLog({
    abi: ACROSS_ABI,
    data: log.data,
    topics: log.topics,
  });
  if (event.eventName !== "FilledRelay" || input.bridge === undefined) {
    return false;
  }
  const { args } = event;
  if (
    args.depositId.toString() !== deposit.depositId ||
    args.originChainId !== BigInt(CARD_BRIDGE.sourceChainId) ||
    !same(args.depositor, address32(input.wallet)) ||
    !same(args.recipient, address32(input.bridge.recipient)) ||
    !same(args.inputToken, address32(input.tokenIn)) ||
    !same(args.outputToken, address32(input.tokenOut)) ||
    args.inputAmount !== BigInt(input.amount) ||
    args.outputAmount !== BigInt(minimum) ||
    args.fillDeadline !== deposit.fillDeadline ||
    args.exclusivityDeadline !== deposit.exclusivityDeadline ||
    !same(
      args.exclusiveRelayer,
      deposit.exclusiveRelayer.length === 42
        ? address32(deposit.exclusiveRelayer)
        : deposit.exclusiveRelayer
    ) ||
    args.messageHash !== keccak256("0x") ||
    !same(args.relayExecutionInfo.updatedRecipient, args.recipient) ||
    args.relayExecutionInfo.updatedOutputAmount !== args.outputAmount ||
    args.relayExecutionInfo.updatedMessageHash !== args.messageHash
  ) {
    return false;
  }

  return true;
};
const reconcileFillBlock = async (
  destination: TradeEvmClient,
  previous: CardBridgeObservation
): Promise<CardBridgeObservation> => {
  let next = previous;
  if (next.fillBlock !== null && next.fillBlockHash !== null) {
    const block = await destination.getBlock({
      blockNumber: BigInt(next.fillBlock),
    });
    if (!same(block.hash, next.fillBlockHash)) {
      next = {
        ...next,
        cursor: next.destinationStartBlock,
        fillBlock: null,
        fillBlockHash: null,
        fillTransaction: null,
        destinationConfirmed: false,
      };
    }
  }

  return next;
};
const confirmedHeight = (head: bigint, confirmations: number): bigint =>
  head >= BigInt(confirmations - 1) ? head - BigInt(confirmations - 1) : 0n;
export const liveCardLinea = (
  source: TradeEvmClient,
  destination: TradeEvmClient,
  confirmations: number,
  destinationConfirmations: number,
  now = Date.now
): CardLineaReader => {
  const chains = async () => {
    const ids = await Promise.all([
      source.getChainId(),
      destination.getChainId(),
    ]);
    if (
      ids[0] !== CARD_BRIDGE.sourceChainId ||
      ids[1] !== CARD_BRIDGE.destinationChainId
    ) {
      throw new Error(
        "card.network: Base and read-only Linea RPCs must match their configured chains."
      );
    }
  };
  return {
    stubbed: false,
    balance: async (address) => {
      await chains();
      const block = await destination.getBlockNumber({ cacheTime: 0 });
      const units = await destination.readContract({
        address: CARD_BRIDGE.outputToken,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [getAddress(address)],
        blockNumber: block,
      });
      return {
        units: units.toString(),
        block: block.toString(),
        observedAt: now(),
      };
    },
    observe: async (input, minimum, previous) => {
      await chains();
      if (
        previous.sourceTransaction === null ||
        !isHex(previous.sourceTransaction)
      ) {
        return previous;
      }
      const receipt = await source.getTransactionReceipt({
        hash: previous.sourceTransaction,
      });
      const canonicalSource = await source.getBlock({
        blockNumber: receipt.blockNumber,
      });
      if (
        receipt.status !== "success" ||
        !same(canonicalSource.hash, receipt.blockHash)
      ) {
        throw new Error(
          "card.source_reorg: source deposit must be reconciled."
        );
      }
      bridgeSourceSettlement(input, receipt.logs, minimum);
      const deposit = cardBridgeDepositEvent(input, receipt.logs, minimum);
      if (deposit.fillDeadline * 1000 !== previous.fillDeadline) {
        throw new Error("card.deposit: changed fill deadline.");
      }
      const sourceHead = await source.getBlockNumber({ cacheTime: 0 });
      const head = await destination.getBlockNumber({ cacheTime: 0 });
      let next: CardBridgeObservation = {
        ...previous,
        depositId: deposit.depositId,
        sourceBlockHash: receipt.blockHash,
        sourceConfirmed:
          sourceHead >= receipt.blockNumber + BigInt(confirmations - 1),
      };
      next = await reconcileFillBlock(destination, next);
      const fromBlock = BigInt(next.cursor);
      const confirmedHead = confirmedHeight(head, destinationConfirmations);
      const toBlock =
        fromBlock + 499n < confirmedHead ? fromBlock + 499n : confirmedHead;
      if (next.fillTransaction !== null) {
        return {
          ...next,
          destinationConfirmed:
            next.fillBlock !== null && confirmedHead >= BigInt(next.fillBlock),
        };
      }
      if (fromBlock > toBlock) {
        return next;
      }
      const logs = await destination.getLogs({
        address: CARD_BRIDGE.destinationPool,
        event: ACROSS_ABI[0],
        fromBlock,
        toBlock,
      });
      if (logs.length > 1000) {
        throw new Error(
          "card.scan: destination event window exceeds the scan budget."
        );
      }
      const matching = logs.filter((log) =>
        matchingFill(input, minimum, deposit, log)
      );
      if (matching.length > 1) {
        throw new Error("card.fill: ambiguous destination fill.");
      }
      const [log] = matching;
      if (
        log === undefined ||
        log.transactionHash === null ||
        log.blockNumber === null ||
        log.blockHash === null
      ) {
        return { ...next, cursor: (toBlock + 1n).toString() };
      }
      const fill = await destination.getTransactionReceipt({
        hash: log.transactionHash,
      });
      if (
        fill.status !== "success" ||
        !same(fill.blockHash, log.blockHash) ||
        fill.logs.length > 512
      ) {
        throw new Error("card.fill: destination receipt is not confirmed.");
      }
      const transferred = fill.logs.some((transfer) => {
        if (!same(transfer.address, CARD_BRIDGE.outputToken)) {
          return false;
        }
        try {
          const decoded = decodeEventLog({
            abi: erc20Abi,
            eventName: "Transfer",
            data: transfer.data,
            topics: transfer.topics,
          });
          return (
            same(decoded.args.to, input.bridge?.recipient ?? "") &&
            decoded.args.value === BigInt(minimum) &&
            transfer.logIndex < log.logIndex
          );
        } catch {
          return false;
        }
      });
      if (transferred) {
        next = {
          ...next,
          fillTransaction: log.transactionHash,
          fillBlock: log.blockNumber.toString(),
          fillBlockHash: log.blockHash,
          destinationConfirmed: true,
        };
      }
      return { ...next, cursor: (toBlock + 1n).toString() };
    },
  };
};
