/**
 * A public note per settlement, on Hedera Consensus Service.
 *
 * Every payment the oracle takes, and every payment the agent makes, leaves
 * one message on a topic anyone can read on a mirror node: what network,
 * which transaction, how much, for what. No user identifiers — the receipt
 * and spend ids are the app's own TypeIDs and name nobody. The point is an
 * audit trail that does not depend on trusting this server's database.
 *
 * Best effort by design. A note that fails to post must never fail the
 * payment it describes; the payment already happened.
 */

import {
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
} from "@hiero-ledger/sdk";
import { Schema } from "effect";

import { hederaClient } from "./accounts";
import type { HederaNetwork } from "./types";

/** What goes on the topic. Flat and small: a message is capped at 1024 bytes. */
export const SettlementNote = Schema.Struct({
  amount: Schema.String,
  asset: Schema.String,
  at: Schema.Int,
  /** `paid` when the agent bought; `sold` when the oracle was paid. */
  kind: Schema.Literals(["paid", "sold"]),
  network: Schema.String,
  /** The app's own receipt or spend id, when there is one. Not a person. */
  ref: Schema.NullOr(Schema.String),
  transactionId: Schema.String,
});
export type SettlementNote = typeof SettlementNote.Type;

export interface HcsNote {
  readonly sequenceNumber: number;
  readonly topicId: string;
  readonly transactionId: string;
}

export interface HcsWriter {
  /** Make sure there is a topic to write to; returns its id, or null when none. */
  readonly ensure: () => Promise<string | null>;
  readonly mode: "live" | "stub";
  /** Post one note. Null when it could not be posted; never throws. */
  readonly record: (note: SettlementNote) => Promise<HcsNote | null>;
  readonly topicId: () => string | null;
}

export interface LiveHcsOptions {
  readonly accountId: string;
  /** Which Hedera the topic lives on. */
  readonly network: HederaNetwork;
  /** ECDSA, `0x`-prefixed. The same pocket that pays; a topic needs an operator. */
  readonly privateKey: string;
  /** Empty means: create one at first use and say so in the log. */
  readonly topicId: string;
}

const encodeNote = Schema.encodeSync(Schema.fromJsonString(SettlementNote));

export const liveHcsWriter = (options: LiveHcsOptions): HcsWriter => {
  const client = hederaClient(options);
  let topic: string | null = options.topicId === "" ? null : options.topicId;
  let creating: Promise<string | null> | null = null;

  const create = async (): Promise<string | null> => {
    try {
      const response = await new TopicCreateTransaction()
        .setTopicMemo("froggy: x402 settlements")
        .execute(client);
      const receipt = await response.getReceipt(client);
      const created = receipt.topicId?.toString() ?? null;
      if (created !== null) {
        console.info(
          `[hcs] created topic ${created}; set HEDERA_HCS_TOPIC_ID=${created} to keep it across restarts`
        );
      }
      return created;
    } catch (error) {
      console.warn(
        "[hcs] could not create a topic:",
        error instanceof Error ? error.message : error
      );
      return null;
    }
  };

  const ensure = async (): Promise<string | null> => {
    if (topic !== null) {
      return topic;
    }
    // One creation at a time: two early callers share the same attempt
    // rather than each opening a topic of their own.
    creating ??= (async () => {
      const created = await create();
      topic = created;
      return created;
    })();
    try {
      return await creating;
    } finally {
      creating = null;
    }
  };

  return {
    ensure,
    mode: "live",
    record: async (note) => {
      const target = await ensure();
      if (target === null) {
        return null;
      }
      try {
        const response = await new TopicMessageSubmitTransaction()
          .setTopicId(target)
          .setMessage(encodeNote(note))
          .execute(client);
        const receipt = await response.getReceipt(client);
        const sequence = receipt.topicSequenceNumber;
        if (sequence === null) {
          return null;
        }
        return {
          sequenceNumber: sequence.toNumber(),
          topicId: target,
          transactionId: response.transactionId.toString(),
        };
      } catch (error) {
        console.warn(
          "[hcs] could not post a note:",
          error instanceof Error ? error.message : error
        );
        return null;
      }
    },
    topicId: () => topic,
  };
};

export const stubHcsWriter = (): HcsWriter => ({
  ensure: async () => await Promise.resolve(null),
  mode: "stub",
  record: async () => await Promise.resolve(null),
  topicId: () => null,
});
