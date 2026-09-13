import {
  CreditPurchase,
  CreditPurchaseId,
  KNOWN_ASSETS,
  creditUnits,
} from "@froggy/domain";
import type { CreditLimits, UserId } from "@froggy/domain";
import {
  PaymentChallenge,
  creditEvmAuthorization,
  creditEvmPayer,
  describePayment,
  evmPayer,
  isEvmNetwork,
  lookupHederaTransactionDetails,
} from "@froggy/payments";
import type { CreditSettlement, EvmCreditSettlement } from "@froggy/payments";
import type { CreditState, HederaReceiving } from "@froggy/protocol";
import { CreditStoreError, readTokenDomain } from "@froggy/wallet";
import type { FundingPurchase } from "@froggy/wallet";
import { Schema } from "effect";

import { detached } from "./detached";
import type { Services } from "./services";

export const CreditPurchaseRequest = Schema.Struct({
  v: Schema.Literal(1),
  idempotencyKey: Schema.String.check(
    Schema.isMinLength(1),
    Schema.isMaxLength(128)
  ),
  amountUsdMicros: Schema.Int.check(
    Schema.isBetween({ minimum: 1_000_000, maximum: 100_000_000 })
  ),
  network: Schema.String,
});
export type CreditPurchaseRequest = typeof CreditPurchaseRequest.Type;

interface Dependencies extends Pick<
  Services,
  | "environment"
  | "store"
  | "privy"
  | "rates"
  | "oracle"
  | "hederaPayerFor"
  | "evmRpc"
  | "hcs"
  | "accounts"
> {
  readonly base: EvmCreditSettlement | null;
  readonly withTreasuryLock: <T>(
    operation: () => Promise<T>,
    purchaseId?: CreditPurchaseId
  ) => Promise<T>;
}

const publicPurchase = (purchase: FundingPurchase): CreditPurchase =>
  Schema.decodeUnknownSync(CreditPurchase)(purchase);
const hash = (value: string): string =>
  new Bun.CryptoHasher("sha256").update(value).digest("hex");
/** Owner-approved funding. No caller supplies a recipient, signer, price, or credit quantity. */
export class CreditFunding {
  private readonly running = new Map<CreditPurchaseId, Promise<void>>();
  private readonly signing = new Map<
    CreditPurchaseId,
    Promise<CreditPurchase>
  >();

  private readonly deps: Dependencies;

  constructor(deps: Dependencies) {
    this.deps = deps;
  }

  async prepareHedera(owner: UserId): Promise<HederaReceiving> {
    const { environment, accounts } = this.deps;
    if (environment.modes.hedera === "stub" && environment.allowStubs) {
      return {
        v: 1,
        network: environment.hederaNetwork,
        accountId: "0.0.9000001",
        alias: null,
        stubbed: true,
      };
    }
    if (accounts === null) {
      throw new CreditStoreError(
        "funding_unavailable",
        "Personal HBAR receiving addresses are unavailable."
      );
    }
    return { v: 1, ...(await accounts.prepare(owner)) };
  }

  methods(): CreditState["funding"] {
    const { environment, base, rates, accounts } = this.deps;
    const baseStubbed =
      environment.modes.privy === "stub" && environment.allowStubs;
    const hederaStubbed =
      environment.modes.hedera === "stub" && environment.allowStubs;
    const usdc = KNOWN_ASSETS[`${environment.evmNetwork}:usdc`];
    const hbarAvailable =
      hederaStubbed ||
      (accounts !== null && rates.current(Date.now()) !== null);
    return [
      {
        network: environment.evmNetwork,
        label:
          environment.evmNetwork === "eip155:8453"
            ? "USDC on Base"
            : "USDC on Base Sepolia",
        asset: usdc.id,
        payTo: environment.treasuryEvmAddress ?? `0x${"0".repeat(40)}`,
        available: baseStubbed || base !== null,
        stubbed: baseStubbed,
        reason:
          baseStubbed || base !== null
            ? null
            : "USDC credit settlement is unavailable.",
      },
      {
        network: environment.hederaNetwork,
        label:
          environment.hederaNetwork === "hedera:mainnet"
            ? "HBAR on Hedera"
            : "HBAR on Hedera testnet",
        asset: "0.0.0",
        payTo: this.deps.oracle.payTo,
        available: hbarAvailable,
        stubbed: hederaStubbed,
        reason: hbarAvailable
          ? null
          : "HBAR funding needs a working rate and a personal Hedera account.",
      },
    ];
  }

