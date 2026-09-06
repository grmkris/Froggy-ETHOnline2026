import { describe, expect, it } from "bun:test";

import { lookupHederaTransaction, mirrorTransactionId } from "./mirror";
import type { MirrorFetch } from "./mirror";

/** What the mirror node's transactions endpoint answers, as far as the lookup reads it. */
interface MirrorBody {
  readonly transactions: readonly { readonly result: string }[];
}

const answering =
  (status: number, body: MirrorBody): MirrorFetch =>
  async () => {
    await Promise.resolve();
    return Response.json(body, { status });
  };

describe("mirrorTransactionId", () => {
  it("rewrites Hedera's @ and the nanos dot into the REST path's dashes", () => {
    expect(mirrorTransactionId("0.0.7162784@1788674975.439553201")).toBe(
      "0.0.7162784-1788674975-439553201"
    );
  });
});

describe("lookupHederaTransaction", () => {
  it("reads success and failure from the mirror node, and unknown from silence", async () => {
    const id = "0.0.7162784@1788674975.439553201";
    expect(
      await lookupHederaTransaction({
        fetch: answering(200, { transactions: [{ result: "SUCCESS" }] }),
        network: "hedera:testnet",
        transactionId: id,
      })
    ).toBe("success");
    expect(
      await lookupHederaTransaction({
        fetch: answering(200, {
          transactions: [{ result: "INSUFFICIENT_PAYER_BALANCE" }],
        }),
        network: "hedera:testnet",
        transactionId: id,
      })
    ).toBe("failed");
    expect(
      await lookupHederaTransaction({
        fetch: answering(404, { transactions: [] }),
        network: "hedera:testnet",
        transactionId: id,
      })
    ).toBe("unknown");
  });
});
