import { expect, test } from "bun:test";

import {
  AccountState,
  getMintEncoder,
  getTokenEncoder,
  TOKEN_2022_PROGRAM_ADDRESS,
} from "@solana-program/token-2022";
import type { ExtensionArgs, TokenArgs } from "@solana-program/token-2022";
import { address } from "@solana/kit";
import type { ReadonlyUint8Array } from "@solana/kit";

import type { SolanaTradeAccount } from "./solana-chain";
import { solanaMintProgram, solanaTokenAccount } from "./solana-transactions";

const owner = address("11111111111111111111111111111111");
const mint = address("So11111111111111111111111111111111111111112");
const account = (bytes: ReadonlyUint8Array): SolanaTradeAccount => ({
  data: [Buffer.from(bytes).toString("base64"), "base64"],
  owner: TOKEN_2022_PROGRAM_ADDRESS,
  lamports: 2_000_000,
  executable: false,
});
const encodedMint = (extensions: ExtensionArgs[]) =>
  account(
    getMintEncoder().encode({
      mintAuthority: null,
      supply: 1000n,
      decimals: 6,
      isInitialized: true,
      freezeAuthority: null,
      extensions,
    })
  );

test("native mint validation accepts metadata but refuses hooks and permanent transfer authority", () => {
  expect(
    solanaMintProgram(
      encodedMint([
        { __kind: "MetadataPointer", authority: null, metadataAddress: mint },
      ])
    )
  ).toBe(TOKEN_2022_PROGRAM_ADDRESS);
  for (const extension of [
    { __kind: "TransferHook", authority: owner, programId: owner },
    { __kind: "PermanentDelegate", delegate: owner },
    { __kind: "NonTransferable" },
  ] satisfies ExtensionArgs[]) {
    expect(() => solanaMintProgram(encodedMint([extension]))).toThrow(
      "trade.mint"
    );
  }
});

test("Token-2022 balances reject delegates, frozen accounts, close authority and transfer extensions", () => {
  const input: TokenArgs = {
    mint,
    owner,
    amount: 123n,
    delegate: null,
    state: AccountState.Initialized,
    isNative: null,
    delegatedAmount: 0n,
    closeAuthority: null,
    extensions: [{ __kind: "ImmutableOwner" }],
  };
  const balance = (value: TokenArgs) =>
    solanaTokenAccount(
      account(getTokenEncoder().encode(value)),
      owner,
      mint,
      TOKEN_2022_PROGRAM_ADDRESS
    );
  expect(balance(input)).toBe(123n);
  for (const change of [
    { delegate: owner },
    { closeAuthority: owner },
    { state: AccountState.Frozen },
    { extensions: [{ __kind: "TransferHookAccount", transferring: false }] },
  ] satisfies Partial<TokenArgs>[]) {
    expect(() => balance({ ...input, ...change })).toThrow(
      "trade.token_account"
    );
  }
});
