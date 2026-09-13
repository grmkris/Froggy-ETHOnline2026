/** Owner-authenticated reads and wallet creation; nothing here signs. */
import type { PrivyClient } from "@privy-io/node";

import type { UserWallet } from "./agent-signer";
import { PrivySignerRefusedError } from "./evm-signer";

export interface PaymentWallets {
  readonly ethereum: UserWallet | null;
  readonly solana: UserWallet | null;
}

export interface OwnerPaymentRequest {
  readonly accessToken: string;
  readonly did: string;
}

export const privyPaymentWallets = async (
  client: PrivyClient,
  did: string
): Promise<PaymentWallets> => {
  const user = await client.users()._get(did);
  let ethereum: UserWallet | null = null;
  let solana: UserWallet | null = null;
  for (const account of user.linked_accounts) {
    if (
      account.type !== "wallet" ||
      account.wallet_client !== "privy" ||
      account.id === null
    ) {
      continue;
    }
    if (account.chain_type === "ethereum" && ethereum === null) {
      ethereum = { address: account.address, id: account.id };
    }
    if (account.chain_type === "solana" && solana === null) {
      solana = { address: account.address, id: account.id };
    }
  }
  return { ethereum, solana };
};

const ownerWallets = async (
  client: PrivyClient,
  request: OwnerPaymentRequest
): Promise<PaymentWallets> => {
  const claims = await client
    .utils()
    .auth()
    .verifyAccessToken(request.accessToken);
  if (claims.user_id !== request.did) {
    throw new PrivySignerRefusedError(
      "The payment token does not belong to this workspace owner."
    );
  }
  return await privyPaymentWallets(client, request.did);
};

/** Called by the authenticated human route, never exposed to an agent tool. */
export const privyCreateSolanaWallet = async (
  client: PrivyClient,
  request: OwnerPaymentRequest
): Promise<UserWallet | null> => {
  const current = await ownerWallets(client, request);
  if (current.solana !== null) {
    return current.solana;
  }
  await client
    .users()
    .pregenerateWallets(request.did, { wallets: [{ chain_type: "solana" }] });
  const created = await privyPaymentWallets(client, request.did);
  return created.solana;
};
