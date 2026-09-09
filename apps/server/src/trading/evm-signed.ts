import type { TradeInput, TradePayload } from "@froggy/domain";
import {
  isHex,
  keccak256,
  parseTransaction,
  recoverTransactionAddress,
} from "viem";

const isType2 = (value: string): value is `0x02${string}` =>
  isHex(value) && value.startsWith("0x02") && value.length % 2 === 0;

const checkTransaction = (
  network: string,
  expected: Extract<TradePayload, { kind: "evm" }>,
  transaction: ReturnType<typeof parseTransaction>
): void => {
  const chainId = Number(network.slice(7));
  if (transaction.type !== "eip1559") {
    throw new Error("trade.signature: unsupported transaction type.");
  }
  if (
    !Number.isSafeInteger(chainId) ||
    transaction.chainId !== chainId ||
    transaction.to?.toLowerCase() !== expected.to.toLowerCase() ||
    (transaction.data ?? "0x").toLowerCase() !== expected.data.toLowerCase() ||
    (transaction.value ?? 0n) !== BigInt(expected.value) ||
    transaction.gas !== BigInt(expected.gasLimit) ||
    transaction.maxFeePerGas !== BigInt(expected.maxFeePerGas) ||
    transaction.maxPriorityFeePerGas !==
      BigInt(expected.maxPriorityFeePerGas) ||
    transaction.nonce !== expected.nonce ||
    (transaction.accessList?.length ?? 0) !== 0
  ) {
    throw new Error(
      "trade.signature: signed transaction differs from the approved payload."
    );
  }
};

/** Verify every signed field before persisting recovery material or broadcasting it. */
export const verifySignedTradeTransaction = async (
  input: TradeInput,
  expected: Extract<TradePayload, { kind: "evm" }>,
  signed: string
): Promise<{ readonly payload: string; readonly transactionId: string }> => {
  if (
    !input.network.startsWith("eip155:") ||
    !isType2(signed) ||
    signed.length > 70_000
  ) {
    throw new Error("trade.signature: invalid EVM transaction encoding.");
  }
  const transaction = parseTransaction(signed);
  checkTransaction(input.network, expected, transaction);
  const signer = await recoverTransactionAddress({
    serializedTransaction: signed,
  });
  if (signer.toLowerCase() !== input.wallet.toLowerCase()) {
    throw new Error(
      "trade.signature: signed transaction belongs to another wallet."
    );
  }
  return { payload: signed, transactionId: keccak256(signed) };
};
