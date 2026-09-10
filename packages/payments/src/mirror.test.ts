import { describe, expect, it } from "bun:test";

import {
  lookupHcsNote,
  lookupHederaTransaction,
  mirrorTransactionId,
} from "./mirror";
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

/** A note body as it appears on the topic, before anything reads it. */
interface NoteBody {
  readonly kind?: string;
  readonly ref?: string;
  readonly transactionId: string;
}

/** One topic message as the mirror node renders it. */
const messageRow = (sequenceNumber: number, note: NoteBody) => ({
  consensus_timestamp: `178902005${sequenceNumber}.198748459`,
  message: Buffer.from(JSON.stringify(note), "utf-8").toString("base64"),
  payer_account_id: "0.0.10847552",
  sequence_number: sequenceNumber,
});

/** A page of them, shaped the way the topics endpoint answers. */
const messagePage = (
  next: string | null,
  messages: readonly ReturnType<typeof messageRow>[]
) => ({ links: { next }, messages });

const SALE = "0.0.10571514@1788733693.213156813";

/** Answers each page in turn; the fake `next` link carries the page number. */
const paging =
  (bodies: readonly ReturnType<typeof messagePage>[]): MirrorFetch =>
  async (url) => {
    await Promise.resolve();
    const body = bodies[url.includes("page=1") ? 1 : 0];
    return body === undefined
      ? new Response("", { status: 404 })
      : Response.json(body);
  };

describe("lookupHcsNote", () => {
  it("finds the note whose transaction id matches the settlement", async () => {
    const found = await lookupHcsNote({
      fetch: paging([
        messagePage(null, [
          messageRow(21, { kind: "paid", transactionId: "0xdeadbeef" }),
          messageRow(1, {
            kind: "sold",
            ref: "sal_01m1wddr0vfvqvsfaftr95s214",
            transactionId: SALE,
          }),
        ]),
      ]),
      network: "hedera:mainnet",
      topicId: "0.0.10847557",
      transactionId: SALE,
    });
    expect(found?.sequenceNumber).toBe(1);
    expect(found?.note.ref).toBe("sal_01m1wddr0vfvqvsfaftr95s214");
    expect(found?.topicId).toBe("0.0.10847557");
  });

  it("matches across the two renderings of a transaction id", async () => {
    const found = await lookupHcsNote({
      fetch: paging([
        messagePage(null, [messageRow(1, { transactionId: SALE })]),
      ]),
      network: "hedera:mainnet",
      topicId: "0.0.10847557",
      transactionId: "0.0.10571514-1788733693-213156813",
    });
    expect(found?.sequenceNumber).toBe(1);
  });

  it("walks to the next page when the first does not carry it", async () => {
    const found = await lookupHcsNote({
      fetch: paging([
        messagePage("/api/v1/topics/0.0.10847557/messages?page=1", [
          messageRow(21, { transactionId: "0xdeadbeef" }),
        ]),
        messagePage(null, [messageRow(1, { transactionId: SALE })]),
      ]),
      network: "hedera:mainnet",
      topicId: "0.0.10847557",
      transactionId: SALE,
    });
    expect(found?.sequenceNumber).toBe(1);
  });

  it("skips a message a stranger wrote that is not a note at all", async () => {
    const strangers: MirrorFetch = async () => {
      await Promise.resolve();
      return Response.json({
        links: { next: null },
        messages: [
          {
            consensus_timestamp: "1789020056.198748459",
            message: Buffer.from("hello", "utf-8").toString("base64"),
            payer_account_id: "0.0.9",
            sequence_number: 22,
          },
          messageRow(1, { transactionId: SALE }),
        ],
      });
    };
    const found = await lookupHcsNote({
      fetch: strangers,
      network: "hedera:mainnet",
      topicId: "0.0.10847557",
      transactionId: SALE,
    });
    expect(found?.sequenceNumber).toBe(1);
  });

  it("answers null when the topic does not carry it", async () => {
    expect(
      await lookupHcsNote({
        fetch: paging([
          messagePage(null, [messageRow(21, { transactionId: "0x1" })]),
        ]),
        network: "hedera:mainnet",
        topicId: "0.0.10847557",
        transactionId: SALE,
      })
    ).toBeNull();
  });
});
