import { describe, expect, it } from "bun:test";

import { connectionKind, connectionWords } from "./connection";

describe("connectionKind", () => {
  it("prefers a live socket over every other signal", () => {
    expect(
      connectionKind({
        authenticated: false,
        connected: true,
        online: false,
        ready: true,
      })
    ).toBe("connected");
  });

  it("tells offline, signed out and a down server apart", () => {
    expect(
      connectionKind({
        authenticated: true,
        connected: false,
        online: false,
        ready: true,
      })
    ).toBe("offline");
    expect(
      connectionKind({
        authenticated: false,
        connected: false,
        online: true,
        ready: true,
      })
    ).toBe("signed-out");
    expect(
      connectionKind({
        authenticated: true,
        connected: false,
        online: true,
        ready: true,
      })
    ).toBe("server");
  });
});

describe("connectionWords", () => {
  it("is silent while connected and names the other three", () => {
    expect(connectionWords("connected")).toBeNull();
    expect(connectionWords("offline")).toBe("You're offline");
    expect(connectionWords("server")).toBe("Couldn't reach Froggy");
    expect(connectionWords("signed-out")).toBe("Sign in again");
  });
});
