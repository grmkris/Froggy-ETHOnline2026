/**
 * Granting the agent a signature on a wallet the user owns.
 *
 * This is the shape the whole product turns on, so it is worth being precise
 * about who holds what:
 *
 *   - Privy mints the wallet **at login**, owned by the user's own key quorum.
 *     We never see its key and cannot move funds with the app secret alone.
 *   - We then ask to be added as an **additional signer**, under a policy that
 *     is default-deny. That request has to be authorized by the wallet's
 *     current owner — the user — which is why it carries their access token
 *     rather than only our app secret. The user is granting, not us taking.
 *   - Freezing removes the signer. It is a revocation at Privy, not a boolean
 *     in our database that our own code has to remember to check.
 *
 * The policy allows exactly what `docs/privy-agent-policy.json` says and
 * nothing else: today an EIP-712 `TransferWithAuthorization` to the Graph's
 * x402 payee in Base mainnet USDC at most $0.02, and a capped USDC transfer to
 * the treasury on Base Sepolia. Every other method — another transfer, a
 * `personal_sign`, a key export — is denied by Privy itself, in a process we
 * do not run. That is the difference between a leash and a promise.
 */

import { generateAuthorizationSignatures } from "@privy-io/node";
import type { PrivyClient } from "@privy-io/node";

/** Everything needed to act as the agent. All three, or the feature is off. */
export interface AgentKey {
  /** `PRIVY_AGENT_POLICY_ID`. The committed default-deny policy. */
  readonly policyId: string;
  /** `PRIVY_AUTHORIZATION_PRIVATE_KEY`. Base64 PKCS8, P-256. Never logged. */
  readonly privateKey: string;
  /** `PRIVY_AUTHORIZATION_KEY_ID`. The key quorum holding the public half. */
  readonly quorumId: string;
}

export interface UserWallet {
  readonly address: string;
  readonly id: string;
}

/**
 * The outcome of asking for, or giving up, a signature.
 *
 * `reason` is filled on every unhappy path and shown to the user. "Sign-in
 * worked but the agent cannot pay" is the single most confusing state this
 * system can be in, and an empty pane is the worst way to communicate it.
 */
export interface AgentGrant {
  readonly attached: boolean;
  /**
   * The policies the agent's signer is actually held to on this wallet, read
   * back from Privy rather than assumed from what we asked for.
   *
   * Empty when nothing is attached. It is read rather than remembered because
   * the person can also grant from the browser, where Privy asks them directly
   * and this process never sees it — and because the answer to "whose rules is
   * the agent under" has to come from the side that enforces them. The caller
   * compares this against the person's own policy id to tell a signer under
   * their rules from one still under the app-wide policy.
   */
  readonly policyIds: readonly string[];
  readonly reason: string | null;
  readonly wallet: UserWallet | null;
}

const PRIVY_API = "https://api.privy.io";

/** Requests expire in a minute. Long enough for a retry, short enough to matter. */
const REQUEST_TTL_MS = 60_000;

/**
 * What went wrong, as a sentence the user can read.
 *
 * Takes `Error` because that is what the SDK and `fetch` throw, and a `catch`
 * binding that is anything else is a programmer error rather than input to
 * parse — the callers narrow before calling.
 */
const describe = (error: Error): string => error.message;

/**
 * The user's embedded wallet, from their DID.
 *
 * Read with the app secret rather than an identity token, so the client never
 * has to send a second credential. The DID came from a verified access token
 * one hop earlier, so this is not a lookup on unvalidated input.
 */
const embeddedWalletFor = async (
  client: PrivyClient,
  did: string
): Promise<UserWallet | null> => {
  const user = await client.users()._get(did);
  for (const account of user.linked_accounts) {
    // `wallet_client` is the discriminant, not `connector_type`: an externally
    // linked wallet also reports itself as a connector, but only the wallet
    // Privy minted carries an id — and only an id can be granted a signer.
    if (
      account.type === "wallet" &&
      account.chain_type === "ethereum" &&
      account.wallet_client === "privy" &&
      account.id !== null
    ) {
      return { address: account.address, id: account.id };
    }
  }
  return null;
};

/**
 * PATCH the wallet, authorized by the user.
 *
 * The signature is computed over the exact method, URL and body, so it cannot
 * be replayed against a different request — which is why the body is built
 * once here and passed to both the signer and the call.
 */