  async create(
    owner: UserId,
    input: CreditPurchaseRequest,
    limits: CreditLimits
  ): Promise<CreditPurchase> {
    if (input.amountUsdMicros % 10_000 !== 0) {
      throw new CreditStoreError(
        "invalid_amount",
        "Choose a dollar amount in whole cents."
      );
    }
    const fingerprint = hash(
      JSON.stringify({ amount: input.amountUsdMicros, network: input.network })
    );
    const previous = await this.deps.store.credits.fundingByKey(
      owner,
      input.idempotencyKey
    );
    if (previous !== null) {
      if (previous.requestFingerprint !== fingerprint) {
        throw new CreditStoreError(
          "credit_conflict",
          "This purchase key already has different terms."
        );
      }
      return publicPurchase(previous);
    }
    const method = this.methods().find(
      (entry) => entry.network === input.network
    );
    if (method?.available !== true) {
      throw new CreditStoreError(
        "funding_unavailable",
        method?.reason ?? "Choose a supported funding network."
      );
    }
    const { environment, rates } = this.deps;
    const id = CreditPurchaseId.generate();
    const now = Date.now();
    let expiresAt = now + 120_000;
    let challenge: PaymentChallenge;
    const resource = {
      url: `${environment.appOrigin}/api/credits/purchases/${id}/pay`,
      description: `Buy ${input.amountUsdMicros / 10_000} Froggy credits`,
      mimeType: "application/json",
    };
    if (isEvmNetwork(input.network)) {
      const domain = method.stubbed
        ? { name: "USDC", version: "2" }
        : await readTokenDomain(this.deps.evmRpc, method.asset);
      challenge = {
        x402Version: 2,
        resource,
        accepts: [
          {
            scheme: "exact",
            network: input.network,
            asset: method.asset,
            payTo: method.payTo,
            amount: String(input.amountUsdMicros),
            maxTimeoutSeconds: 120,
            extra: { ...domain, assetTransferMethod: "eip3009" },
          },
        ],
      };
    } else {
      const rate = rates.current(now);
      if (
        rate === null ||
        rate.usdMicrosPerHbar <= 0 ||
        !Number.isSafeInteger(rate.usdMicrosPerHbar) ||
        rate.expiresAt * 1000 <= now
      ) {
        throw new CreditStoreError(
          "rate_unavailable",
          "A fresh HBAR rate is unavailable. No payment was made."
        );
      }
      expiresAt = Math.min(expiresAt, rate.expiresAt * 1000);
      const numerator = BigInt(input.amountUsdMicros) * 100_000_000n;
      const denominator = BigInt(rate.usdMicrosPerHbar);
      const units = ((numerator + denominator - 1n) / denominator).toString();
      challenge = this.deps.oracle.challenge({
        units,
        description: resource.description,
        url: resource.url,
      });
      const [offer] = challenge.accepts;
      if (
        offer?.asset !== "0.0.0" ||
        offer.network !== environment.hederaNetwork
      ) {
        throw new CreditStoreError(
          "funding_unavailable",
          "Credit purchases accept native HBAR on the configured Hedera network."
        );
      }
      // A prepared receiving alias must be funded before it can sign an HBAR purchase.
      if (!method.stubbed) {
        await this.deps.hederaPayerFor({ userId: owner, openingUsdMicros: 0 });
      }
    }
    const [offer] = challenge.accepts;
    if (offer === undefined) {
      throw new CreditStoreError(
        "funding_unavailable",
        "No credit funding offer is available."
      );
    }
    const purchase: FundingPurchase = {
      v: 1,
      id,
      status: "quoted",
      creditUnits: creditUnits(input.amountUsdMicros),
      network: Schema.decodeUnknownSync(CreditPurchase.fields.network)(
        input.network
      ),
      asset: offer.asset,
      amount: offer.amount,
      payTo: offer.payTo,
      expiresAt,
      createdAt: now,
      updatedAt: now,
      transactionId: null,
      error: null,
      stubbed: method.stubbed,
      idempotencyKey: input.idempotencyKey,
      requestFingerprint: fingerprint,
      challenge,
      proofHash: null,
      authorizationKey: null,
      paymentHeader: null,
      signedTransaction: null,
      transactionNonce: null,
    };
    const created = await this.deps.store.credits.createFunding(
      owner,
      purchase,
      limits
    );
    return publicPurchase(created.purchase);
  }

