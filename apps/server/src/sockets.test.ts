import { describe, expect, test } from "bun:test";

import { seizesPage } from "./sockets";

/**
 * The rule this protects cost a deadlocked pane to find.
 *
 * The hosted browser has explicit ownership and starts with the agent holding
 * it. Refusing a person's own input until they pressed Take control meant the
 * address bar did nothing at all: the button is disabled until the browser is
 * running, and the browser only runs once someone navigates. The refusal was
 * visible only in a server log.
 */
describe("seizesPage", () => {
  test("a person typing or clicking takes the page from the agent", () => {
    for (const type of [
      "browser.navigate",
      "input.key",
      "input.mouse",
      "input.text",
      "browser.activate-tab",
      "browser.close-tab",
    ] as const) {
      expect(seizesPage(type, "agent")).toBe(true);
    }
  });

  test("the panic button always takes it", () => {
    expect(seizesPage("browser.take", "agent")).toBe(true);
    expect(seizesPage("browser.take", "human")).toBe(true);
    expect(seizesPage("browser.take")).toBe(true);
  });

  test("a page already theirs is not taken again, so no run is aborted", () => {
    expect(seizesPage("browser.navigate", "human")).toBe(false);
    expect(seizesPage("input.text", "human")).toBe(false);
  });

  test("asking for a browser is not driving it, and a keepalive never is", () => {
    expect(seizesPage("browser.start", "agent")).toBe(false);
    expect(seizesPage("ping", "agent")).toBe(false);
    expect(seizesPage("browser.resume", "agent")).toBe(false);
  });

  test("a browser with no explicit ownership keeps its own arbitration", () => {
    expect(seizesPage("browser.navigate")).toBe(false);
    expect(seizesPage("input.mouse")).toBe(false);
  });
});
