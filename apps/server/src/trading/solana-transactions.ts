import type { TradePayload } from "@froggy/domain";
import {
  AccountState,
  getMintDecoder,
  getTokenDecoder,
  TOKEN_2022_PROGRAM_ADDRESS,
} from "@solana-program/token-2022";
import {
  address,
  assertIsTransactionWithinSizeLimit,
  blockhash,
  getAddressDecoder,
  getAddressEncoder,
  getBase58Decoder,
  getCompiledTransactionMessageDecoder,
  getProgramDerivedAddress,
  getTransactionDecoder,
  getTransactionEncoder,
  isNone,
} from "@solana/kit";
import type { TransactionPartialSigner } from "@solana/kit";

import type { SolanaTradeAccount, SolanaTradeRpc } from "./solana-chain";

// Solana program source and Jupiter's idls/jupiter_aggregator_v6.json, checked 2026-09-08.
export const SOLANA_PROGRAMS = {
  system: "11111111111111111111111111111111",
  token: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  associated: "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
  compute: "ComputeBudget111111111111111111111111111111",
  lookup: "AddressLookupTab1e1111111111111111111111111",
  jupiter: "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",
} as const;

export const solanaAssociatedAccount = async (
  wallet: string,
  mint: string,
  tokenProgram: string = SOLANA_PROGRAMS.token
): Promise<string> => {
  const encoder = getAddressEncoder();
  const [account] = await getProgramDerivedAddress({
    programAddress: address(SOLANA_PROGRAMS.associated),
    seeds: [
      encoder.encode(address(wallet)),
      encoder.encode(address(tokenProgram)),
      encoder.encode(address(mint)),
    ],
  });
  return account;
};

export const decodeSolanaTrade = (serialized: string, wallet: string) => {
  const bytes = Buffer.from(serialized, "base64");
  if (bytes.toString("base64") !== serialized || bytes.length > 1232) {
    throw new Error(
      "trade.payload: invalid Solana transaction encoding or size."
    );
  }
  const transaction = getTransactionDecoder().decode(bytes);
  const compiled = getCompiledTransactionMessageDecoder().decode(
    transaction.messageBytes
  );
  if (
    !Buffer.from(getTransactionEncoder().encode(transaction)).equals(bytes) ||
    compiled.version !== 0 ||
    compiled.header.numSignerAccounts !== 1 ||
    compiled.header.numReadonlySignerAccounts !== 0 ||
    compiled.staticAccounts[0] !== wallet ||
    Object.keys(transaction.signatures).length !== 1 ||
    !Object.hasOwn(transaction.signatures, wallet) ||
    compiled.instructions.length > 12
  ) {
    throw new Error(
      "trade.signer: Solana execution requires a canonical v0 transaction with the owner as its only signer and fee payer."
    );
  }
  return { transaction, compiled };
};

export interface SolanaTradeInstruction {
  readonly program: string;
  readonly accounts: readonly string[];
  readonly data: Buffer;
}

const lookupBytes = (
  account: SolanaTradeAccount | null | undefined,
  slot: number
): Buffer => {
  if (
    account === null ||
    account === undefined ||
    account.owner !== SOLANA_PROGRAMS.lookup ||
    account.executable
  ) {
    throw new Error(
      "trade.lookup: an address table has the wrong owner or is missing."
    );
  }
  const bytes = Buffer.from(account.data[0], "base64");
  if (
    bytes.length < 56 ||
    (bytes.length - 56) % 32 !== 0 ||
    bytes.readUInt32LE(0) !== 1 ||
    bytes.readBigUInt64LE(4) !== 2n ** 64n - 1n ||
    bytes.readBigUInt64LE(12) >= BigInt(slot)
  ) {
    throw new Error(
      "trade.lookup: inactive or recently extended address table."
    );
  }
  return bytes;
};

