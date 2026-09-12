import { describe, expect, it } from "bun:test";

import { answerLabel } from "./approval-labels";

describe("answerLabel", () => {
  it("names the amount on the primary yes", () => {
    expect(answerLabel("allow_once", "$1.35", "Allow once")).toBe(
      "Approve $1.35"
    );
  });

  it("keeps Allow once when there is no amount to pay", () => {
    expect(answerLabel("allow_once", "$0", "Send input & get price")).toBe(
      "Allow once"
    );
  });

  it("unifies the two refusals to the mandate's wording", () => {
    expect(answerLabel("deny", "$1.35", "Deny")).toBe("Not this time");
    expect(answerLabel("deny_stop", "$1.35", "Deny & stop")).toBe(
      "Stop the agent"
    );
  });

  it("leaves the session label as it arrived", () => {
    expect(
      answerLabel("allow_session", "$1.35", "Allow for this session")
    ).toBe("Allow for this session");
  });
});
