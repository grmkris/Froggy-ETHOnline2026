import type { TradeInput } from "@froggy/domain";
import {
  decodeAbiParameters,
  decodeFunctionData,
  encodeFunctionData,
  getAddress,
  hexToBytes,
  isHex,
  parseAbi,
  parseAbiParameters,
} from "viem";
import type { Hex } from "viem";

import type { EnsoRoute } from "./enso";

// Enso's Ethereum deployment: shortcuts-client-contracts/broadcast/EnsoRouterDeployer.s.sol/1/run-latest.json.
export const ENSO_ROUTER = "0xf75584ef6673ad213a685a1b58cc0330b8ea22cf";
const ROUTER = parseAbi([
  "function safeRouteSingle((uint8 tokenType, bytes data) tokenIn, (uint8 tokenType, bytes data) tokenOut, address receiver, bytes data) returns (bytes)",
]);
const SHORTCUT = parseAbi([
  "function executeShortcut(bytes32 accountId, bytes32 requestId, bytes32[] commands, bytes[] state) returns (bytes[])",
]);
const TOKEN_DATA = parseAbiParameters("address token, uint256 amount");
const CALLS = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function deposit(uint256 assets, address receiver) returns (uint256)",
  "function redeem(uint256 shares, address receiver, address owner) returns (uint256)",
  "function transfer(address receiver, uint256 amount) returns (bool)",
]);

type StateValue =
  | { readonly kind: "word"; readonly value: Hex }
  | { readonly kind: "proceeds" | "unknown" };
interface Command {
  readonly target: string;
  readonly selector: string;
  readonly args: readonly StateValue[];
  readonly output: number;
}
const reject = (): never => {
  throw new Error(
    "trade.instructions: Enso returned an unsupported or mismatched shortcut."
  );
};
const same = (first: string, second: string): boolean =>
  first.toLowerCase() === second.toLowerCase();
const word = (value: StateValue | undefined): Hex =>
  value?.kind === "word" && value.value.length === 66 ? value.value : reject();
const addressWord = (value: StateValue | undefined): string => {
  const encoded = word(value);
  if (!/^0x0{24}[a-fA-F0-9]{40}$/u.test(encoded)) {
    return reject();
  }
  return `0x${encoded.slice(26)}`;
};

/** Only static ABI words and ordinary CALL commands are accepted from Weiroll. */
const command = (encoded: Hex, state: readonly StateValue[]): Command => {
  const bytes = hexToBytes(encoded);
  if (bytes.length !== 32 || bytes[4] !== 1) {
    return reject();
  }
  const indices = bytes.slice(5, 11);
  const args: StateValue[] = [];
  let ended = false;
  for (const index of indices) {
    if (index === 255) {
      ended = true;
      continue;
    }
    const value = state[index];
    if (ended || index >= 128 || value === undefined) {
      return reject();
    }
    args.push(value);
  }
  const [output] = bytes.slice(11, 12);
  if (
    output === undefined ||
    (output !== 255 && (output >= 128 || output >= state.length))
  ) {
    return reject();
  }
  return {
    target: `0x${encoded.slice(26)}`,
    selector: encoded.slice(0, 10),
    args,
    output,
  };
};

const checkApproval = (call: Command, input: TradeInput): void => {
  if (
    !same(call.target, input.tokenIn) ||
    call.selector !== "0x095ea7b3" ||
    call.args.length !== 2 ||
    !same(addressWord(call.args[0]), input.position ?? "") ||
    BigInt(word(call.args[1])) !== BigInt(input.amount)
  ) {
    reject();
  }
};

const checkAction = (
  call: Command,
  input: TradeInput,
  shortcuts: string
): boolean => {
  const deposit = input.action === "deposit";
  if (
    !same(call.target, input.position ?? "") ||
    call.selector !== (deposit ? "0x6e553f65" : "0xba087652") ||
    call.args.length !== (deposit ? 2 : 3) ||
    BigInt(word(call.args[0])) !== BigInt(input.amount)
  ) {
    return reject();
  }
  const receiver = addressWord(call.args[1]);
  if (!same(receiver, input.wallet) && !same(receiver, shortcuts)) {
    return reject();
  }
  if (!deposit && !same(addressWord(call.args[2]), shortcuts)) {
    return reject();
  }
  return same(receiver, input.wallet);
};