const updateWallet = async (
  client: PrivyClient,
  input: {
    readonly accessToken: string;
    readonly appId: string;
    readonly body: {
      readonly additional_signers: {
        readonly signer_id: string;
        readonly override_policy_ids?: string[];
      }[];
    };
    readonly walletId: string;
  }
): Promise<void> => {
  const expiry = Date.now() + REQUEST_TTL_MS;
  const signatures = await generateAuthorizationSignatures(client, {
    // The *user's* token signs this. Our app secret alone cannot add a signer
    // to a wallet we do not own, and that is the point rather than a limitation.
    authorizationContext: { user_jwts: [input.accessToken] },
    input: {
      body: input.body,
      headers: {
        "privy-app-id": input.appId,
        "privy-request-expiry": String(expiry),
      },
      method: "PATCH",
      url: `${PRIVY_API}/v1/wallets/${input.walletId}`,
      version: 1,
    },
  });
  await client.wallets()._update(input.walletId, {
    ...input.body,
    // Comma-separated when a quorum needs more than one. Ours needs one, but
    // joining rather than indexing means a threshold change is configuration.
    "privy-authorization-signature": signatures.join(","),
    "privy-request-expiry": String(expiry),
  });
};

const UNRECOGNISED = "Privy refused the grant for an unrecognised reason.";

/**
 * Is the agent's quorum already a signer on this wallet?
 *
 * The person can also grant the signature from the browser, where Privy asks
 * them directly; that path never passes through here, so the answer has to be
 * read from the wallet rather than remembered.
 */
const attachedPolicies = async (
  client: PrivyClient,
  walletId: string,
  quorumId: string
): Promise<readonly string[] | null> => {
  const wallet = await client.wallets().get(walletId);
  const signer = wallet.additional_signers.find(
    (candidate) => candidate.signer_id === quorumId
  );
  // Null is "no signer at all", which is not the same as a signer with no
  // policy override — the second would mean the agent signs under whatever the
  // wallet's own policy is, and the caller has to be able to see that.
  return signer === undefined ? null : (signer.override_policy_ids ?? []);
};

export const grantAgentSigner = async (
  client: PrivyClient,
  input: {
    readonly accessToken: string;
    readonly agent: AgentKey;
    readonly appId: string;
    readonly did: string;
    /**
     * The policy to attach the signer under. The person's own when they have
     * one; the app-wide policy otherwise, which is what everyone granted
     * before per-person policies existed.
     */
    readonly policyId?: string;
  }
): Promise<AgentGrant> => {
  const policyId = input.policyId ?? input.agent.policyId;
  let wallet: UserWallet | null = null;
  try {
    wallet = await embeddedWalletFor(client, input.did);
    if (wallet === null) {
      return {
        attached: false,
        policyIds: [],
        reason: "No embedded wallet on this account yet.",
        wallet: null,
      };
    }
    const existing = await attachedPolicies(
      client,
      wallet.id,
      input.agent.quorumId
    );
    if (existing !== null) {
      // Left exactly as it is, including when it names a policy other than the
      // one asked for. Moving a signer from one policy to another means
      // removing and re-adding it, which only the person's browser can do —
      // this side reports what it found and lets them decide.
      return { attached: true, policyIds: existing, reason: null, wallet };
    }
    await updateWallet(client, {
      accessToken: input.accessToken,
      appId: input.appId,
      body: {
        additional_signers: [
          { override_policy_ids: [policyId], signer_id: input.agent.quorumId },
        ],
      },
      walletId: wallet.id,
    });
    return { attached: true, policyIds: [policyId], reason: null, wallet };
  } catch (error) {
    // Returned rather than thrown, and with whatever wallet was found: a
    // wallet the agent cannot sign for is a degraded workspace, not a missing
    // one. The person's address, balances and funding never depended on the
    // agent's signature, so they keep those; what they lose, and are told
    // about, is the agent's ability to pay.
    return {
      attached: false,
      policyIds: [],
      reason: error instanceof Error ? describe(error) : UNRECOGNISED,
      wallet,
    };
  }
};

/**
 * Take the signature away.
 *
 * An empty `additional_signers` list is the revocation. After this the agent
 * cannot sign anything for this wallet even if every other check in our own
 * code were bypassed, because the refusal happens inside Privy.
 */
export const revokeAgentSigner = async (
  client: PrivyClient,
  input: {
    readonly accessToken: string;
    readonly appId: string;
    readonly did: string;
  }
): Promise<AgentGrant> => {
  try {
    const wallet = await embeddedWalletFor(client, input.did);
    if (wallet === null) {
      return { attached: false, policyIds: [], reason: null, wallet: null };
    }
    await updateWallet(client, {
      accessToken: input.accessToken,
      appId: input.appId,
      body: { additional_signers: [] },
      walletId: wallet.id,
    });
    return { attached: false, policyIds: [], reason: null, wallet };
  } catch (error) {
    // A revocation that failed must not read as a revocation that worked.
    return {
      attached: true,
      policyIds: [],
      reason:
        error instanceof Error
          ? describe(error)
          : "The agent's signer could not be removed.",
      wallet: null,
    };
  }
};
