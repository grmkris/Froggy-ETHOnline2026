import { describe, expect, it } from "bun:test";

import { registerWebMcp, webMcpTools } from "./webmcp";
import type { ModelContext, WebMcpTool } from "./webmcp";

const sources = (sent: string[]) => () => ({
  mandate: null,
  receipts: [],
  send: (text: string) => {
    sent.push(text);
  },
  wallet: null,
});

describe("webMcpTools", () => {
  it("exposes three readers and one consequential tool", () => {
    const tools = webMcpTools(sources([]));
    expect(tools.map((tool) => tool.name)).toEqual([
      "get_balance",
      "get_policy",
      "list_receipts",
      "pay_402",
    ]);
    expect(
      tools.filter((tool) => tool.annotations.readOnlyHint === true).length
    ).toBe(3);
    expect(tools.at(-1)?.annotations.consequentialHint).toBe(true);
  });

  it("pay_402 starts a turn rather than paying", async () => {
    const sent: string[] = [];
    const pay = webMcpTools(sources(sent)).find(
      (tool) => tool.name === "pay_402"
    );
    expect(await pay?.execute({ url: "https://seller.test/brief" })).toContain(
      "Asked"
    );
    expect(sent).toEqual([
      "Fetch https://seller.test/brief and pay for it if it asks and the mandate allows.",
    ]);
    expect(await pay?.execute({})).toContain("required");
    expect(sent.length).toBe(1);
  });

  it("registers and unregisters every tool", () => {
    const registered: string[] = [];
    const context: ModelContext = {
      registerTool: (tool: WebMcpTool) => {
        registered.push(tool.name);
      },
      unregisterTool: (name) => {
        registered.splice(registered.indexOf(name), 1);
      },
    };
    const release = registerWebMcp(context, webMcpTools(sources([])));
    expect(registered.length).toBe(4);
    release();
    expect(registered).toEqual([]);
  });
});
