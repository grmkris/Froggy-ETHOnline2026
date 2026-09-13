import { KNOWN_ASSETS } from "@froggy/domain";
import type { Trade, TradeStep } from "@froggy/domain";
import type {
  ManagedTradeSubmission,
  PrivyExecution,
  TradeSettlement,
  SignatureOptionsResolver,
} from "@froggy/wallet";
import { Redacted, Schema } from "effect";
import {
  decodeEventLog,
  isHex,
  getAddress,
  parseAbi,
  TransactionReceiptNotFoundError,
} from "viem";
import type { TransactionReceipt } from "viem";
import {
  entryPoint07Address,
  entryPoint08Address,
  entryPoint09Address,
} from "viem/account-abstraction";

import type { Environment } from "../environment";
import { bridgeSourceSettlement } from "./card-bridge-observation";
import type { TradeSigner } from "./coordinator";
import { assertTradeNetwork, tradeEvmClient } from "./evm-chain";
import type { EvmExecutionOptions } from "./evm-execution";
import { uniswapQuoteAsset } from "./uniswap";
import { uniswapDeployment } from "./uniswap-transactions";

const EVENTS = parseAbi([
  "event BeforeExecution()",
  "event UserOperationEvent(bytes32 indexed userOpHash,address indexed sender,address indexed paymaster,uint256 nonce,bool success,uint256 actualGasCost,uint256 actualGasUsed)",
]);
const TOKENS = parseAbi([
  "event Transfer(address indexed from,address indexed to,uint256 value)",
  "event Withdrawal(address indexed src,uint256 wad)",
]);

const managedAssetSettlement = (
  trade: Pick<Trade, "input"> & Partial<Pick<Trade, "minimumOutput">>,
  scoped: TransactionReceipt["logs"],
  at: number
): Exclude<TradeSettlement, { state: "pending" }> => {
  if (trade.input.action === "bridge") {
    if (trade.minimumOutput === undefined || trade.minimumOutput === null) {
      throw new Error("trade.bridge_receipt: missing approved minimum.");
    }
    bridgeSourceSettlement(trade.input, scoped, trade.minimumOutput);
    return {
      state: "confirmed",
      nativeFee: "0",
      output: null,
      actualInput: trade.input.amount,
      at,
    };
  }
  let output = 0n;
  let spent = 0n;
  for (const tokenLog of scoped) {
    const token = tokenLog.address.toLowerCase();
    if (
      trade.input.tokenOut === "native" &&
      token === uniswapQuoteAsset(trade.input.network, "native").toLowerCase()
    ) {
      try {
        const withdrawal = decodeEventLog({
          abi: TOKENS,
          eventName: "Withdrawal",
          data: tokenLog.data,
          topics: tokenLog.topics,
        });
        if (
          withdrawal.args.src.toLowerCase() ===
          uniswapDeployment(trade.input.network)?.router.toLowerCase()
        ) {
          output += withdrawal.args.wad;
        }
      } catch {
        /* Only the reviewed router's WETH withdrawals establish native proceeds. */
      }
    }
    if (
      token !== trade.input.tokenIn.toLowerCase() &&
      token !== trade.input.tokenOut.toLowerCase()
    ) {
      continue;
    }
    try {
      const transfer = decodeEventLog({
        abi: TOKENS,
        eventName: "Transfer",
        data: tokenLog.data,
        topics: tokenLog.topics,
      });
      const incoming =
        transfer.args.to.toLowerCase() === trade.input.wallet.toLowerCase()
          ? transfer.args.value
          : 0n;
      const outgoing =
        transfer.args.from.toLowerCase() === trade.input.wallet.toLowerCase()
          ? transfer.args.value
          : 0n;
      if (token === trade.input.tokenOut.toLowerCase()) {
        output += incoming - outgoing;
      }
      if (token === trade.input.tokenIn.toLowerCase()) {
        spent += outgoing - incoming;
      }
    } catch {
      /* Other token events are not transfers. */
    }
  }
  if (output < 0n || spent < 0n) {
    throw new Error("trade.receipt: unexpected negative asset settlement.");
  }
  return {
    state: "confirmed",
    nativeFee: "0",
    output: output.toString(),
    actualInput:
      trade.input.tokenIn === "native" ? trade.input.amount : spent.toString(),
    at,
  };
};

