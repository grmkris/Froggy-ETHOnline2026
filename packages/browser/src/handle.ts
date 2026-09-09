/**
 * What the rest of the system may do to a browser.
 *
 * Two things implement it: `CloudBrowser`, which owns a Browser Use browser and
 * drives it over CDP, and `StubCloudBrowser`, which owns nothing and says so.
 * Everything above this line — the tools, the sockets, the registry — depends
 * on the interface, never on either class, so the choice between them is made
 * once, in the composition root, and tests drive a fixture without a provider.
 */

import type { BrowserPaymentId } from "@froggy/domain";
import type {
  BrowserClientMessage,
  BrowserPaymentReplay,
  BrowserPaymentRequest,
  BrowserPaymentResult,
  BrowserState,
} from "@froggy/protocol";

import type { WaitReason } from "./arbitration";
import type { FrameSubscriber } from "./screencast";
import type { Snapshot } from "./snapshot";

export interface BrowserHandle {
  readonly viewer?: () => Promise<string | null>;
  readonly forget?: () => Promise<void>;
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
  readonly subscribePayments: (
    listener: (request: BrowserPaymentRequest) => void
  ) => () => void;
  readonly pendingPayment: () => Promise<BrowserPaymentRequest | null>;
  readonly replayPayment: (
    payment: BrowserPaymentReplay
  ) => Promise<BrowserPaymentResult>;
  readonly cancelPayment: (id: BrowserPaymentId) => Promise<void>;
  /** Callers abort the agent run first. See `BrowserSession.takePage`. */
  readonly takePage: () => Promise<void>;
  /** Release the browser. A round trip to the provider, which stops billing. */
  readonly close: () => void | Promise<void>;
}
