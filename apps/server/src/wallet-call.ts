/**
 * What a page asked the injected wallet, as a classified call.
 *
 * The provider already refused methods we do not list. This file turns the
 * remaining params into a payload the coordinator can store, or into an
 * EIP-1193 error the page already understands. Nothing here talks to Privy
 * or the person.
 */

import { EvmAddress } from "@froggy/domain";
import type { WalletRequestPayload } from "@froggy/domain";
import type { BrowserWalletCall } from "@froggy/protocol";
import { Result, Schema } from "effect";

export const WALLET_USER_REJECTED = 4001;
export const WALLET_UNSUPPORTED = 4200;
export const WALLET_UNRECOGNIZED_CHAIN = 4902;
export const WALLET_INVALID_PARAMS = -32_602;
export const WALLET_INTERNAL = -32_603;
export const WALLET_PENDING = -32_002;

const TxFields = Schema.Struct({
  data: Schema.optionalKey(Schema.String),
  from: Schema.optionalKey(Schema.String),
  to: Schema.optionalKey(Schema.NullOr(Schema.String)),
  value: Schema.optionalKey(Schema.String),
});
const SwitchFields = Schema.Struct({
  chainId: Schema.String,
});
const decodeTx = Schema.decodeUnknownResult(TxFields);
const decodeSwitch = Schema.decodeUnknownResult(SwitchFields);
const decodeAddress = Schema.decodeUnknownResult(EvmAddress);
const isString = Schema.is(Schema.String);

export type ClassifiedWalletCall =
  | { readonly tag: "accounts" }
  | { readonly tag: "chainId" }
  | { readonly tag: "connect" }
  | { readonly tag: "getPermissions" }
  | { readonly tag: "netVersion" }
  | {
      readonly tag: "read";
      readonly method: string;
      readonly params: BrowserWalletCall["params"];
    }
  | { readonly tag: "revoke" }
  | {
      readonly tag: "reject";
      readonly code: number;
      readonly message: string;
    }
  | { readonly tag: "sign"; readonly payload: WalletRequestPayload }
  | { readonly tag: "switch"; readonly chainIdHex: string };

const rejected = (code: number, message: string): ClassifiedWalletCall => ({
  code,
  message,
  tag: "reject",
});

const asAddress = (value: string): EvmAddress | null => {
  const decoded = decodeAddress(value);
  return Result.isSuccess(decoded) ? decoded.success : null;
};

const hexMessage = (raw: string): string | null => {
  if (/^0x(?:[0-9a-fA-F]{2})*$/u.test(raw)) {
    return raw;
  }
  return `0x${Buffer.from(raw, "utf-8").toString("hex")}`;
};

const transactionPayload = (
  params: BrowserWalletCall["params"]
): ClassifiedWalletCall => {
  const decoded = decodeTx(params[0]);
  if (Result.isFailure(decoded)) {
    return rejected(
      WALLET_INVALID_PARAMS,
      "That transaction was not an object."
    );
  }
  const from = asAddress(decoded.success.from ?? "");
  if (from === null) {
    return rejected(
      WALLET_INVALID_PARAMS,
      "The transaction needs a from address."
    );
  }
  const toRaw = decoded.success.to;
  const to =
    toRaw === undefined || toRaw === null || toRaw === ""
      ? null
      : asAddress(toRaw);
  if (toRaw !== undefined && toRaw !== null && toRaw !== "" && to === null) {
    return rejected(
      WALLET_INVALID_PARAMS,
      "The transaction to-address is not valid."
    );
  }
  const value = decoded.success.value ?? "0x0";
  const data = decoded.success.data ?? "0x";
  if (!/^0x[0-9a-fA-F]{1,64}$/u.test(value)) {
    return rejected(WALLET_INVALID_PARAMS, "The transaction value is not hex.");
  }
  if (!/^0x(?:[0-9a-fA-F]{2})*$/u.test(data)) {
    return rejected(WALLET_INVALID_PARAMS, "The transaction data is not hex.");
  }
  return {
    payload: { data, from, kind: "send_transaction", to, value },
    tag: "sign",
  };
};