  async get(owner: UserId, id: CreditPurchaseId): Promise<CreditPurchase> {
    const purchase = await this.require(owner, id);
    return publicPurchase(purchase);
  }

  async challenge(
    owner: UserId,
    id: CreditPurchaseId
  ): Promise<PaymentChallenge> {
    const purchase = await this.require(owner, id);
    if (purchase.status !== "quoted") {
      throw new CreditStoreError(
        "credit_conflict",
        "This purchase already has a payment. Read its status before trying again."
      );
    }
    if (purchase.expiresAt <= Date.now()) {
      throw new CreditStoreError(
        "quote_expired",
        "This quote expired. Review a new quote before paying."
      );
    }
    return Schema.decodeUnknownSync(PaymentChallenge)(purchase.challenge);
  }

  /** Accept a signed x402 retry from the authenticated owner, bound to this frozen quote. */
  async accept(
    owner: UserId,
    id: CreditPurchaseId,
    header: string
  ): Promise<CreditPurchase> {
    const purchase = await this.require(owner, id);
    if (header.length > 32_768) {
      throw new CreditStoreError(
        "invalid_payment",
        "The payment proof is too large."
      );
    }
    if (purchase.stubbed) {
      throw new CreditStoreError(
        "invalid_payment",
        "Use the explicit simulated checkout for a local credit purchase."
      );
    }
    const envelope = Schema.decodeUnknownSync(
      Schema.fromJsonString(
        Schema.Struct({
          x402Version: Schema.Literal(2),
          accepted: Schema.Struct({
            scheme: Schema.Literal("exact"),
            network: Schema.String,
            asset: Schema.String,
            amount: Schema.String,
            payTo: Schema.String,
          }),
          payload: Schema.Unknown,
        })
      )
    )(Buffer.from(header, "base64").toString("utf-8"));
    const { accepted } = envelope;
    if (
      accepted.network !== purchase.network ||
      accepted.asset.toLowerCase() !== purchase.asset.toLowerCase() ||
      accepted.payTo.toLowerCase() !== purchase.payTo.toLowerCase() ||
      accepted.amount !== purchase.amount
    ) {
      throw new CreditStoreError(
        "invalid_payment",
        "The signed payment does not match this credit quote."
      );
    }
    let authorizationKey: string;
    if (isEvmNetwork(purchase.network)) {
      const { authorization } = Schema.decodeUnknownSync(
        Schema.Struct({ authorization: Schema.Struct({ from: Schema.String }) })
      )(envelope.payload);
      const wallets = await this.deps.privy.paymentWallets(owner);
      if (
        wallets.ethereum === null ||
        authorization.from.toLowerCase() !==
          wallets.ethereum.address.toLowerCase()
      ) {
        throw new CreditStoreError(
          "invalid_payment",
          "The payment must come from your connected USDC wallet."
        );
      }
      authorizationKey = creditEvmAuthorization(header);
    } else {
      const description = describePayment(header);
      const payer = await this.deps.hederaPayerFor({
        userId: owner,
        openingUsdMicros: 0,
      });
      if (
        description.transactionId === null ||
        description.payer !== payer.accountId
      ) {
        throw new CreditStoreError(
          "invalid_payment",
          "The payment must come from your personal Hedera account."
        );
      }
      authorizationKey = `${purchase.network}:${description.transactionId}`;
    }
    const claimed = await this.deps.store.credits.claimFunding(owner, id, {
      paymentHeader: header,
      proofHash: hash(header),
      authorizationKey,
    });
    if (claimed.claimed) {
      this.launch(owner, id);
    }
    return publicPurchase(claimed.purchase);
  }

  async pay(
    owner: UserId,
    id: CreditPurchaseId,
    accessToken: string
  ): Promise<CreditPurchase> {
    await this.require(owner, id);
    const existing = this.signing.get(id);
    if (existing !== undefined) {
      return await existing;
    }
    const operation = this.sign(owner, id, accessToken);
    this.signing.set(id, operation);
    try {
      return await operation;
    } finally {
      this.signing.delete(id);
    }
  }