/** Only logs inside this operation's execution establish its proceeds. */
export const managedSwapSettlement = (
  trade: Pick<Trade, "input"> & Partial<Pick<Trade, "minimumOutput">>,
  receipt: TransactionReceipt,
  userOperationHash: string,
  at: number
): TradeSettlement => {
  const entryPoint = receipt.to?.toLowerCase();
  if (
    ![entryPoint07Address, entryPoint08Address, entryPoint09Address].some(
      (address) => address.toLowerCase() === entryPoint
    ) ||
    receipt.logs.length > 512
  ) {
    throw new Error(
      "trade.receipt: unsupported EntryPoint or oversized operation receipt."
    );
  }
  let start = -1;
  for (const [index, log] of receipt.logs.entries()) {
    if (log.address.toLowerCase() !== entryPoint) {
      continue;
    }
    let event;
    try {
      event = decodeEventLog({
        abi: EVENTS,
        data: log.data,
        topics: log.topics,
      });
    } catch {
      continue;
    }
    if (event.eventName === "BeforeExecution") {
      start = index + 1;
      continue;
    }
    if (
      event.args.userOpHash.toLowerCase() !== userOperationHash.toLowerCase()
    ) {
      start = index + 1;
      continue;
    }
    if (
      start < 0 ||
      event.args.sender.toLowerCase() !== trade.input.wallet.toLowerCase() ||
      event.args.paymaster === "0x0000000000000000000000000000000000000000"
    ) {
      throw new Error(
        "trade.receipt: operation sender or sponsored execution boundary differs."
      );
    }
    if (!event.args.success || receipt.status !== "success") {
      return {
        state: "reverted",
        nativeFee: "0",
        sponsoredNativeFee: event.args.actualGasCost.toString(),
        output: null,
        at,
      };
    }
    return {
      ...managedAssetSettlement(trade, receipt.logs.slice(start, index), at),
      sponsoredNativeFee: event.args.actualGasCost.toString(),
    };
  }
  throw new Error(
    "trade.receipt: the provider's user operation is absent from this transaction."
  );
};

const inspectManaged = async (
  options: EvmExecutionOptions,
  privy: PrivyExecution,
  trade: Trade,
  step: TradeStep
) => {
  const state = step.managed;
  if (state?.providerTransactionId === null || state === undefined) {
    throw new Error("trade.recovery: missing provider identity.");
  }
  const operation = await privy.get(state.providerTransactionId);
  if (
    operation.id !== state.providerTransactionId ||
    operation.walletId !== state.walletId ||
    operation.network !== trade.input.network
  ) {
    throw new Error(
      "trade.provider_identity: provider operation differs from the approved wallet or network."
    );
  }
  const pending = {
    transactionHash: operation.transactionHash,
    userOperationHash: operation.userOperationHash,
    settlement: { state: "pending" as const },
  };
  if (
    operation.transactionHash === null ||
    operation.userOperationHash === null
  ) {
    if (
      ["failed", "provider_error", "replaced", "execution_reverted"].includes(
        operation.status
      )
    ) {
      throw new Error(
        `trade.provider_status: Privy reports ${operation.status} without a complete chain identity. Reconcile wallet activity before releasing this reservation.`
      );
    }
    return pending;
  }
  if (
    !operation.sponsored ||
    !isHex(operation.transactionHash) ||
    operation.transactionHash.length !== 66
  ) {
    throw new Error(
      "trade.receipt: provider did not establish sponsored execution."
    );
  }
  await assertTradeNetwork(options.client, trade.input.network);
  let receipt: TransactionReceipt;
  try {
    receipt = await options.client.getTransactionReceipt({
      hash: operation.transactionHash,
    });
  } catch (error) {
    if (error instanceof TransactionReceiptNotFoundError) {
      return pending;
    }
    throw error;
  }
  const [head, block] = await Promise.all([
    options.client.getBlockNumber({ cacheTime: 0 }),
    options.client.getBlock({ blockNumber: receipt.blockNumber }),
  ]);
  if (
    options.confirmations < 1 ||
    block.hash !== receipt.blockHash ||
    head - receipt.blockNumber + 1n < BigInt(options.confirmations)
  ) {
    return pending;
  }
  if (
    receipt.transactionHash.toLowerCase() !==
    operation.transactionHash.toLowerCase()
  ) {
    throw new Error("trade.receipt: transaction hash mismatch.");
  }
  return {
    ...pending,
    settlement: managedSwapSettlement(
      trade,
      receipt,
      operation.userOperationHash,
      options.now()
    ),
  };
};

