import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";

import { PrivyClient } from "@privy-io/node";
import {
  address,
  blockhash,
  compileTransaction,
  createTransactionMessage,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
} from "@solana/kit";

import {
  privyCreateSolanaWallet,
  privyOwnerEvmSigner,
  privyOwnerTradeSigner,
  privyOwnerSolanaSigner,
  privyPaymentWallets,
} from "./owner-payments";
import { stubPrivyServer } from "./privy";

const DID = "did:privy:owner";
const SOLANA_ADDRESS = "11111111111111111111111111111111";
const ETHEREUM_ADDRESS = "0x1111111111111111111111111111111111111111";
const request = { accessToken: "test-owner-token", did: DID };
const embedded = (chain: string, walletAddress: string, id: string) => ({
  address: walletAddress,
  chain_type: chain,
  id,
  type: "wallet",
  wallet_client: "privy",
});

const clientWith = (accounts: readonly unknown[]) => {
  const client = new PrivyClient({
    appId: "test-app",
    appSecret: "test-secret",
    fetch: async () =>
      await Promise.resolve(
        Response.json({ id: DID, linked_accounts: accounts })
      ),
  });
  spyOn(client.utils().auth(), "verifyAccessToken").mockResolvedValue({
    app_id: "test-app",
    issuer: "privy.io",
    issued_at: 1,
    expiration: 9_999_999_999,
    session_id: "test-session",
    user_id: DID,
  });
  return client;
};

afterEach(() => {
  mock.restore();
});