const checkTransfer = (call: Command, input: TradeInput): void => {
  const [, amount] = call.args;
  if (
    !same(call.target, input.tokenOut) ||
    call.selector !== "0xa9059cbb" ||
    call.args.length !== 2 ||
    !same(addressWord(call.args[0]), input.wallet) ||
    amount?.kind !== "proceeds"
  ) {
    reject();
  }
};

const checkCommands = (
  input: TradeInput,
  shortcuts: string,
  encoded: Hex
): void => {
  const decoded = decodeFunctionData({ abi: SHORTCUT, data: encoded });
  if (
    encodeFunctionData({ abi: SHORTCUT, ...decoded }).toLowerCase() !==
    encoded.toLowerCase()
  ) {
    reject();
  }
  const { 2: commands, 3: initial } = decoded.args;
  if (
    commands.length === 0 ||
    commands.length > 3 ||
    initial.length > 32 ||
    initial.some((value) => value.length !== 66)
  ) {
    reject();
  }
  const state: StateValue[] = initial.map((value) => ({ kind: "word", value }));
  let action = false;
  let delivered = false;
  let approved = input.action === "withdraw";
  for (const encodedCommand of commands) {
    const call = command(encodedCommand, state);
    let returned: StateValue = { kind: "unknown" };
    if (!approved) {
      checkApproval(call, input);
      approved = true;
    } else if (!action) {
      delivered = checkAction(call, input, shortcuts);
      returned = { kind: "proceeds" };
      action = true;
    } else if (delivered) {
      reject();
    } else {
      checkTransfer(call, input);
      delivered = true;
    }
    if (call.output !== 255) {
      state[call.output] = returned;
    }
  }
  if (!action || !delivered) {
    reject();
  }
};

const checkPreTransactions = (input: TradeInput, route: EnsoRoute): void => {
  for (const transaction of route.preTransactions ?? []) {
    const approval = encodeFunctionData({
      abi: CALLS,
      functionName: "approve",
      args: [getAddress(ENSO_ROUTER), BigInt(input.amount)],
    });
    if (
      transaction.type !== "tokenApproval" ||
      !same(transaction.tx.to, input.tokenIn) ||
      !same(transaction.tx.from, input.wallet) ||
      transaction.tx.value !== "0" ||
      !same(transaction.tx.data, approval)
    ) {
      reject();
    }
  }
};

/** The outer minimum protects proceeds; every nested call is checked independently. */
export const validateEnsoRoute = (
  input: TradeInput,
  route: EnsoRoute,
  shortcuts: string
): void => {
  if (
    input.network !== "eip155:1" ||
    input.position === null ||
    !["deposit", "withdraw"].includes(input.action) ||
    !same(route.tx.to, ENSO_ROUTER) ||
    !same(route.tx.from, input.wallet) ||
    route.tx.value !== "0"
  ) {
    reject();
  }
  const { data } = route.tx;
  if (!isHex(data)) {
    return reject();
  }
  const decoded = decodeFunctionData({ abi: ROUTER, data });
  if (
    encodeFunctionData({ abi: ROUTER, ...decoded }).toLowerCase() !==
    data.toLowerCase()
  ) {
    reject();
  }
  const [tokenIn, tokenOut, receiver, shortcut] = decoded.args;
  if (
    tokenIn.tokenType !== 1 ||
    tokenOut.tokenType !== 1 ||
    !same(receiver, input.wallet) ||
    tokenIn.data.length !== 130 ||
    tokenOut.data.length !== 130
  ) {
    reject();
  }
  const [assetIn, amountIn] = decodeAbiParameters(TOKEN_DATA, tokenIn.data);
  const [assetOut, minimum] = decodeAbiParameters(TOKEN_DATA, tokenOut.data);
  if (
    !same(assetIn, input.tokenIn) ||
    !same(assetOut, input.tokenOut) ||
    amountIn !== BigInt(input.amount) ||
    minimum !== BigInt(route.minAmountOut)
  ) {
    reject();
  }
  checkCommands(input, shortcuts, shortcut);
  checkPreTransactions(input, route);
};
