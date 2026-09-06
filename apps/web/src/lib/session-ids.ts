/**
 * Two identifiers every ticket may want and no ticket should be handed.
 *
 * The HCS topic turns a note's sequence number into a link; the Privy policy
 * id names what the agent's signer is held to. Both arrive once, with the
 * welcome, and are read wherever a receipt or the mandate is drawn — a
 * context rather than a prop threaded through five components.
 */

import { createContext, useContext } from "react";

export interface SessionIds {
  readonly hcsTopicId: string | null;
  readonly policyId: string | null;
}

const NO_SESSION_IDS: SessionIds = { hcsTopicId: null, policyId: null };

export const SessionIdsContext = createContext<SessionIds>(NO_SESSION_IDS);

export const useSessionIds = (): SessionIds => useContext(SessionIdsContext);
