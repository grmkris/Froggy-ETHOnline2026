/**
 * What the rest of the system may do to a browser.
 *
 * Two things implement it: `BrowserSession`, which drives Chrome in this
 * process, and `RemoteBrowser`, which drives a `BrowserSession` in a worker
 * process over IPC. Everything above this line — the tools, the sockets, the
 * registry — depends on the interface, never on either class, so the choice
 * between them is made once, in the composition root, and tests can pick the
 * in-process one without a Chrome.
 */

import type { BrowserClientMessage, BrowserState } from "@froggy/protocol";

import type { WaitReason } from "./arbitration";
import type { FrameSubscriber } from "./screencast";
import type { Snapshot } from "./snapshot";

export interface BrowserHandle {
  readonly state: () => BrowserState;
  readonly subscribe: (subscriber: FrameSubscriber) => () => void;
  readonly resendLatest: (subscriber: FrameSubscriber) => void;
  readonly handleClientMessage: (
    message: BrowserClientMessage
  ) => Promise<void>;
  readonly agentNavigate: (url: string) => Promise<WaitReason>;
  readonly agentSnapshot: () => Promise<{
    snapshot: Snapshot;
    wait: WaitReason;
  }>;
  readonly agentClick: (ref: string) => Promise<{ ok: boolean; note: string }>;
  readonly agentType: (text: string) => Promise<void>;
  /** Callers abort the agent run first. See `BrowserSession.takePage`. */
  readonly takePage: () => Promise<void>;
  readonly freeze: (reason: string) => Promise<void>;
  readonly unfreeze: () => Promise<void>;
  /** Release Chrome. Sync in-process, a round trip for a worker. */
  readonly close: () => void | Promise<void>;
}