export const resolveSolanaTrade = async (
  rpc: SolanaTradeRpc,
  serialized: string,
  wallet: string
) => {
  const decoded = decodeSolanaTrade(serialized, wallet);
  const { compiled } = decoded;
  const lookups = compiled.addressTableLookups ?? [];
  if (lookups.length > 4) {
    throw new Error("trade.lookup: too many address tables.");
  }
  const response =
    lookups.length === 0
      ? null
      : await rpc.accounts(lookups.map((lookup) => lookup.lookupTableAddress));
  const writable: string[] = [];
  const readonly: string[] = [];
  for (const [index, lookup] of lookups.entries()) {
    const account = response?.value[index];
    const bytes = lookupBytes(account, response?.context.slot ?? 0);
    const read = (position: number): string => {
      const offset = 56 + position * 32;
      if (offset + 32 > bytes.length) {
        throw new Error("trade.lookup: address table index is out of bounds.");
      }
      return getAddressDecoder().decode(bytes.subarray(offset, offset + 32));
    };
    writable.push(...lookup.writableIndexes.map(read));
    readonly.push(...lookup.readonlyIndexes.map(read));
  }
  const accounts: readonly string[] = [
    ...compiled.staticAccounts,
    ...writable,
    ...readonly,
  ];
  if (accounts.length > 64 || new Set(accounts).size !== accounts.length) {
    throw new Error("trade.accounts: duplicate or excessive Solana accounts.");
  }
  const instructions: readonly SolanaTradeInstruction[] =
    compiled.instructions.map((instruction) => {
      const program = accounts[instruction.programAddressIndex];
      if (program === undefined) {
        throw new Error("trade.program: invalid program index.");
      }
      return {
        program,
        data: Buffer.from(instruction.data ?? []),
        accounts: (instruction.accountIndices ?? []).map((index) => {
          const account = accounts[index];
          if (account === undefined) {
            throw new Error(
              "trade.accounts: invalid instruction account index."
            );
          }
          return account;
        }),
      };
    });
  const staticWritable = compiled.staticAccounts.slice(
    0,
    compiled.staticAccounts.length -
      compiled.header.numReadonlyNonSignerAccounts
  );
  return {
    ...decoded,
    accounts,
    writable: [...staticWritable, ...writable],
    instructions,
    minimumSlot: response?.context.slot ?? 0,
  };
};
export type ResolvedSolanaTrade = Awaited<
  ReturnType<typeof resolveSolanaTrade>
>;

/** Metadata may change presentation; transfer hooks, fees and delegates may change the spend. */
export const solanaMintProgram = (
  account: SolanaTradeAccount | null
): string => {
  if (
    account === null ||
    account.executable ||
    ![SOLANA_PROGRAMS.token, TOKEN_2022_PROGRAM_ADDRESS].some(
      (program) => program === account.owner
    )
  ) {
    throw new Error("trade.mint: the token mint has an unsupported owner.");
  }
  const bytes = Buffer.from(account.data[0], "base64");
  if (
    bytes.length > 8192 ||
    (account.owner === SOLANA_PROGRAMS.token
      ? bytes.length !== 82
      : bytes.length !== 82 && (bytes.length < 166 || bytes[165] !== 1))
  ) {
    throw new Error("trade.mint: unsupported mint account layout.");
  }
  const mint = getMintDecoder().decode(bytes);
  const extensions = isNone(mint.extensions) ? [] : mint.extensions.value;
  if (
    !mint.isInitialized ||
    !isNone(mint.mintAuthority) ||
    !isNone(mint.freezeAuthority) ||
    extensions.some(
      (extension) =>
        !["MetadataPointer", "TokenMetadata"].includes(extension.__kind)
    )
  ) {
    throw new Error(
      "trade.mint: only fixed-supply, unfrozen tokens with metadata-only extensions are supported."
    );
  }
  return account.owner;
};

