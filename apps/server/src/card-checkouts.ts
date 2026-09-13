import {
  CardCheckoutId,
  CheckoutInspection,
  PaymentMethodId,
  TradeInput,
  calculateCardFunding,
  cardCheckoutReserved,
} from "@froggy/domain";
import type {
  CardCheckout,
  CardCredentials,
  PaymentMethod,
  TaskId,
  UserId,
} from "@froggy/domain";
import type { CardCheckoutApprove, PaymentMethodSave } from "@froggy/protocol";
import type { CardBook, CardStore, PrivyServer } from "@froggy/wallet";
import { Schema } from "effect";

import type { CardRates } from "./card-rates";
import type { CardVault } from "./card-vault";
import { bridgeDeposit, CARD_BRIDGE } from "./trading/card-bridge";
import type { CardLineaReader } from "./trading/card-bridge-observation";
import type { TradeContext, TradeCoordinator } from "./trading/coordinator";

const update = (
  book: CardBook,
  checkout: CardCheckout,
  patch: Partial<CardCheckout>,
  now: number
): CardCheckout => {
  const next = {
    ...checkout,
    ...patch,
    revision: checkout.revision + 1,
    updatedAt: now,
  };
  book.checkouts.set(next.id, next);
  return next;
};
const activeMethod = (
  book: CardBook,
  id: PaymentMethodId,
  revision?: number
): PaymentMethod => {
  const method = book.methods.get(id);
  if (
    method === undefined ||
    method.revokedAt !== null ||
    (revision !== undefined && method.revision !== revision)
  ) {
    throw new Error(
      "card.method: payment method was replaced, revoked or is unavailable."
    );
  }
  return method;
};
const checkoutIn = (book: CardBook, id: CardCheckoutId): CardCheckout => {
  const checkout = book.checkouts.get(id);
  if (checkout === undefined) {
    throw new Error("card.missing: checkout not found.");
  }
  return checkout;
};
export interface CardCheckoutOptions {
  readonly enabled: boolean;
  readonly liveCardEntry: boolean;
  readonly store: CardStore;
  readonly trades: TradeCoordinator;
  readonly privy: PrivyServer;
  readonly vault: CardVault;
  readonly rates: CardRates;
  readonly linea: CardLineaReader;
  readonly now: () => number;
}
export class CardCheckouts {
  readonly options: CardCheckoutOptions;
  constructor(options: CardCheckoutOptions) {
    this.options = options;
  }
  private enabled(): void {
    if (!this.options.enabled) {
      throw new Error("card.disabled: saved-card checkout is disabled.");
    }
  }
  async methods(owner: UserId) {
    const methods = await this.options.store.transact(owner, (book) => [
      ...book.methods.values(),
    ]);
    return {
      v: 1 as const,
      enabled: this.options.enabled,
      liveCardEntry: this.options.liveCardEntry,
      methods: await Promise.all(
        methods.map(async (method) => {
          const observed =
            method.revokedAt === null
              ? await this.options.linea
                  .balance(method.fundingAddress)
                  .catch(() => null)
              : null;
          return {
            method,
            balance: observed?.units ?? null,
            observedAt: observed?.observedAt ?? null,
            stubbed: this.options.linea.stubbed,
          };
        })
      ),
    };
  }
  async saveMethod(
    owner: UserId,
    input: PaymentMethodSave,
    id = PaymentMethodId.generate()
  ): Promise<PaymentMethod> {
    this.enabled();
    const old = await this.options.store.transact(owner, (book) =>
      book.methods.get(id)
    );
    if (
      (old !== undefined &&
        (old.revokedAt !== null || old.revision !== input.expectedRevision)) ||
      (old === undefined && input.expectedRevision !== undefined)
    ) {
      throw new Error(
        "card.revision: reload this payment method before replacing it."
      );
    }
    const revision = (old?.revision ?? 0) + 1;
    const envelope = await this.options.vault.seal(
      owner,
      id,
      revision,
      input.credentials
    );
    return await this.options.store.transact(owner, (book) => {
      const current = book.methods.get(id);
      if (current?.revision !== old?.revision) {
        throw new Error("card.revision: payment method changed.");
      }
      const method: PaymentMethod = {
        v: 1,
        id,
        revision,
        label: input.label,
        fundingAddress: input.fundingAddress,
        fundingNetwork: CARD_BRIDGE.destinationNetwork,
        last4: input.credentials.number.slice(-4),
        createdAt: old?.createdAt ?? this.options.now(),
        revokedAt: null,
      };
      book.methods.set(id, method);
      book.credentials.set(id, envelope);
      this.invalidate(book, id);
      return method;
    });
  }
  private invalidate(book: CardBook, id: PaymentMethodId): void {
    for (const checkout of book.checkouts.values()) {
      if (checkout.paymentMethodId !== id || checkout.stoppedAt !== null) {
        continue;
      }
      update(
        book,
        checkout,
        {
          stoppedAt: this.options.now(),
          stage:
            checkout.paymentDispatchedAt === null
              ? "stopped"
              : "outcome_unknown",
          error:
            "Payment method changed. Further credential dispatch is stopped; submitted funding remains recoverable.",
        },
        this.options.now()
      );
    }
  }
  async revoke(owner: UserId, id: PaymentMethodId): Promise<void> {
    await this.options.store.transact(owner, (book) => {
      const method = book.methods.get(id);
      if (method === undefined) {
        throw new Error("card.method: payment method not found.");
      }
      if (method.revokedAt !== null) {
        return;
      }
      book.methods.set(id, {
        ...method,
        revision: method.revision + 1,
        revokedAt: this.options.now(),
      });
      book.credentials.delete(id);
      this.invalidate(book, id);
    });
  }
  async list(owner: UserId): Promise<readonly CardCheckout[]> {
    return await this.options.store.transact(owner, (book) =>
      [...book.checkouts.values()]
        .toSorted((a, b) => b.createdAt - a.createdAt)
        .slice(0, 50)
    );
  }
  async get(owner: UserId, id: CardCheckoutId): Promise<CardCheckout> {
    return await this.options.store.transact(owner, (book) =>
      checkoutIn(book, id)
    );
  }
  async prepare(
    owner: UserId,
    methodId: PaymentMethodId,
    taskId: TaskId,
    key: string
  ): Promise<CardCheckout> {
    this.enabled();
    return await this.options.store.transact(owner, (book) => {
      const old = [...book.checkouts.values()].find(
        (checkout) => checkout.idempotencyKey === key
      );
      if (old !== undefined) {
        if (old.taskId !== taskId || old.paymentMethodId !== methodId) {
          throw new Error(
            "card.idempotency: this key belongs to another purchase."
          );
        }
        return old;
      }
      const method = activeMethod(book, methodId);
      const checkout: CardCheckout = {
        v: 1,
        id: CardCheckoutId.generate(),
        revision: 1,
        idempotencyKey: key,
        paymentMethodId: methodId,
        paymentMethodRevision: method.revision,
        fundingAddress: method.fundingAddress,
        taskId,
        stage: "inspecting",
        inspection: null,
        funding: null,
        fingerprint: null,
        expiresAt: null,
        approvedAt: null,
        tradeId: null,
        bridge: null,
        stoppedAt: null,
        paymentDispatchedAt: null,
        providerRunId: null,
        order: null,
        charge: "unverified",
        error: null,
        createdAt: this.options.now(),
        updatedAt: this.options.now(),
        stubbed: this.options.linea.stubbed,
      };
      book.checkouts.set(checkout.id, checkout);
      return checkout;
    });
  }
  private async prepareBridge(
    context: TradeContext,
    checkout: CardCheckout,
    wallet: string,
    amount: bigint,
    shortfall: bigint,
    attempt: number
  ): Promise<{
    readonly id: NonNullable<CardCheckout["tradeId"]>;
    readonly amount: string;
    readonly minimum: string;
    readonly expiresAt: number;
    readonly deadline: number;
    readonly stubbed: boolean;
  }> {
    if (attempt >= 3) {
      throw new Error(
        "card.bridge_fee: no quote covers the shortfall after three attempts."
      );
    }
    const input = Schema.decodeUnknownSync(TradeInput)({
      network: CARD_BRIDGE.sourceNetwork,
      venue: "uniswap",
      action: "bridge",
      wallet,
      tokenIn: CARD_BRIDGE.inputToken,
      tokenOut: CARD_BRIDGE.outputToken,
      amount: amount.toString(),
      position: null,
      slippageBps: 50,
      maxNativeFee: "1",
      bridge: {
        destinationNetwork: CARD_BRIDGE.destinationNetwork,
        recipient: checkout.fundingAddress,
        provenance: "user",
        paymentMethodId: checkout.paymentMethodId,
        paymentMethodRevision: checkout.paymentMethodRevision,
        checkoutId: checkout.id,
      },
    });
    const trade = await this.options.trades.prepare(context, {
      v: 1,
      input,
      idempotencyKey: `card:${checkout.id}:${attempt}`,
    });
    const [step] = trade.steps;
    if (
      trade.status !== "awaiting_approval" ||
      trade.minimumOutput === null ||
      step === undefined
    ) {
      throw new Error(
        "card.bridge: a verified, simulated bridge quote is unavailable."
      );
    }
    const minimum = BigInt(trade.minimumOutput);
    if (minimum < shortfall) {
      await this.options.trades.cancel(context.session.userId, trade.id);
      return await this.prepareBridge(
        context,
        checkout,
        wallet,
        amount + shortfall - minimum,
        shortfall,
        attempt + 1
      );
    }
    let deadline = this.options.now() + 7_200_000;
    if (!trade.stubbed) {
      const deposit =
        step.payload.kind === "evm_calls"
          ? step.payload.calls.at(-1)
          : undefined;
      if (deposit === undefined) {
        throw new Error("card.bridge: verified deposit unavailable.");
      }
      deadline = bridgeDeposit(input, deposit.data).deadline * 1000;
    }
    return {
      id: trade.id,
      amount: amount.toString(),
      minimum: minimum.toString(),
      expiresAt: step.expiresAt,
      deadline,
      stubbed: trade.stubbed,
    };
  }
  async inspect(
    context: TradeContext,
    id: CardCheckoutId,
    summary: string
  ): Promise<CardCheckout> {
    const owner = context.session.userId;
    const checkout = await this.get(owner, id);
    if (checkout.stage !== "inspecting" || checkout.stoppedAt !== null) {
      return checkout;
    }
    try {
      const inspection = Schema.decodeUnknownSync(CheckoutInspection)(
        JSON.parse(summary)
      );
      const [rate, balance, reserved, wallets] = await Promise.all([
        this.options.rates.get(inspection.currency),
        this.options.linea.balance(checkout.fundingAddress),
        this.options.store.transact(owner, (book) => {
          activeMethod(
            book,
            checkout.paymentMethodId,
            checkout.paymentMethodRevision
          );
          return [...book.checkouts.values()]
            .filter(
              (entry) =>
                entry.id !== id &&
                entry.fundingAddress.toLowerCase() ===
                  checkout.fundingAddress.toLowerCase() &&
                cardCheckoutReserved(entry)
            )
            .reduce(
              (sum, entry) => sum + BigInt(entry.funding?.required ?? "0"),
              0n
            )
            .toString();
        }),
        this.options.privy.paymentWallets(owner),
      ]);
      let funding = calculateCardFunding({
        total: inspection.total,
        rate: rate.rate,
        usdRate: rate.usdRate,
        rateAt: rate.observedAt,
        balanceAt: balance.observedAt,
        balance: balance.units,
        reserved,
        now: this.options.now(),
        stubbed: checkout.stubbed || rate.stubbed,
      });
      let tradeId: CardCheckout["tradeId"] = null;
      let expiresAt = Math.min(
        this.options.now() + 60_000,
        rate.observedAt + 60_000,
        balance.observedAt + 60_000
      );
      let bridge: CardCheckout["bridge"] = null;
      if (BigInt(funding.shortfall) > 0n) {
        const wallet =
          wallets.ethereum?.address ??
          (this.options.linea.stubbed
            ? "0x1111111111111111111111111111111111111111"
            : undefined);
        if (wallet === undefined) {
          throw new Error(
            "card.wallet: the Base funding wallet is unavailable."
          );
        }
        const quoted = await this.prepareBridge(
          context,
          checkout,
          wallet,
          BigInt(funding.shortfall),
          BigInt(funding.shortfall),
          0
        );
        tradeId = quoted.id;
        expiresAt = Math.min(expiresAt, quoted.expiresAt);
        funding = {
          ...funding,
          baseDebit: quoted.amount,
          minimumArrival: quoted.minimum,
          bridgeDeduction: (
            BigInt(quoted.amount) - BigInt(quoted.minimum)
          ).toString(),
          stubbed: funding.stubbed || quoted.stubbed,
        };
        bridge = {
          destinationStartBlock: balance.block,
          cursor: balance.block,
          depositId: null,
          sourceTransaction: null,
          sourceBlockHash: null,
          sourceConfirmed: false,
          fillTransaction: null,
          fillBlock: null,
          fillBlockHash: null,
          destinationConfirmed: false,
          fillDeadline: quoted.deadline,
        };
      }

      const fingerprint = new Bun.CryptoHasher("sha256")
        .update(
          JSON.stringify({
            id,
            method: checkout.paymentMethodId,
            revision: checkout.paymentMethodRevision,
            inspection,
            funding,
            tradeId,
            expiresAt,
          })
        )
        .digest("hex");
      return await this.options.store.transact(owner, (book) => {
        const current = checkoutIn(book, id);
        activeMethod(
          book,
          current.paymentMethodId,
          current.paymentMethodRevision
        );
        if (
          current.revision !== checkout.revision ||
          current.stoppedAt !== null
        ) {
          throw new Error("card.changed: checkout changed during inspection.");
        }
        return update(
          book,
          current,
          {
            inspection,
            funding,
            tradeId,
            bridge,
            expiresAt,
            fingerprint,
            stage: "awaiting_approval",
            stubbed: funding.stubbed,
          },
          this.options.now()
        );
      });
    } catch (error) {
      return await this.pause(
        owner,
        id,
        error instanceof Error && /^card\.[a-z_]+:/u.test(error.message)
          ? error.message
          : "Checkout total is missing or ambiguous. Establish final tax, shipping and currency, then review again."
      );
    }
  }
  async pause(
    owner: UserId,
    id: CardCheckoutId,
    error: string
  ): Promise<CardCheckout> {
    return await this.options.store.transact(owner, (book) => {
      const checkout = checkoutIn(book, id);
      return update(
        book,
        checkout,
        {
          stage:
            checkout.paymentDispatchedAt === null
              ? "needs_help"
              : "outcome_unknown",
          error: error.slice(0, 300),
        },
        this.options.now()
      );
    });
  }
  private async review(
    owner: UserId,
    id: CardCheckoutId,
    fingerprint: string
  ): Promise<CardCheckout> {
    return await this.options.store.transact(owner, (book) => {
      const checkout = checkoutIn(book, id);
      activeMethod(
        book,
        checkout.paymentMethodId,
        checkout.paymentMethodRevision
      );
      if (
        checkout.stoppedAt !== null ||
        checkout.fingerprint !== fingerprint ||
        checkout.expiresAt === null ||
        checkout.expiresAt <= this.options.now() ||
        checkout.stage !== "awaiting_approval"
      ) {
        throw new Error(
          "card.approval: this exact purchase review is no longer active. Prepare a new review."
        );
      }
      return checkout;
    });
  }
  async authorization(
    context: TradeContext,
    id: CardCheckoutId,
    input: typeof CardCheckoutApprove.Type
  ) {
    const checkout = await this.review(
      context.session.userId,
      id,
      input.fingerprint
    );
    if (checkout.tradeId === null) {
      return { v: 1 as const, request: null };
    }
    if (input.tradeAnswer === null) {
      throw new Error(
        "card.approval: exact funding authorization is required."
      );
    }
    return await this.options.trades.authorization(
      context,
      checkout.tradeId,
      input.tradeAnswer
    );
  }
  async approve(
    context: TradeContext,
    id: CardCheckoutId,
    input: typeof CardCheckoutApprove.Type,
    token: string
  ): Promise<CardCheckout> {
    this.enabled();
    if (context.connectionId !== null) {
      throw new Error(
        "card.human_only: only the owner can approve a purchase."
      );
    }
    const owner = context.session.userId;
    const existing = await this.get(owner, id);
    if (
      existing.approvedAt !== null &&
      existing.fingerprint === input.fingerprint
    ) {
      return existing;
    }
    const checkout = await this.review(owner, id, input.fingerprint);
    if (
      checkout.tradeId !== null &&
      (input.tradeAnswer === null ||
        input.tradeAnswer.decision !== "allow_once")
    ) {
      throw new Error("card.approval: exact funding approval is required.");
    }
    const balance = await this.options.linea.balance(checkout.fundingAddress);
    const claimed = await this.options.store.transact(owner, (book) => {
      const current = checkoutIn(book, id);
      activeMethod(
        book,
        current.paymentMethodId,
        current.paymentMethodRevision
      );
      if (
        current.revision !== checkout.revision ||
        current.stoppedAt !== null ||
        (current.expiresAt ?? 0) <= this.options.now()
      ) {
        throw new Error("card.approval: purchase changed or expired.");
      }
      const reserved = [...book.checkouts.values()]
        .filter(
          (entry) =>
            entry.id !== id &&
            entry.fundingAddress.toLowerCase() ===
              current.fundingAddress.toLowerCase() &&
            cardCheckoutReserved(entry)
        )
        .reduce(
          (sum, entry) => sum + BigInt(entry.funding?.required ?? "0"),
          0n
        );
      if (
        current.funding === null ||
        BigInt(balance.units) +
          BigInt(current.funding.minimumArrival) -
          reserved <
          BigInt(current.funding.required)
      ) {
        throw new Error(
          "card.balance: Linea balance changed. A new review is required."
        );
      }
      return update(
        book,
        current,
        {
          approvedAt: this.options.now(),
          stage: current.tradeId === null ? "paying" : "funding",
          bridge:
            current.bridge === null
              ? null
              : {
                  ...current.bridge,
                  destinationStartBlock: balance.block,
                  cursor: balance.block,
                },
        },
        this.options.now()
      );
    });
    if (claimed.tradeId !== null && input.tradeAnswer !== null) {
      try {
        await this.options.trades.answer(
          context,
          claimed.tradeId,
          input.tradeAnswer,
          token
        );
      } catch {
        return await this.pause(
          owner,
          id,
          "Funding could not be confirmed. Inspect the existing funding trade; no extra debit will be attempted."
        );
      }
    }
    return await this.refresh(owner, id);
  }
  async refresh(owner: UserId, id: CardCheckoutId): Promise<CardCheckout> {
    const checkout = await this.get(owner, id);
    if (
      checkout.approvedAt === null ||
      checkout.tradeId === null ||
      checkout.bridge === null ||
      checkout.funding === null
    ) {
      return checkout;
    }
    const trade = await this.options.trades.get(owner, checkout.tradeId, null);
    const [step] = trade.steps;
    if (step === undefined || step.transactionId === null) {
      return checkout;
    }
    let observation: NonNullable<CardCheckout["bridge"]> = {
      ...checkout.bridge,
      sourceTransaction: step.transactionId,
    };
    try {
      observation = await this.options.linea.observe(
        trade.input,
        checkout.funding.minimumArrival,
        observation
      );
    } catch {
      return checkout;
    }
    return await this.options.store.transact(owner, (book) => {
      const current = checkoutIn(book, id);
      if (current.revision !== checkout.revision) {
        return current;
      }
      const arrived =
        observation.sourceConfirmed && observation.destinationConfirmed;
      let { stage } = current;
      if (current.stoppedAt === null && current.paymentDispatchedAt === null) {
        stage = "funding";
        if (arrived) {
          stage = "paying";
        } else if (this.options.now() > observation.fillDeadline) {
          stage = "recovery_required";
        }
      }
      return update(
        book,
        current,
        {
          bridge: observation,
          stage,
          error:
            stage === "recovery_required"
              ? "The fill deadline passed. Funding needs recovery; this does not imply a refund. No resubmission will occur."
              : current.error,
        },
        this.options.now()
      );
    });
  }
  async stop(owner: UserId, id: CardCheckoutId): Promise<CardCheckout> {
    const stopped = await this.options.store.transact(owner, (book) => {
      const checkout = checkoutIn(book, id);
      if (checkout.stoppedAt !== null) {
        return checkout;
      }
      return update(
        book,
        checkout,
        {
          stoppedAt: this.options.now(),
          stage:
            checkout.paymentDispatchedAt === null
              ? "stopped"
              : "outcome_unknown",
          error:
            "Further purchase work stopped. Submitted funding and merchant charges are not reversed.",
        },
        this.options.now()
      );
    });
    if (stopped.tradeId !== null) {
      await this.options.trades
        .cancel(owner, stopped.tradeId)
        .catch(() => null);
    }
    return stopped;
  }
  async dispatchCredentials(
    owner: UserId,
    id: CardCheckoutId,
    frames: { readonly merchant: string; readonly hosts: readonly string[] }
  ): Promise<CardCredentials> {
    this.enabled();
    const checkout = await this.get(owner, id);
    if (!checkout.stubbed && !this.options.liveCardEntry) {
      throw new Error(
        "card.frame_verification: live entry requires the controlled cross-origin acceptance check."
      );
    }
    const envelope = await this.options.store.transact(owner, (book) => {
      const current = checkoutIn(book, id);
      activeMethod(
        book,
        current.paymentMethodId,
        current.paymentMethodRevision
      );
      const { inspection } = current;
      if (
        current.stage !== "paying" ||
        current.approvedAt === null ||
        current.stoppedAt !== null ||
        current.paymentDispatchedAt !== null ||
        inspection === null ||
        frames.merchant !== inspection.merchant ||
        inspection.paymentHosts.some((host) => !frames.hosts.includes(host))
      ) {
        throw new Error(
          "card.dispatch: purchase or current merchant frames differ from approval."
        );
      }
      const saved = book.credentials.get(current.paymentMethodId);
      if (saved === undefined) {
        throw new Error("card.vault: saved credentials are unavailable.");
      }
      // Claim before decryption/dispatch. A crash cannot automatically create a second payment run.
      update(
        book,
        current,
        { paymentDispatchedAt: this.options.now() },
        this.options.now()
      );
      return saved;
    });
    return await this.options.vault.open(
      owner,
      checkout.paymentMethodId,
      checkout.paymentMethodRevision,
      envelope
    );
  }
  async dispatched(
    owner: UserId,
    id: CardCheckoutId,
    providerRunId: string
  ): Promise<void> {
    await this.options.store.transact(owner, (book) => {
      const checkout = checkoutIn(book, id);
      update(book, checkout, { providerRunId }, this.options.now());
    });
  }
  async outcome(
    owner: UserId,
    id: CardCheckoutId,
    summary: string
  ): Promise<CardCheckout> {
    const Outcome = Schema.Struct({
      v: Schema.Literal(1),
      status: Schema.Literals([
        "order_observed",
        "needs_help",
        "declined",
        "changed",
        "unknown",
      ]),
      order: Schema.NullOr(Schema.String.check(Schema.isMaxLength(300))),
    });
    const decoded = Schema.decodeUnknownResult(Outcome)(
      summary.length <= 4096 ? JSON.parse(summary || "null") : null
    );
    return await this.options.store.transact(owner, (book) => {
      const checkout = checkoutIn(book, id);
      const result = decoded._tag === "Success" ? decoded.success : null;
      const observed =
        result?.status === "order_observed" && result.order !== null;
      let stage: CardCheckout["stage"] = "outcome_unknown";
      if (observed) {
        stage = "order_observed";
      } else if (result?.status === "needs_help") {
        stage = "needs_help";
      }
      return update(
        book,
        checkout,
        {
          stage,
          order: observed
            ? (result.order?.replaceAll(/\d[\d -]{2,}/gu, "[redacted]") ?? null)
            : null,
          error: observed
            ? null
            : "Inspect the existing order page. Froggy will not submit another card payment automatically.",
        },
        this.options.now()
      );
    });
  }
}
