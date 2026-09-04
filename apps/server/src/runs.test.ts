import { describe, expect, it } from "bun:test";

import { SessionId } from "@froggy/domain";

import { ChatRunRegistry } from "./runs";

const streamOf = (chunks: readonly string[]): ReadableStream<string> =>
  new ReadableStream<string>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });

const drain = async (stream: ReadableStream<string>): Promise<string[]> => {
  const out: string[] = [];
  for await (const chunk of stream) {
    out.push(chunk);
  }
  return out;
};

describe("ChatRunRegistry", () => {
  it("supersedes and aborts the session's previous run", () => {
    const runs = new ChatRunRegistry();
    const session = SessionId.generate();
    const first = runs.start(session);

    runs.start(session);

    // One turn per session. A second `POST /api/chat` replaces the first rather
    // than running two agents against one wallet.
    expect(first.signal.aborted).toBe(true);
  });

  it("does not abort a run belonging to another session", () => {
    const runs = new ChatRunRegistry();
    const mine = runs.start(SessionId.generate());

    runs.start(SessionId.generate());

    expect(mine.signal.aborted).toBe(false);
  });

  it("aborts on request", () => {
    const runs = new ChatRunRegistry();
    const session = SessionId.generate();
    const run = runs.start(session);

    expect(runs.abort(session)).toBe(true);
    expect(run.signal.aborted).toBe(true);
  });

  it("reports nothing to abort for an idle session", () => {
    expect(new ChatRunRegistry().abort(SessionId.generate())).toBe(false);
  });

  it("only retires a run that is still the session's current one", () => {
    const runs = new ChatRunRegistry();
    const session = SessionId.generate();
    const superseded = runs.start(session);
    const current = runs.start(session);

    // A superseded run's teardown routinely outlives the turn that replaced it;
    // an unguarded delete would let a late finisher evict its own successor.
    runs.settle(session, superseded);

    expect(runs.get(session)).toBe(current);
  });

  it("aborts every run for the panic path", () => {
    const runs = new ChatRunRegistry();
    const a = runs.start(SessionId.generate());
    const b = runs.start(SessionId.generate());

    runs.abortAll();

    expect(a.signal.aborted).toBe(true);
    expect(b.signal.aborted).toBe(true);
  });
});

describe("ChatRun", () => {
  it("replays what a reconnecting client missed", async () => {
    const runs = new ChatRunRegistry();
    const run = runs.start(SessionId.generate());

    await run.record(streamOf(["a", "b", "c"]));
    const replay = run.replay();

    if (replay === null) {
      throw new Error(
        "A completed run under the buffer cap must be replayable."
      );
    }
    expect(await drain(replay)).toEqual(["a", "b", "c"]);
  });

  it("marks itself ended once the stream closes", async () => {
    const runs = new ChatRunRegistry();
    const run = runs.start(SessionId.generate());

    await run.record(streamOf(["only"]));

    expect(run.ended).toBe(true);
  });

  it("survives a stream that errors", async () => {
    const runs = new ChatRunRegistry();
    const run = runs.start(SessionId.generate());
    const failing = new ReadableStream<string>({
      start(controller) {
        controller.enqueue("partial");
        controller.error(new Error("upstream died"));
      },
    });

    // Never rejects: a recorder that threw would take down the turn it exists
    // to protect, and there is nothing useful to do about a broken tee.
    await run.record(failing);

    expect(run.ended).toBe(true);
  });
});
