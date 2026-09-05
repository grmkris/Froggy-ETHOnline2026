/**
 * The worker side of the browser protocol.
 *
 * A `BrowserSession` behind a transport: commands in, replies and frames out.
 * The process entry (`worker.ts`) binds this to Bun's IPC; the tests bind it
 * to an in-memory pair, which is why the transport is a parameter rather than
 * `process`.
 *
 * Frames carry a credit. The worker keeps at most two in flight and drops the
 * rest until the host acks — the same policy Chrome applies to its own
 * screencast, and for the same reason: a slow consumer must lose frames, not
 * accumulate them, and a freeze must never queue behind a backlog of JPEGs.
 */

import { decodeWorkerCommand } from "@froggy/protocol";
import type {
  BrowserState,
  WorkerCommand,
  WorkerEvent,
  WorkerReply,
} from "@froggy/protocol";
import { Result } from "effect";

import type { FrameSubscriber } from "./screencast";
import type { BrowserSession } from "./session";

export interface WorkerTransport {
  readonly onCommand: (handler: (raw: unknown) => void) => void;
  readonly send: (event: WorkerEvent) => void;
}

export interface ServeWorkerOptions {
  readonly makeSession: (
    onStateChange: (state: BrowserState) => void
  ) => BrowserSession;
  /** Called once the session has been released; the process entry exits here. */
  readonly onShutdown: () => void;
  readonly pid: number;
  readonly transport: WorkerTransport;
}

const FRAMES_IN_FLIGHT = 2;

export interface WorkerServer {
  /** Release the session and call `onShutdown`. Graceful flushes the profile. */
  readonly stop: (graceful: boolean) => Promise<void>;
}

/** Every command that expects an answer. The other two are handled inline. */
type Answerable = Exclude<
  WorkerCommand,
  { readonly type: "frame.ack" } | { readonly type: "shutdown" }
>;

export const serveWorker = (options: ServeWorkerOptions): WorkerServer => {
  const { transport } = options;
  const session = options.makeSession((state) => {
    transport.send({ state, type: "state", v: 1 });
  });

  let inFlight = 0;
  let unwatch: (() => void) | null = null;
  const forwarder: FrameSubscriber = {
    send: (bytes) => {
      if (inFlight >= FRAMES_IN_FLIGHT) {
        return false;
      }
      inFlight += 1;
      transport.send({ bytes, type: "frame", v: 1 });
      return true;
    },
  };
  const watch = (watching: boolean): void => {
    if (watching && unwatch === null) {
      unwatch = session.subscribe(forwarder);
    } else if (!watching && unwatch !== null) {
      unwatch();
      unwatch = null;
    }
  };

  const execute = async (command: Answerable): Promise<WorkerReply> => {
    switch (command.type) {
      case "client": {
        await session.handleClientMessage(command.message);
        return { kind: "done" };
      }
      case "agent.navigate": {
        return {
          kind: "navigated",
          wait: await session.agentNavigate(command.url),
        };
      }
      case "agent.snapshot": {
        const { snapshot, wait } = await session.agentSnapshot();
        return {
          kind: "snapshot",
          snapshot: {
            text: snapshot.text,
            title: snapshot.title,
            url: snapshot.url,
          },
          wait,
        };
      }
      case "agent.click": {
        const { ok, note } = await session.agentClick(command.ref);
        return { kind: "clicked", note, ok };
      }
      case "agent.type": {
        await session.agentType(command.text);
        return { kind: "done" };
      }
      case "take": {
        await session.takePage();
        return { kind: "done" };
      }
      case "freeze": {
        await session.freeze(command.reason);
        return { kind: "done" };
      }
      case "unfreeze": {
        await session.unfreeze();
        return { kind: "done" };
      }
      case "watch": {
        watch(command.watching);
        return { kind: "done" };
      }
      case "state": {
        return { kind: "state", state: session.state() };
      }
      default: {
        return { kind: "done" };
      }
    }
  };

  const stop = async (graceful: boolean): Promise<void> => {
    watch(false);
    if (graceful) {
      await session.shutdown();
    } else {
      session.close();
    }
    options.onShutdown();
  };

  transport.onCommand((raw) => {
    const decoded = decodeWorkerCommand(raw);
    if (Result.isFailure(decoded)) {
      return;
    }
    const command = decoded.success;
    if (command.type === "frame.ack") {
      inFlight = Math.max(0, inFlight - 1);
      return;
    }
    if (command.type === "shutdown") {
      // Answered before the work, because the work ends the process and a
      // reply sent after `exit` never leaves.
      transport.send({
        id: command.id,
        result: { kind: "done" },
        type: "reply",
        v: 1,
      });
      void stop(command.graceful);
      return;
    }
    void (async () => {
      try {
        const result = await execute(command);
        transport.send({ id: command.id, result, type: "reply", v: 1 });
      } catch (error) {
        transport.send({
          error: {
            message: error instanceof Error ? error.message : String(error),
            name: error instanceof Error ? error.name : "Error",
          },
          id: command.id,
          type: "failure",
          v: 1,
        });
      }
    })();
  });

  transport.send({ pid: options.pid, type: "ready", v: 1 });
  return { stop };
};
