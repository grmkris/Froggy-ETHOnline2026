/**
 * What the workspace knows about a token it handed to an outside agent.
 *
 * The secret itself is not here: it is shown once at creation and only its
 * hash is stored, so a copy of the database cannot impersonate an agent.
 * Revocation is a timestamp rather than a deletion so "which agent asked for
 * that task last Tuesday" stays answerable after the token is gone.
 */

import { Schema } from "effect";

import { AgentTokenId } from "./id";

export const AgentToken = Schema.Struct({
  createdAt: Schema.Int,
  id: AgentTokenId,
  /** As the person named it: "Hermes", "Claude on the laptop". */
  label: Schema.String,
  lastUsedAt: Schema.NullOr(Schema.Int),
  revokedAt: Schema.NullOr(Schema.Int),
});
export type AgentToken = typeof AgentToken.Type;

/** The prefix every secret starts with, so a leaked one is recognisable in a log. */
export const AGENT_TOKEN_PREFIX = "fgy_";
