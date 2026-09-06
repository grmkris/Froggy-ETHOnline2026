/**
 * Pairing codes: how a Telegram account becomes somebody's.
 *
 * The code is minted in the workspace by a signed-in person and typed into
 * Telegram as `/start CODE`. It is short because a person types it, random
 * because it is the only thing standing between a stranger's Telegram and
 * your wallet's approval cards, and short-lived because a code that lasts is a
 * code that leaks.
 */

import { randomInt } from "node:crypto";

import type { UserId } from "@froggy/domain";

/** No 0/O/1/I: read aloud, typed on a phone. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const LENGTH = 6;
const TTL_MS = 10 * 60 * 1000;

export interface PairingCode {
  readonly code: string;
  readonly expiresAt: number;
}

interface Pending {
  readonly expiresAt: number;
  readonly userId: UserId;
}

export class PairingCodes {
  private readonly pending = new Map<string, Pending>();
  private readonly now: () => number;
  private readonly random: () => number;

  constructor(options: { now?: () => number; random?: () => number } = {}) {
    this.now = options.now ?? Date.now;
    this.random = options.random ?? (() => randomInt(2 ** 32) / 2 ** 32);
  }

  /** A fresh code for this person; any earlier one of theirs is void. */
  mint(userId: UserId): PairingCode {
    this.sweep();
    for (const [code, entry] of this.pending) {
      if (entry.userId === userId) {
        this.pending.delete(code);
      }
    }
    let code = this.generate();
    while (this.pending.has(code)) {
      code = this.generate();
    }
    const expiresAt = this.now() + TTL_MS;
    this.pending.set(code, { expiresAt, userId });
    return { code, expiresAt };
  }

  /** Who a code belongs to. Single use: a redeemed code is gone. */
  redeem(raw: string): UserId | null {
    this.sweep();
    const code = raw.trim().toUpperCase();
    const entry = this.pending.get(code);
    if (entry === undefined) {
      return null;
    }
    this.pending.delete(code);
    return entry.userId;
  }

  private generate(): string {
    let code = "";
    for (let index = 0; index < LENGTH; index += 1) {
      code += ALPHABET[Math.floor(this.random() * ALPHABET.length)] ?? "A";
    }
    return code;
  }

  private sweep(): void {
    const now = this.now();
    for (const [code, entry] of this.pending) {
      if (entry.expiresAt <= now) {
        this.pending.delete(code);
      }
    }
  }
}
