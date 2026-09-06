/**
 * Tokens for outside agents.
 *
 * Hermes, Claude Code or any other personal agent calls Froggy with one of
 * these. It names the person's workspace and nothing else: a token can start
 * and read tasks and ask the person's wallet to pay for one, and it cannot
 * approve, raise a cap, add a payee or change the mandate — those arrive on
 * the app socket from a human, and the router refuses a token every other
 * `/api` path.
 *
 * The secret is shown once. Only its hash is stored, so the database cannot
 * impersonate an agent; a revoked token stops working on the next request
 * because `lookup` answers only for tokens that are not revoked.
 */

import { AGENT_TOKEN_PREFIX, AgentTokenId } from "@froggy/domain";
import type { AgentToken, UserId } from "@froggy/domain";
import type { Store } from "@froggy/wallet";

import { detached } from "./detached";

export interface MintedToken {
  /** Shown to the person once. Never stored, never logged. */
  readonly secret: string;
  readonly token: AgentToken;
}

const hashSecret = (secret: string): string =>
  new Bun.CryptoHasher("sha256").update(secret).digest("hex");

const randomSecret = (): string => {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return `${AGENT_TOKEN_PREFIX}${Buffer.from(bytes).toString("base64url")}`;
};

export const mintAgentToken = async (
  store: Pick<Store, "agents">,
  userId: UserId,
  label: string,
  now: number
): Promise<MintedToken> => {
  const secret = randomSecret();
  const token: AgentToken = {
    createdAt: now,
    id: AgentTokenId.generate(),
    label: label.trim() === "" ? "agent" : label.trim().slice(0, 80),
    lastUsedAt: null,
    revokedAt: null,
  };
  await store.agents.create(userId, {
    ...token,
    secretHash: hashSecret(secret),
  });
  return { secret, token };
};

/** Who a bearer secret belongs to, or null. Touches last-used on the way. */
export const resolveAgentSecret = async (
  store: Pick<Store, "agents">,
  secret: string,
  now: number
): Promise<{ readonly token: AgentToken; readonly userId: UserId } | null> => {
  if (!secret.startsWith(AGENT_TOKEN_PREFIX)) {
    return null;
  }
  const found = await store.agents.lookup(hashSecret(secret));
  if (found === null) {
    return null;
  }
  detached("agent token touch", async () => {
    await store.agents.touch(found.token.id, now);
  });
  return found;
};

/** Looks like one of ours, whether or not it resolves. */
export const looksLikeAgentSecret = (bearer: string): boolean =>
  bearer.startsWith(AGENT_TOKEN_PREFIX);

/**
 * What a token may reach. Everything else on `/api` is a person's: the
 * mandate, the directory, the digest, Telegram, deleting the account.
 */
export const agentMayCall = (pathname: string, method: string): boolean =>
  pathname.startsWith("/api/tasks") ||
  (pathname === "/api/wallet" && method === "GET") ||
  (pathname === "/api/wallet/pay" && method === "POST");
