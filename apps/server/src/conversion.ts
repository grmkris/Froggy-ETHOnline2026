/** Durable USDC and HBAR legs. Unknown submissions are reconciled, never sent twice. */

import { ConversionId, KNOWN_ASSETS } from "@froggy/domain";
import type { UserId } from "@froggy/domain";
import type { ConversionRecord, FundingSubmission } from "@froggy/wallet";

import type { Services } from "./services";
import type { ConversionOutcome, SessionDeps, Settled } from "./session";
import { sendUsdc } from "./usdc-transfer";

/**
 * How long a pending leg is given before "the chain has never seen it" means
 * "it was never sent". An accepted broadcast is in a mempool at once and in
 * a block within a minute on Base; five minutes is ample and costs a person
 * nothing they were not already waiting for.
 */
const NEVER_SEEN_GRACE_MS = 5 * 60 * 1000;

/** When a conversion was created: the first 48 bits of its UUIDv7 are milliseconds. */
const issuedAt = (id: ConversionId): number =>
  Number.parseInt(ConversionId.toUuid(id).replaceAll("-", "").slice(0, 12), 16);

const pendingWords = (record: ConversionRecord): string =>
  `Conversion ${record.id} is waiting for ${record.phase === "usdc_pending" ? "USDC confirmation" : "HBAR funding"}. Pending funds cannot be spent. Retry to check confirmation; USDC will not be charged again.${record.error === null ? "" : ` ${record.error}`}`;

/**
 * What a settled USDC leg makes of the record.
 *
 * A broadcast the node refused was never sent: the hash persisted before it
 * names nothing, and keeping it would leave the record "waiting for USDC
 * confirmation" for ever and block every later spend. It is cleared, so the
 * record fails and a retry may claim the same key.
 */
const settledPatch = (
  record: ConversionRecord,
  transfer: Settled
): Pick<ConversionRecord, "phase" | "error"> &
  Partial<Pick<ConversionRecord, "usdcHash">> => {
  let phase: ConversionRecord["phase"] = "usdc_pending";
  if (transfer.ok) {
    phase = "usdc_confirmed";
  } else if (record.usdcHash === null || transfer.confirmation === "failed") {
    phase = "failed";
  }
  const error = transfer.error ?? null;
  return transfer.sent === false && record.usdcHash !== null
    ? { phase, error, usdcHash: null }
    : { phase, error };
};

