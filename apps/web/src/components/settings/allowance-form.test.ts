import { describe, expect, it } from "bun:test";

import { allowanceProblem } from "./allowance-form";

const good = {
  askOver: "1",
  daily: "10",
  days: "30",
  perSpend: "2",
};

describe("allowanceProblem", () => {
  it("accepts a sensible set", () => {
    expect(allowanceProblem(good)).toBeNull();
  });

  it("refuses a blank or non-numeric amount rather than reading it as zero", () => {
    expect(allowanceProblem({ ...good, perSpend: "" })).not.toBeNull();
    expect(allowanceProblem({ ...good, daily: "lots" })).not.toBeNull();
  });

  it("refuses zero and negative amounts", () => {
    expect(allowanceProblem({ ...good, perSpend: "0" })).not.toBeNull();
    expect(allowanceProblem({ ...good, askOver: "-1" })).not.toBeNull();
  });

  it("refuses a daily cap below the per-spend cap", () => {
    // Accepted by every individual field and means no spend could ever happen:
    // the kind of contradiction that only shows up as an agent that never works.
    const problem = allowanceProblem({ ...good, daily: "1", perSpend: "2" });
    expect(problem).toContain("no spend could ever happen");
  });

  it("refuses an ask-line above the per-spend cap", () => {
    // The other direction of the same trap: it reads as "ask me rarely" and
    // means "never ask me", because anything that large is refused outright.
    const problem = allowanceProblem({ ...good, askOver: "5", perSpend: "2" });
    expect(problem).toContain("never be asked");
  });

  it("holds the grant to Privy's own thirty-day ceiling", () => {
    expect(allowanceProblem({ ...good, days: "90" })).toContain("thirty days");
    expect(allowanceProblem({ ...good, days: "0" })).toContain(
      "at least a day"
    );
  });
});
