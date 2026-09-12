/** Owner credentials are used only after the human approves a bound purchase. */
import type { PrivyClient } from "@privy-io/node";
import { createSolanaKitSigner } from "@privy-io/node/solana-kit";
import { address } from "@solana/kit";
import type { TransactionPartialSigner } from "@solana/kit";

import type { UserWallet } from "./agent-signer";
import {
  privyOwnerSigner,
  privyOwnerTransactionSigner,
  PrivySignerRefusedError,
} from "./evm-signer";
import type {
  AgentEvmSigner,
  AgentTypedDataSigner,
  SignatureOptionsResolver,
} from "./evm-signer";

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

export const privyOwnerEvmSigner = async (
  client: PrivyClient,
  request: OwnerPaymentRequest,
  signatureOptionsFor?: SignatureOptionsResolver
): Promise<AgentTypedDataSigner | null> => {
  const { ethereum } = await ownerWallets(client, request);
  return ethereum === null
    ? null
    : privyOwnerSigner(client, {
        accessToken: request.accessToken,
        wallet: ethereum,
        signatureOptionsFor,
      });
};

export const privyOwnerSolanaSigner = async (
  client: PrivyClient,
  request: OwnerPaymentRequest
): Promise<TransactionPartialSigner | null> => {
  const { solana } = await ownerWallets(client, request);
  if (solana === null) {
    return null;
  }
  let signer: TransactionPartialSigner | null = createSolanaKitSigner(client, {
    address: address(solana.address),
    authorizationContext: { user_jwts: [request.accessToken] },
    walletId: solana.id,
  });
  const signerAddress = signer.address;
  return {
    address: signerAddress,
    signTransactions: async (transactions, config) => {
      if (signer === null || transactions.length !== 1) {
        throw new PrivySignerRefusedError(
          "An owner payment signer accepts one transaction exactly once."
        );
      }
      const current = signer;
      signer = null;
      return await current.signTransactions(transactions, config);
    },
  };
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

export const privyOwnerTradeSigner = async (
  client: PrivyClient,
  request: OwnerPaymentRequest
): Promise<Pick<AgentEvmSigner, "address" | "signTransaction"> | null> => {
  const { ethereum } = await ownerWallets(client, request);
  return ethereum === null
    ? null
    : privyOwnerTransactionSigner(client, {
        accessToken: request.accessToken,
        wallet: ethereum,
      });
};