  private async sign(
    owner: UserId,
    id: CreditPurchaseId,
    accessToken: string
  ): Promise<CreditPurchase> {
    const purchase = await this.require(owner, id);
    if (purchase.status !== "quoted") {
      return publicPurchase(purchase);
    }
    if (purchase.expiresAt <= Date.now()) {
      throw new CreditStoreError(
        "quote_expired",
        "This quote expired. Review a new quote before paying."
      );
    }
    const challenge = Schema.decodeUnknownSync(PaymentChallenge)(
      purchase.challenge
    );
    let header: string;
    let authorizationKey: string;
    if (purchase.stubbed) {
      if (!this.deps.environment.allowStubs) {
        throw new Error("Simulated credit payments are disabled.");
      }
      header = Buffer.from(
        JSON.stringify({
          x402Version: 2,
          accepted: challenge.accepts[0],
          payload: { stubbed: true, purchaseId: id },
        })
      ).toString("base64");
      authorizationKey = `stub:${id}`;
    } else {
      const payer = isEvmNetwork(purchase.network)
        ? await this.ownerBasePayer(owner, accessToken, purchase.network)
        : await this.deps.hederaPayerFor({
            userId: owner,
            openingUsdMicros: 0,
          });
      const payment = await payer.pay(challenge);
      if (payment.header === null || payment.stubbed) {
        throw new CreditStoreError(
          "signing_refused",
          payment.error ?? "Your wallet did not authorize this payment."
        );
      }
      ({ header } = payment);
      const described = describePayment(header);
      authorizationKey = isEvmNetwork(purchase.network)
        ? creditEvmAuthorization(header)
        : `${purchase.network}:${described.transactionId ?? ""}`;
      if (!isEvmNetwork(purchase.network) && described.transactionId === null) {
        throw new Error("The signed HBAR payment has no transaction identity.");
      }
    }
    const claimed = await this.deps.store.credits.claimFunding(owner, id, {
      paymentHeader: header,
      proofHash: hash(header),
      authorizationKey,
    });
    if (claimed.claimed) {
      this.launch(owner, id);
    }
    return publicPurchase(claimed.purchase);
  }

  private async ownerBasePayer(
    owner: UserId,
    accessToken: string,
    network: Parameters<typeof evmPayer>[0]["network"]
  ) {
    const signer = await this.deps.privy.ownerEvmSigner({
      did: owner,
      accessToken,
    });
    if (signer === null) {
      throw new CreditStoreError(
        "wallet_unavailable",
        "Your USDC wallet is unavailable."
      );
    }
    return evmPayer({ network, signer });
  }

  private async require(
    owner: UserId,
    id: CreditPurchaseId
  ): Promise<FundingPurchase> {
    const purchase = await this.deps.store.credits.findFunding(owner, id);
    if (purchase === null) {
      throw new CreditStoreError("not_found", "Credit purchase not found.");
    }
    return purchase;
  }

  private launch(owner: UserId, id: CreditPurchaseId): void {
    if (this.running.has(id)) {
      return;
    }
    const operation = (async () => {
      try {
        await this.settle(owner, id);
      } finally {
        this.running.delete(id);
      }
    })();
    this.running.set(id, operation);
    detached(`credit funding ${id}`, async () => {
      await operation;
    });
  }

  private async settle(owner: UserId, id: CreditPurchaseId): Promise<void> {
    try {
      const purchase = await this.require(owner, id);
      if (purchase.status === "confirmed" || purchase.status === "failed") {
        return;
      }
      if (purchase.stubbed) {
        if (!this.deps.environment.allowStubs) {
          throw new Error("Simulated credit payments are disabled.");
        }
        await this.deps.store.credits.confirmFunding(owner, id, {
          transactionId: `stub-credit-${id}`,
          stubbed: true,
        });
        return;
      }
      const outcome = isEvmNetwork(purchase.network)
        ? await this.deps.withTreasuryLock(
            async () => await this.settleBase(owner, id),
            id
          )
        : await this.settleHedera(owner, purchase);
      if (outcome.status === "confirmed" && outcome.transactionId !== null) {
        await this.deps.store.credits.confirmFunding(owner, id, {
          transactionId: outcome.transactionId,
        });
        detached("credit funding audit", async () => {
          await this.deps.hcs.record({
            kind: "sold",
            network: purchase.network,
            asset: purchase.asset,
            amount: purchase.amount,
            at: Date.now(),
            ref: id,
            transactionId: outcome.transactionId ?? "",
          });
        });
      } else {
        await this.deps.store.credits.updateFunding(owner, id, {
          status: outcome.status === "failed" ? "failed" : "uncertain",
          transactionId: outcome.transactionId,
          error: outcome.error,
        });
      }
    } catch (error) {
      await this.deps.store.credits.updateFunding(owner, id, {
        status: "uncertain",
        error:
          error instanceof Error
            ? error.message.slice(0, 1000)
            : "Credit funding failed.",
      });
    }
  }