const messagePayload = (
  params: BrowserWalletCall["params"]
): ClassifiedWalletCall => {
  const [first, second] = params;
  if (!isString(first) || !isString(second)) {
    return rejected(
      WALLET_INVALID_PARAMS,
      "personal_sign needs a message and an address."
    );
  }
  const firstAddress = asAddress(first);
  const messageRaw = firstAddress === null ? first : second;
  const addressRaw = firstAddress === null ? second : first;
  const address = asAddress(addressRaw);
  const message = hexMessage(messageRaw);
  if (address === null || message === null) {
    return rejected(
      WALLET_INVALID_PARAMS,
      "personal_sign needs a hex message and an address."
    );
  }
  return {
    payload: { address, kind: "personal_sign", message },
    tag: "sign",
  };
};

const typedPayload = (
  params: BrowserWalletCall["params"]
): ClassifiedWalletCall => {
  const [addressRaw, document] = params;
  if (!isString(addressRaw)) {
    return rejected(
      WALLET_INVALID_PARAMS,
      "eth_signTypedData_v4 needs an address."
    );
  }
  const address = asAddress(addressRaw);
  if (address === null) {
    return rejected(
      WALLET_INVALID_PARAMS,
      "eth_signTypedData_v4 needs a valid address."
    );
  }
  const typedData = isString(document) ? document : JSON.stringify(document);
  if (typedData.length < 2) {
    return rejected(
      WALLET_INVALID_PARAMS,
      "eth_signTypedData_v4 needs a document."
    );
  }
  return {
    payload: { address, kind: "sign_typed_data_v4", typedData },
    tag: "sign",
  };
};

const switchChain = (
  params: BrowserWalletCall["params"]
): ClassifiedWalletCall => {
  const decoded = decodeSwitch(params[0]);
  if (Result.isFailure(decoded)) {
    return rejected(
      WALLET_INVALID_PARAMS,
      "wallet_switchEthereumChain needs a chainId."
    );
  }
  return { chainIdHex: decoded.success.chainId.toLowerCase(), tag: "switch" };
};

/** Classify one provider call the bridge already accepted as a listed method. */
export const classifyWalletCall = (
  call: BrowserWalletCall
): ClassifiedWalletCall => {
  const { method } = call;
  switch (method) {
    case "eth_blockNumber":
    case "eth_call":
    case "eth_estimateGas":
    case "eth_feeHistory":
    case "eth_gasPrice":
    case "eth_getBalance":
    case "eth_getBlockByNumber":
    case "eth_getCode":
    case "eth_getTransactionByHash":
    case "eth_getTransactionCount":
    case "eth_getTransactionReceipt":
    case "eth_maxPriorityFeePerGas": {
      return { method, params: call.params, tag: "read" };
    }
    case "eth_chainId": {
      return { tag: "chainId" };
    }
    case "net_version": {
      return { tag: "netVersion" };
    }
    case "eth_accounts": {
      return { tag: "accounts" };
    }
    case "wallet_getPermissions": {
      return { tag: "getPermissions" };
    }
    case "eth_requestAccounts":
    case "wallet_requestPermissions": {
      return { tag: "connect" };
    }
    case "wallet_revokePermissions": {
      return { tag: "revoke" };
    }
    case "wallet_switchEthereumChain":
    case "wallet_addEthereumChain": {
      return switchChain(call.params);
    }
    case "eth_sendTransaction": {
      return transactionPayload(call.params);
    }
    case "personal_sign": {
      return messagePayload(call.params);
    }
    case "eth_signTypedData_v4": {
      return typedPayload(call.params);
    }
  }
  return rejected(WALLET_UNSUPPORTED, "That method is not supported.");
};

export const chainIdHex = (chainId: number): string =>
  `0x${chainId.toString(16)}`;
