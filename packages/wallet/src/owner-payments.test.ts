import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";

import { PrivyClient } from "@privy-io/node";

import { privyCreateSolanaWallet, privyPaymentWallets } from "./owner-payments";
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
      await privyCreateSolanaWallet(client, mismatch).then(() => null, String)
    ).toContain("workspace owner");
    expect(lookup).not.toHaveBeenCalled();
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

  test("stub mode never pretends to know a wallet or to have created one", async () => {
    const stub = stubPrivyServer();
    expect(await stub.paymentWallets(DID)).toEqual({
      ethereum: null,
      solana: null,
    });
    expect(await stub.createSolanaWallet(request)).toBeNull();
  });
});
