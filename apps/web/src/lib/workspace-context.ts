/**
 * What every page shares: the app socket's state and the two things a page
 * does with the account. Provided once by the workspace layout, which owns
 * the sockets, so navigating between pages never reconnects anything.
 *
 * Separate from the chat surface on purpose: this value changes on socket
 * events, the chat's on every streamed token, and the wallet page has no
 * business re-rendering for a token.
 */

import { createContext, useContext } from "react";

import type { AppStream } from "../hooks/use-app-socket";
import type { WebMcpStatus } from "./webmcp";

export interface Workspace {
  readonly app: AppStream;
  /** Wipes everything Froggy holds for this person and reloads. */
  readonly deleteMyData: () => Promise<void>;
  readonly webMcp: WebMcpStatus;
}

export const WorkspaceContext = createContext<Workspace | null>(null);

export const useWorkspace = (): Workspace => {
  const workspace = useContext(WorkspaceContext);
  if (workspace === null) {
    throw new Error("useWorkspace is only available inside the workspace");
  }
  return workspace;
};
