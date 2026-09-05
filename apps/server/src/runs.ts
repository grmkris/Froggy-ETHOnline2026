/**
 * A run belongs to the server, not to the HTTP socket a client happens to hold.
 *
 * This is the single most important thing in the agent half of the codebase,
 * and the reason is money. If the run were tied to `req.signal`, then closing a
 * tab mid-turn would abort the model loop *after* a payment had been reserved
 * and possibly settled — leaving a spend on the ledger with no receipt and no
 * record of what it bought. A detach has to be a detach.
 *
 * So: an explicit `POST /api/chat/:id/stop` cancels; a closed socket does not.
 * The SSE stream is tee'd and recorded so a reconnecting client can replay what
 * it missed, and the recorder is what keeps the model loop draining while
 * nobody is listening.
 */

import { RunId } from "@froggy/domain";
import type { SessionId } from "@froggy/domain";

/**
 * Replay buffer ceiling. Past it the run keeps draining — the loop must not
 * stall — but stops being replayable, because an unbounded buffer is a memory
 * leak that only shows up on the longest, most expensive turn.
 */
const REPLAY_BUFFER_BYTES = 8 * 1024 * 1024;

export class ChatRun {
  readonly id: RunId;
  readonly sessionId: SessionId;

  private readonly controller = new AbortController();
  private readonly chunks: string[] = [];
  private readonly subscribers = new Set<(chunk: string | null) => void>();
  private buffered = 0;
  private replayable = true;
  private finished = false;

  constructor(sessionId: SessionId) {
    this.id = RunId.generate();
    this.sessionId = sessionId;
  }

  get ended(): boolean {
    return this.finished;
  }

  get signal(): AbortSignal {
    return this.controller.signal;
  }

  abort(): void {
    this.controller.abort();
  }

  /**
   * Drain the tee'd copy of the SSE stream.
   *
   * Never rejects. A recorder that threw would take down the turn it exists to
   * protect, and there is nothing useful to do about a broken tee anyway — the
   * client half of the stream is unaffected.
   */
  async record(stream: ReadableStream<string>): Promise<void> {
    try {
      // Sequential by nature: this is the SSE stream in order, and reading it
      // any other way would reorder the turn.
      for await (const value of stream) {
        if (this.replayable) {
          this.buffered += value.length;
          if (this.buffered > REPLAY_BUFFER_BYTES) {
            this.replayable = false;
            this.chunks.length = 0;
          } else {
            this.chunks.push(value);
          }
        }
        for (const notify of this.subscribers) {
          notify(value);
        }
      }
    } catch {
      // Nothing to do: the client's copy is independent, and the run is over
      // either way.
    } finally {
      this.finished = true;
      for (const notify of this.subscribers) {
        notify(null);
      }
      this.subscribers.clear();
    }
  }

  /**
   * A stream of everything so far, then everything after.
   *
   * The snapshot-and-subscribe is synchronous on purpose: `record`'s loop only
   * yields at `await reader.read()`, so taking both under one synchronous step
   * makes it impossible to miss a chunk between the two.
   */
  replay(): ReadableStream<string> | null {
    if (!this.replayable) {
      return null;
    }
    const history = [...this.chunks];
    const { finished } = this;
    const { subscribers } = this;
    return new ReadableStream<string>({
      start(controller) {
        for (const chunk of history) {
          controller.enqueue(chunk);
        }
        if (finished) {
          controller.close();
          return;
        }
        subscribers.add((chunk) => {
          if (chunk === null) {
            controller.close();
          } else {
            controller.enqueue(chunk);
          }
        });
      },
    });
  }
}

export class ChatRunRegistry {
  private readonly current = new Map<SessionId, ChatRun>();

  /** Starting a run supersedes and aborts whatever the session was doing. */
  start(sessionId: SessionId): ChatRun {
    this.current.get(sessionId)?.abort();
    const run = new ChatRun(sessionId);
    this.current.set(sessionId, run);
    return run;
  }

  get(sessionId: SessionId): ChatRun | null {
    return this.current.get(sessionId) ?? null;
  }

  /**
   * Retire a run, but only if it is still the session's current one.
   *
   * Instance-scoped because a superseded run's teardown routinely outlives the
   * turn that replaced it, and an unguarded `delete` would let a late finisher
   * evict its own successor.
   */
  settle(sessionId: SessionId, run: ChatRun): void {
    if (this.current.get(sessionId) === run) {
      this.current.delete(sessionId);
    }
  }

  abort(sessionId: SessionId): boolean {
    const run = this.current.get(sessionId);
    if (run === undefined) {
      return false;
    }
    run.abort();
    return true;
  }

  /** The panic path. Called before the browser gate flips, never after. */
  abortAll(): void {
    for (const run of this.current.values()) {
      run.abort();
    }
  }
}
