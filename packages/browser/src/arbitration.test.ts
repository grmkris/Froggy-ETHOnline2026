import { describe, expect, it } from "bun:test";

import { Arbitrator, HUMAN_ACTIVE_MS } from "./arbitration";

/** A clock the test moves by hand, so nothing here waits on real time. */
const makeClock = () => {
  let now = 1_000_000;
  return {
    advance: (ms: number) => {
      now += ms;
    },
    read: () => now,
  };
};

const hold = async <T>(value: T): Promise<T> => {
  await Promise.resolve();
  return value;
};

/** The message a promise rejected with, or a marker saying it did not. */
const rejection = async (work: Promise<unknown>): Promise<string> => {
  try {
    await work;
    return "resolved";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
};

const makeArbiter = () => {
  const clock = makeClock();
  const changes: string[] = [];
  const arbiter = new Arbitrator({
    now: clock.read,
    onStateChange: () => {
      changes.push(arbiter.interaction.mode);
    },
  });
  return { arbiter, changes, clock };
};

describe("Arbitrator", () => {
  it("starts idle", () => {
    const { arbiter } = makeArbiter();

    expect(arbiter.interaction.mode).toBe("idle");
  });

  it("hands the page to the human the instant they touch it", () => {
    const { arbiter } = makeArbiter();

    arbiter.noteHumanInput();

    expect(arbiter.interaction.mode).toBe("human");
  });

  it("lets an agent operation run when the human is quiet", async () => {
    const { arbiter } = makeArbiter();

    const result = await arbiter.withAgentControl(
      async () => await hold("done")
    );

    expect(result).toEqual({ value: "done", wait: "skipped" });
  });

  it("publishes agent mode only on the first holder", async () => {
    const { arbiter, changes } = makeArbiter();

    await Promise.all([
      arbiter.withAgentControl(async () => await hold(1)),
      arbiter.withAgentControl(async () => await hold(2)),
    ]);

    // Ref-counted: parallel tool calls must not flip the mode out from under
    // each other. One transition in, one out.
    expect(changes.filter((mode) => mode === "agent")).toHaveLength(1);
  });

  it("lets the human pre-empt an agent that is mid-operation", async () => {
    const { arbiter } = makeArbiter();

    await arbiter.withAgentControl(async () => {
      arbiter.noteHumanInput();
      expect(arbiter.interaction.mode).toBe("human");
      return await hold(null);
    });
  });

  it("reports the human as active until the quiet window lapses", () => {
    const { arbiter, clock } = makeArbiter();

    arbiter.noteHumanInput();
    clock.advance(HUMAN_ACTIVE_MS - 1);
    expect(arbiter.interaction.mode).toBe("human");
  });

  it("rejects waiters on dispose rather than resolving them", async () => {
    const { arbiter } = makeArbiter();
    arbiter.noteHumanInput();

    // Resolving would send the waiter into its operation against a session that
    // is already closed — a command dispatched at a dead browser.
    const pending = arbiter.withAgentControl(async () => await hold("no"));
    arbiter.dispose();

    expect(await rejection(pending)).toMatch(/closed/iu);
  });

  it("refuses to start an operation once disposed", async () => {
    const { arbiter } = makeArbiter();
    arbiter.dispose();

    const started = arbiter.withAgentControl(async () => await hold(null));

    expect(await rejection(started)).toMatch(/closed/iu);
  });

  it("tracks whether an agent currently holds the page", async () => {
    const { arbiter } = makeArbiter();
    expect(arbiter.agentActive).toBe(false);

    await arbiter.withAgentControl(async () => await hold(null));

    expect(arbiter.agentActive).toBe(false);
  });
});