describe("owner payment wallets", () => {
  test("resolves embedded wallets by chain and ignores externally linked accounts", async () => {
    const client = clientWith([
      {
        ...embedded("ethereum", "external-address", "external-id"),
        wallet_client: "metamask",
      },
      embedded("solana", SOLANA_ADDRESS, "solana-id"),
      embedded("ethereum", ETHEREUM_ADDRESS, "ethereum-id"),
    ]);
    expect(await privyPaymentWallets(client, DID)).toEqual({
      ethereum: { address: ETHEREUM_ADDRESS, id: "ethereum-id" },
      solana: { address: SOLANA_ADDRESS, id: "solana-id" },
    });
  });

  test("rejects another owner's token before looking up or creating a wallet", async () => {
    const client = clientWith([]);
    const lookup = spyOn(client.users(), "_get");
    const mismatch = { ...request, did: "did:privy:someone-else" };
    expect(
      await privyOwnerEvmSigner(client, mismatch).then(() => null, String)
    ).toContain("workspace owner");
    expect(
      await privyOwnerSolanaSigner(client, mismatch).then(() => null, String)
    ).toContain("workspace owner");
    expect(
      await privyCreateSolanaWallet(client, mismatch).then(() => null, String)
    ).toContain("workspace owner");
    expect(lookup).not.toHaveBeenCalled();
  });

  test("trade signing verifies the owner and consumes authority before a failed RPC", async () => {
    const client = clientWith([
      embedded("ethereum", ETHEREUM_ADDRESS, "ethereum-id"),
    ]);
    const sign = spyOn(
      client.wallets().ethereum(),
      "signTransaction"
    ).mockRejectedValue(new Error("transport lost"));
    expect(
      await privyOwnerTradeSigner(client, {
        ...request,
        did: "did:privy:other",
      }).then(() => null, String)
    ).toContain("workspace owner");
    expect(sign).not.toHaveBeenCalled();
    const signer = await privyOwnerTradeSigner(client, request);
    if (signer === null) {
      throw new Error("Missing signer");
    }
    const transaction = {
      chainId: 8453,
      to: ETHEREUM_ADDRESS,
      data: "0x1234",
      gasLimit: 50_000n,
      maxFeePerGas: 20n,
      maxPriorityFeePerGas: 1n,
      nonce: 7,
      value: 0n,
    };
    expect(
      await signer.signTransaction(transaction).then(() => null, String)
    ).toContain("did not return");
    expect(
      await signer.signTransaction(transaction).then(() => null, String)
    ).toContain("already been used");
    expect(sign).toHaveBeenCalledTimes(1);
    expect(sign).toHaveBeenCalledWith("ethereum-id", {
      authorization_context: { user_jwts: [request.accessToken] },
      params: {
        transaction: {
          chain_id: 8453,
          to: ETHEREUM_ADDRESS,
          data: "0x1234",
          gas_limit: "0xc350",
          max_fee_per_gas: "0x14",
          max_priority_fee_per_gas: "0x1",
          nonce: 7,
          type: 2,
          value: "0x0",
        },
      },
    });
  });

  test("uses only the owner's token and consumes EVM authority before the RPC", async () => {
    const client = clientWith([
      embedded("ethereum", ETHEREUM_ADDRESS, "ethereum-id"),
    ]);
    const sign = spyOn(
      client.wallets().ethereum(),
      "signTypedData"
    ).mockResolvedValue({ encoding: "hex", signature: "0x1234" });
    const signer = await privyOwnerEvmSigner(client, request);
    const typedData = {
      domain: { chainId: 8453 },
      message: { value: 10_000n },
      primaryType: "TransferWithAuthorization",
      types: {},
    };
    expect(await signer?.signTypedData(typedData)).toBe("0x1234");
    expect(sign).toHaveBeenCalledWith("ethereum-id", {
      authorization_context: { user_jwts: [request.accessToken] },
      signature_options: { type: "ecdsa" },
      params: {
        typed_data: {
          domain: { chainId: 8453 },
          message: { value: "10000" },
          primary_type: "TransferWithAuthorization",
          types: {},
        },
      },
    });
    expect(
      await signer?.signTypedData(typedData).then(() => null, String)
    ).toContain("already been used");
    expect(sign).toHaveBeenCalledTimes(1);
  });

  test("returns null for absent wallets and never offers send authority for Solana", async () => {
    expect(await privyOwnerEvmSigner(clientWith([]), request)).toBeNull();
    const client = clientWith([
      embedded("solana", SOLANA_ADDRESS, "solana-id"),
    ]);
    const signer = await privyOwnerSolanaSigner(client, request);
    expect(signer?.address).toBe(address(SOLANA_ADDRESS));
    expect(signer).not.toHaveProperty("signAndSendTransactions");
    expect(
      await signer?.signTransactions([]).then(() => null, String)
    ).toContain("one transaction");
  });

  test("Solana signing forwards only the owner token and cannot retry after refusal", async () => {
    const client = clientWith([
      embedded("solana", SOLANA_ADDRESS, "solana-id"),
    ]);
    const sign = spyOn(
      client.wallets().solana(),
      "signTransaction"
    ).mockRejectedValue(new Error("Privy refused this transaction"));
    const signer = await privyOwnerSolanaSigner(client, request);
    const transaction = pipe(
      createTransactionMessage({ version: 0 }),
      (message) =>
        setTransactionMessageFeePayer(address(SOLANA_ADDRESS), message),
      (message) =>
        setTransactionMessageLifetimeUsingBlockhash(
          { blockhash: blockhash(SOLANA_ADDRESS), lastValidBlockHeight: 1000n },
          message
        ),
      compileTransaction
    );
    expect(
      await signer?.signTransactions([transaction]).then(() => null, String)
    ).toContain("Privy refused");
    expect(sign.mock.calls[0]?.[0]).toBe("solana-id");
    expect(sign.mock.calls[0]?.[1].authorization_context).toEqual({
      user_jwts: [request.accessToken],
    });
    expect(
      await signer?.signTransactions([transaction]).then(() => null, String)
    ).toContain("exactly once");
    expect(sign).toHaveBeenCalledTimes(1);
  });

  test("wallet creation is idempotent when a linked Solana wallet already exists", async () => {
    const client = clientWith([
      embedded("solana", SOLANA_ADDRESS, "solana-id"),
    ]);
    const create = spyOn(client.users(), "pregenerateWallets");
    expect(await privyCreateSolanaWallet(client, request)).toEqual({
      address: SOLANA_ADDRESS,
      id: "solana-id",
    });
    expect(create).not.toHaveBeenCalled();
  });

  test("stub mode never pretends to offer owner signing or a created wallet", async () => {
    const stub = stubPrivyServer();
    expect(await stub.paymentWallets(DID)).toEqual({
      ethereum: null,
      solana: null,
    });
    expect(await stub.ownerEvmSigner(request)).toBeNull();
    expect(await stub.ownerSolanaSigner(request)).toBeNull();
    expect(await stub.createSolanaWallet(request)).toBeNull();
  });
});
