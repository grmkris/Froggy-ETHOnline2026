import { LaunchWatch } from "@froggy/domain";
import type { LaunchWatchId, UserId } from "@froggy/domain";
import { Schema } from "effect";

export type LaunchBook = Map<LaunchWatchId, LaunchWatch>;
export interface LaunchStore {
  readonly transact: <T>(
    owner: UserId,
    operation: (book: LaunchBook) => T
  ) => Promise<T>;
  readonly pendingOwners: () => Promise<readonly UserId[]>;
}

const validateReaction = (old: LaunchWatch, watch: LaunchWatch): void => {
  if (old.reaction !== undefined) {
    const next = watch.reaction;
    if (
      next === undefined ||
      next.ruleId !== old.reaction.ruleId ||
      next.createdAt !== old.reaction.createdAt ||
      next.maxChecks !== old.reaction.maxChecks ||
      next.checksUsed < old.reaction.checksUsed ||
      next.entryCursor < old.reaction.entryCursor
    ) {
      throw new Error(
        "watch.reaction_immutable: reaction authority and consumed capacity cannot be replaced."
      );
    }
  }
};

const validateRevision = (old: LaunchWatch, watch: LaunchWatch): void => {
  if (
    old.status !== "active" ||
    watch.revision !== old.revision + 1 ||
    old.sourceTaskId !== watch.sourceTaskId ||
    old.connectionId !== watch.connectionId ||
    !Bun.deepEquals(old.input, watch.input, true) ||
    old.createdAt !== watch.createdAt ||
    old.expiresAt !== watch.expiresAt ||
    old.maxPolls !== watch.maxPolls ||
    old.stubbed !== watch.stubbed ||
    old.providerStubbed !== watch.providerStubbed ||
    watch.pollsUsed < old.pollsUsed ||
    watch.gapCount < old.gapCount
  ) {
    throw new Error(
      "watch.immutable: observation capacity and completed history cannot be replaced."
    );
  }
  validateReaction(old, watch);
  if (
    (old.orphanedEvents ?? []).some(
      (id) => !(watch.orphanedEvents?.includes(id) ?? false)
    ) ||
    old.seen.some((value, index) => watch.seen[index] !== value) ||
    old.events.some(
      (value, index) => !Bun.deepEquals(watch.events[index], value, true)
    )
  ) {
    throw new Error(
      "watch.history: observations and deduplication cannot be erased."
    );
  }
};

export const validateLaunchBook = (
  before: LaunchBook,
  after: LaunchBook
): void => {
  const tasks = new Set<string>();
  for (const [id, candidate] of after) {
    const watch = Schema.decodeUnknownSync(LaunchWatch)(candidate);
    if (
      watch.id !== id ||
      tasks.has(watch.sourceTaskId) ||
      watch.maxPolls !== watch.input.durationMinutes * 2 ||
      watch.pollsUsed > watch.maxPolls ||
      watch.expiresAt !==
        watch.createdAt + watch.input.durationMinutes * 60_000 ||
      (watch.reaction !== undefined &&
        (watch.reaction.checksUsed > watch.reaction.maxChecks ||
          watch.reaction.maxChecks > watch.maxPolls ||
          watch.reaction.entryCursor > watch.events.length))
    ) {
      throw new Error(
        "watch.capacity: invalid identity or observation capacity."
      );
    }
    tasks.add(watch.sourceTaskId);
    const old = before.get(id);
    if (old === undefined || Bun.deepEquals(old, watch, true)) {
      continue;
    }
    validateRevision(old, watch);
  }
  for (const id of before.keys()) {
    if (!after.has(id)) {
      throw new Error(
        "watch.retention: cancel a watch instead of deleting its history."
      );
    }
  }
};

export const memoryLaunchStore = (): LaunchStore => {
  const books = new Map<UserId, LaunchBook>();
  return {
    transact: async (owner, operation) => {
      await Promise.resolve();
      const before = books.get(owner) ?? new Map();
      const after = structuredClone(before);
      const result = structuredClone(operation(after));
      validateLaunchBook(before, after);
      books.set(owner, structuredClone(after));
      return result;
    },
    pendingOwners: async () => {
      await Promise.resolve();
      return [...books]
        .filter(([, book]) =>
          [...book.values()].some((watch) => watch.status === "active")
        )
        .map(([owner]) => owner);
    },
  };
};