export const createConversion = (
  services: Services,
  options: { readonly now?: () => number } = {}
): SessionDeps["convert"] | undefined => {
  const treasury = services.environment.treasuryEvmAddress;
  if (treasury === null || services.accounts === null) {
    return undefined;
  }
  const { evmNetwork, hederaNetwork } = services.environment;
  const store = services.store.conversions;
  const now = options.now ?? Date.now;

  /**
   * A pending USDC leg whose transaction the chain has never seen, once the
   * grace has passed. The id is time-ordered, so its issue time is the age.
   */
  const neverSent = async (record: ConversionRecord): Promise<boolean> => {
    if (record.usdcHash === null) {
      return false;
    }
    if (now() - issuedAt(record.id) < NEVER_SEEN_GRACE_MS) {
      return false;
    }
    return !(await services.evmTransactionKnown(record.usdcHash));
  };

  const update = async (
    record: ConversionRecord,
    patch: Parameters<typeof store.update>[2]
  ): Promise<ConversionRecord> => {
    if (!(await store.update(record.id, record.phase, patch))) {
      throw new Error(
        `Conversion ${record.id} is being recovered by another worker. Retry to check its status.`
      );
    }
    return { ...record, ...patch };
  };

  const fund = async (
    userId: UserId,
    record: ConversionRecord
  ): Promise<ConversionRecord> => {
    const { accounts } = services;
    if (accounts === null) {
      return await update(record, {
        error: "Hedera funding is unavailable on this deployment.",
      });
    }
    let current = await update(record, { phase: "hbar_pending", error: null });
    let prepared: FundingSubmission | null = null;
    try {
      const moved = await accounts.fund(
        userId,
        record.usdMicros,
        async (submission) => {
          current = await update(current, { funding: submission });
          prepared = submission;
        }
      );
      return await update(current, {
        phase: "funded",
        error: null,
        funding: current.funding ?? {
          transactionId: moved.transactionId,
          tinybars: moved.tinybars,
          accountId: await accounts.lookup(userId),
          alias: null,
          custody: null,
        },
      });
    } catch (error) {
      return await update(current, {
        // Before the persisted submission hook, no bytes could have left.
        phase: prepared === null ? "usdc_confirmed" : "hbar_pending",
        error:
          error instanceof Error
            ? error.message.slice(0, 1000)
            : "HBAR funding failed.",
      });
    }
  };

  const advance = async (
    userId: UserId,
    initial: ConversionRecord
  ): Promise<ConversionRecord> => {
    if (
      initial.evmNetwork !== evmNetwork ||
      initial.hederaNetwork !== hederaNetwork
    ) {
      throw new Error(
        `Conversion ${initial.id} belongs to another network. Restore that network to reconcile it.`
      );
    }
    let record = initial;
    if (record.phase === "usdc_pending" && record.usdcHash !== null) {
      const receipt = await services.evmReceipt(record.usdcHash);
      if (receipt !== null) {
        record = await update(record, {
          phase: receipt.status === "success" ? "usdc_confirmed" : "failed",
          error:
            receipt.status === "success" ? null : "USDC transfer reverted.",
        });
      } else if (await neverSent(record)) {
        // The hash was persisted before a broadcast that never reached the
        // chain: the node has never seen it, and enough time has passed for
        // an accepted one to be in a mempool or a block. Waiting longer would
        // only keep this person from spending. Cleared, so a retry may claim
        // the key.
        record = await update(record, {
          phase: "failed",
          error:
            "The USDC transfer was never seen by the network; nothing was sent.",
          usdcHash: null,
        });
      }
    }
    if (
      record.phase === "hbar_pending" &&
      record.funding !== null &&
      services.accounts !== null
    ) {
      const status = await services.accounts.reconcile(userId, record.funding);
      if (status === "success") {
        record = await update(record, { phase: "funded", error: null });
      } else if (status === "failed") {
        record = await update(record, {
          phase: "usdc_confirmed",
          funding: null,
          error: "The previous HBAR transaction failed.",
        });
      }
    }
    if (record.phase === "usdc_confirmed") {
      record = await fund(userId, record);
    }
    if (record.phase === "funded") {
      await store.credit(userId, record.id);
      record = { ...record, credited: true };
    }
    return record;
  };

  const outcomeOf = (record: ConversionRecord): ConversionOutcome => {
    const confirmed =
      record.phase !== "usdc_pending" && record.phase !== "failed";
    const transfer: Settled = {
      network: record.evmNetwork,
      ok: confirmed,
      sent: record.usdcHash !== null,
      stubbed: services.environment.modes.privy === "stub",
      transactionId: record.usdcHash,
    };
    let reported = confirmed
      ? transfer
      : { ...transfer, error: record.error ?? pendingWords(record) };
    if (record.phase === "failed" && record.usdcHash !== null) {
      reported = { ...reported, confirmation: "failed" };
    }
    return {
      credited: record.credited,
      funded:
        record.phase === "funded" && record.credited
          ? {
              note: `HBAR funding confirmed (${record.funding?.transactionId ?? record.id}).`,
            }
          : { error: pendingWords(record) },
      transfer: reported,
    };
  };

  return {
    asset: KNOWN_ASSETS[`${evmNetwork}:usdc`],
    payeeId: treasury,
    payeeLabel: "the treasury",
    recover: async (userId) => {
      const pending = await store.pending(userId);
      const recovered = await Promise.all(
        pending.map(async (record) => await advance(userId, record))
      );
      const unresolved = recovered.find(
        (record) => !record.credited && record.phase !== "failed"
      );
      return unresolved === undefined ? null : pendingWords(unresolved);
    },
    perform: async (
      userId,
      wallet,
      usdMicros,
      key
    ): Promise<ConversionOutcome> => {
      const claimed = await store.create(userId, {
        id: ConversionId.generate(),
        key,
        usdMicros,
        evmNetwork,
        hederaNetwork,
        phase: "usdc_pending",
        usdcHash: null,
        funding: null,
        error: null,
        credited: false,
      });
      let { record, created } = claimed;
      if (
        record.usdMicros !== usdMicros ||
        record.evmNetwork !== evmNetwork ||
        record.hederaNetwork !== hederaNetwork
      ) {
        throw new Error(
          "This conversion key belongs to a different amount or network. Use a fresh payment request."
        );
      }
      // A refusal before signing is safe to retry after authority is fixed.
      // The phase claim still permits exactly one caller to submit.
      if (!created && record.phase === "failed" && record.usdcHash === null) {
        created = await store.update(record.id, "failed", {
          phase: "usdc_pending",
          error: null,
        });
        if (created) {
          record = { ...record, phase: "usdc_pending", error: null };
        }
      }
      if (created) {
        try {
          // The person's wallet holds USDC and no ETH, so the treasury pays
          // the gas where it can: an authorization it settles, under both
          // policies. A deployment without a treasury wallet still signs a
          // plain transfer, which needs ETH the person may not have.
          const transfer = await sendUsdc(
            services,
            wallet,
            treasury,
            String(usdMicros),
            async (hash) => {
              record = await update(record, { usdcHash: hash });
            },
            services.evmRelayFor(wallet) ?? services.evmTransfersFor(wallet)
          );
          record = await update(record, settledPatch(record, transfer));
        } catch (error) {
          // Preserve the known submission even if persistence itself is down.
          // The pre-broadcast record still lets a later worker reconcile it.
          record = {
            ...record,
            phase: record.usdcHash === null ? "failed" : "usdc_pending",
            error:
              error instanceof Error
                ? error.message.slice(0, 1000)
                : "USDC submission failed.",
          };
          await store
            .update(record.id, "usdc_pending", {
              phase: record.phase,
              error: record.error,
            })
            .catch(() => false);
        }
      }
      try {
        record = await advance(userId, record);
      } catch (error) {
        record = {
          ...record,
          error:
            error instanceof Error
              ? error.message.slice(0, 1000)
              : "Conversion recovery is unavailable.",
        };
      }
      return outcomeOf(record);
    },
  };
};