const extendedTokenBalance = (
  bytes: Buffer,
  wallet: string,
  mint: string
): bigint => {
  if (
    bytes.length !== 165 &&
    (bytes.length < 166 || bytes.length > 256 || bytes[165] !== 2)
  ) {
    throw new Error(
      "trade.token_account: unsupported Token-2022 account layout."
    );
  }
  const token = getTokenDecoder().decode(bytes);
  const extensions = isNone(token.extensions) ? [] : token.extensions.value;
  if (
    token.owner !== wallet ||
    token.mint !== mint ||
    token.state !== AccountState.Initialized ||
    !isNone(token.delegate) ||
    !isNone(token.closeAuthority) ||
    extensions.some((extension) => extension.__kind !== "ImmutableOwner")
  ) {
    throw new Error(
      "trade.token_account: Token-2022 account authority or transfer restrictions are unsupported."
    );
  }
  return token.amount;
};

export const solanaTokenAccount = (
  account: SolanaTradeAccount | null,
  wallet: string,
  mint: string,
  tokenProgram: string = SOLANA_PROGRAMS.token
): bigint => {
  if (account === null) {
    return 0n;
  }
  const bytes = Buffer.from(account.data[0], "base64");
  if (
    tokenProgram === TOKEN_2022_PROGRAM_ADDRESS &&
    account.owner === tokenProgram &&
    !account.executable
  ) {
    return extendedTokenBalance(bytes, wallet, mint);
  }
  const decoder = getAddressDecoder();
  if (
    account.owner !== SOLANA_PROGRAMS.token ||
    tokenProgram !== SOLANA_PROGRAMS.token ||
    account.executable ||
    bytes.length !== 165 ||
    decoder.decode(bytes.subarray(0, 32)) !== mint ||
    decoder.decode(bytes.subarray(32, 64)) !== wallet ||
    bytes[108] !== 1 ||
    bytes.readUInt32LE(72) !== 0 ||
    bytes.readUInt32LE(129) !== 0
  ) {
    throw new Error(
      "trade.token_account: only initialized, owner-controlled legacy SPL accounts without delegates are supported."
    );
  }
  return bytes.readBigUInt64LE(64);
};

export const verifySignedSolanaTrade = async (
  wallet: string,
  unsigned: string,
  signed: string
) => {
  const original = decodeSolanaTrade(unsigned, wallet);
  const result = decodeSolanaTrade(signed, wallet);
  const signature = result.transaction.signatures[address(wallet)];
  if (
    !Buffer.from(original.transaction.messageBytes).equals(
      Buffer.from(result.transaction.messageBytes)
    ) ||
    signature === null ||
    signature === undefined
  ) {
    throw new Error(
      "trade.signature: signed Solana message differs from the approved transaction."
    );
  }
  const key = await crypto.subtle.importKey(
    "raw",
    Buffer.from(getAddressEncoder().encode(address(wallet))),
    "Ed25519",
    false,
    ["verify"]
  );
  if (
    !(await crypto.subtle.verify(
      "Ed25519",
      key,
      Buffer.from(signature),
      Buffer.from(result.transaction.messageBytes)
    ))
  ) {
    throw new Error("trade.signature: Solana owner signature is invalid.");
  }
  return {
    payload: signed,
    transactionId: getBase58Decoder().decode(signature),
  };
};

export const signSolanaTrade = async (
  signer: TransactionPartialSigner,
  payload: Extract<TradePayload, { kind: "solana" }>
) => {
  const decoded = decodeSolanaTrade(payload.transaction, signer.address);
  const transaction = {
    ...decoded.transaction,
    lifetimeConstraint: {
      blockhash: blockhash(decoded.compiled.lifetimeToken),
      lastValidBlockHeight: BigInt(payload.lastValidBlockHeight),
    },
  };
  assertIsTransactionWithinSizeLimit(transaction);
  const replies = await signer.signTransactions([transaction]);
  const [signatures] = replies;
  if (
    replies.length !== 1 ||
    signatures === undefined ||
    Object.keys(signatures).length !== 1 ||
    !Object.hasOwn(signatures, signer.address)
  ) {
    throw new Error(
      "trade.signature: unexpected Solana signers in the wallet reply."
    );
  }
  const signed = Buffer.from(
    getTransactionEncoder().encode({
      ...transaction,
      signatures: { ...transaction.signatures, ...signatures },
    })
  ).toString("base64");
  return await verifySignedSolanaTrade(
    signer.address,
    payload.transaction,
    signed
  );
};