  private async settleBase(
    owner: UserId,
    id: CreditPurchaseId
  ): Promise<CreditSettlement> {
    const purchase = await this.require(owner, id);
    const { base } = this.deps;
    if (base === null || purchase.paymentHeader === null) {
      throw new Error("USDC settlement is unavailable.");
    }
    return await base.settle({
      header: purchase.paymentHeader,
      challenge: Schema.decodeUnknownSync(PaymentChallenge)(purchase.challenge),
      payer: creditEvmPayer(purchase.paymentHeader),
      submission:
        purchase.signedTransaction !== null &&
        purchase.transactionId !== null &&
        purchase.transactionNonce !== null
          ? {
              signedTransaction: purchase.signedTransaction,
              transactionId: purchase.transactionId,
              transactionNonce: purchase.transactionNonce,
            }
          : null,
      beforeBroadcast: async (submission) => {
        await this.deps.store.credits.updateFunding(owner, id, {
          ...submission,
          status: "pending",
        });
      },
    });
  }

  private async settleHedera(
    owner: UserId,
    purchase: FundingPurchase
  ): Promise<CreditSettlement> {
    if (purchase.paymentHeader === null) {
      throw new Error("No signed HBAR payment is on file.");
    }
    const description = describePayment(purchase.paymentHeader);
    const { transactionId } = description;
    if (transactionId === null || description.payer === null) {
      throw new Error("HBAR payment has no transaction identity.");
    }
    const challenge = Schema.decodeUnknownSync(PaymentChallenge)(
      purchase.challenge
    );
    const [offer] = challenge.accepts;
    if (offer === undefined) {
      throw new Error("HBAR purchase has no quoted offer.");
    }
    if (purchase.transactionId === null) {
      await this.deps.store.credits.updateFunding(owner, purchase.id, {
        transactionId,
      });
    }
    // Query before resubmission: a crash may have happened on either side of the network write.
    // Reusing this exact Hedera transaction is idempotent; recovery never asks the owner to sign again.
    let result = await lookupHederaTransactionDetails({
      network: purchase.network,
      transactionId,
    });
    if (result.status === "unknown") {
      const settled = await this.deps.oracle
        .settle(purchase.paymentHeader, {
          ...offer,
          network: purchase.network,
          extra: offer.extra ?? {},
          maxTimeoutSeconds: offer.maxTimeoutSeconds ?? 120,
        })
        .catch(() => null);
      if (
        purchase.transactionId === null &&
        settled?.rejectedBeforeSubmission === true
      ) {
        return {
          status: "failed",
          transactionId,
          error:
            settled.error ?? "The HBAR payment was rejected before submission.",
        };
      }
      result = await lookupHederaTransactionDetails({
        network: purchase.network,
        transactionId,
      });
    }
    const credit = result.transfers.some(
      (leg) =>
        leg.accountId === purchase.payTo &&
        leg.asset === "0.0.0" &&
        leg.amount === BigInt(purchase.amount)
    );
    const debit = result.transfers.some(
      (leg) =>
        leg.accountId === description.payer &&
        leg.asset === "0.0.0" &&
        leg.amount === -BigInt(purchase.amount)
    );
    if (result.status === "success" && credit && debit) {
      return { status: "confirmed", transactionId, error: null };
    }
    if (result.status === "unknown") {
      return {
        status: "uncertain",
        transactionId,
        error: "HBAR settlement confirmation is pending.",
      };
    }
    return {
      status: "failed",
      transactionId,
      error: "The HBAR payment did not settle the quoted transfer.",
    };
  }

  async recover(): Promise<void> {
    const rows = await this.deps.store.credits.pendingFunding();
    for (const { userId, purchase } of rows) {
      if (
        purchase.status === "uncertain" ||
        purchase.updatedAt < Date.now() - 60_000
      ) {
        this.launch(userId, purchase.id);
      }
    }
  }
}
