/**
 * What an MCP client is allowed after the person clicks Allow.
 *
 * A grant is a person's consent to one client: the scopes they left on, when
 * it happened, and when it was withdrawn. The tokens that carry it are not
 * here — they are hashed rows in the store, rotated on use — so a copy of a
 * grant says who was allowed what and never lets anyone act on it.
 *
 * Scopes map onto the things an agent can buy, not onto the things a person
 * can change: no scope approves a ticket, raises a cap or adds a payee.
 */

import { Schema } from "effect";

import { OAuthClientId, OAuthGrantId } from "./id";

/**
 * `brief` buys a lending brief, `browse` a run on the shared Chrome, `pay`
 * signs an x402 payment header for a task the agent brings, `services` buys
 * from the fixed-price catalog (and is what every MCP tool call needs).
 */
export const OAuthScope = Schema.Literals([
  "brief",
  "browse",
  "pay",
  "services",
  "history",
  "email:read",
  "email:draft",
]);
export type OAuthScope = typeof OAuthScope.Type;

/** Every scope, in the order the consent page shows them. */
export const OAUTH_SCOPES: readonly OAuthScope[] = [
  "brief",
  "browse",
  "pay",
  "services",
  "history",
  "email:read",
  "email:draft",
];

export const OAuthClient = Schema.Struct({
  createdAt: Schema.Int,
  id: OAuthClientId,
  /** As the client named itself at registration: "Claude Code", "Cursor". */
  name: Schema.String,
  /** Absolute, checked at registration; a code goes only to one of these. */
  redirectUris: Schema.Array(Schema.String),
});
export type OAuthClient = typeof OAuthClient.Type;

export const OAuthGrant = Schema.Struct({
  clientId: OAuthClientId,
  /** The client's name at the time, so the Agents page can say who this is. */
  clientName: Schema.String,
  createdAt: Schema.Int,
  id: OAuthGrantId,
  lastUsedAt: Schema.NullOr(Schema.Int),
  revokedAt: Schema.NullOr(Schema.Int),
  scopes: Schema.Array(OAuthScope),
});
export type OAuthGrant = typeof OAuthGrant.Type;

/** Access tokens start with this, so a leaked one is recognisable in a log. */
export const OAUTH_ACCESS_TOKEN_PREFIX = "fga_";
/** Refresh tokens likewise; they reach nothing but the token endpoint. */
export const OAUTH_REFRESH_TOKEN_PREFIX = "fgr_";