export const managedTradeSubmission = (
  options: EvmExecutionOptions,
  privy: PrivyExecution,
  signer: TradeSigner
): ManagedTradeSubmission => ({
  kind: "privy",
  prepare: async (trade, step) => {
    if (
      signer?.kind !== "privy" ||
      step.payload.kind !== "evm_calls" ||
      step.ruleId !== null
    ) {
      throw new Error(
        "trade.human_only: managed execution requires the owner's exact request authorization."
      );
    }
    await assertTradeNetwork(options.client, trade.input.network);
    const request = privy.authorization(signer.walletId, trade, step);
    return {
      walletId: signer.walletId,
      request: request.body,
      authorizationSignature: signer.authorizationSignature,
      idempotencyKey: step.id,
      expiresAt: step.expiresAt,
      providerTransactionId: null,
      userOperationHash: null,
    };
  },
  submit: async (trade, step) => {
    const state = step.managed;
    if (state === undefined) {
      throw new Error("trade.recovery: missing managed request.");
    }
    const expected = privy.authorization(state.walletId, trade, step);
    if (
      !Bun.deepEquals(expected.body, state.request) ||
      state.idempotencyKey !== step.id ||
      state.expiresAt !== step.expiresAt
    ) {
      throw new Error(
        "trade.recovery: saved request differs from the approved operation."
      );
    }
    await assertTradeNetwork(options.client, trade.input.network);
    return await privy.submit(state);
  },
  inspect: async (trade, step) =>
    await inspectManaged(options, privy, trade, step),
});

/** USDC EIP-3009 uses ERC-1271 for accounts with code. Message signing and other verifiers keep their own encoding. */
export const usdcSignatureOptions = (
  environment: Environment
): SignatureOptionsResolver =>
  async function resolveUsdcSignature(address, typedData) {
    if (
      typedData.primaryType !== "TransferWithAuthorization" &&
      typedData.primaryType !== "ReceiveWithAuthorization"
    ) {
      return null;
    }
    const domain = Schema.decodeUnknownSync(
      Schema.Struct({ chainId: Schema.Int, verifyingContract: Schema.String })
    )(typedData.domain);
    const network = `eip155:${domain.chainId}`;
    const asset = Object.values(KNOWN_ASSETS).find(
      (candidate) =>
        candidate.network === network && candidate.symbol === "USDC"
    );
    if (
      asset === undefined ||
      asset.id.toLowerCase() !== domain.verifyingContract.toLowerCase()
    ) {
      return null;
    }
    let endpoint = environment.trading.rpcEndpoints[network];
    if (endpoint === undefined && network === environment.evmNetwork) {
      endpoint = Redacted.make(environment.evmRpcUrl);
    }
    if (endpoint === undefined) {
      throw new Error(
        "USDC signature verification requires an RPC on the requested network."
      );
    }
    const client = tradeEvmClient({ endpoint });
    await assertTradeNetwork(client, network);
    const code = await client.getCode({
      address: getAddress(address),
      blockTag: "latest",
    });
    if (code === undefined || code === "0x") {
      return null;
    }
    if (!/^0xef0100[0-9a-fA-F]{40}$/u.test(code)) {
      throw new Error(
        "USDC signing requires a recognized EIP-7702 delegated embedded wallet."
      );
    }
    return { type: "erc1271" };
  };
