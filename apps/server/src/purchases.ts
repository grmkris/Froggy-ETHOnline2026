/** One durable, single-use purchase shared by chat, Chrome and outside agents. */
import type { BrowserHandle } from "@froggy/browser";
import {
  ApprovalId,
  PurchaseId,
  RuleId,
  RunId,
  KNOWN_ASSETS,
  PURCHASE_BODY_LIMIT,
  PURCHASE_INPUT_LIMIT,
  PURCHASE_MAX_USD_MICROS,
  PURCHASE_RUN_USD_MICROS,
  purchaseFinished,
  publicHttpUrl,
  priceInUsdMicros,
  usdMicros,
} from "@froggy/domain";
import type {
  AgentConnectionId,
  Network,
  Purchase,
  PurchaseQuote,
  UserId,
} from "@froggy/domain";
import {
  challengeFrom,
  decodeSettlementHeader,
  describePayment,
  evmPayer,
  isSolanaNetwork,
  paymentHeaders,
  solanaPayer,
  solanaBalance,
  settlementHeaderFrom,
} from "@froggy/payments";
import type { Payer, PaymentChallenge } from "@froggy/payments";
import type {
  BrowserPaymentRequest,
  PurchaseAnswer,
  PurchaseRequest,
  PurchaseTicket,
  PurchaseWallets,
} from "@froggy/protocol";
import type { PurchasePatch } from "@froggy/wallet";
import { Schema } from "effect";

import { detached } from "./detached";
import { readCapped, safeFetch } from "./outbound";
import type { ChatRun } from "./runs";
import type { Services } from "./services";
import type { Settled, WorkspaceSession } from "./session";
import { assetFor } from "./tools-assets";

export class PurchaseError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "PurchaseError";
    this.status = status;
  }
}

const APPROVAL_TTL_MS = 5 * 60_000;
const errorText = (error: Error): string => error.message.slice(0, 1500);
const hash = (value: string): string =>
  new Bun.CryptoHasher("sha256").update(value).digest("hex");
const isJsonObject = Schema.is(Schema.JsonObject);
const isJsonArray = Schema.is(Schema.Array(Schema.Json));
const canonical = (value: Schema.Json): string => {
  if (isJsonArray(value)) {
    return `[${value.map(canonical).join(",")}]`;
  }
  if (isJsonObject(value)) {
    return `{${Object.entries(value)
      .toSorted(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};
const normalizedRequest = (
  input: PurchaseRequest,
  allowPrivate: boolean
): Purchase["request"] => {
  const check = publicHttpUrl(input.url, { allowPrivate });
  if (!check.ok) {
    throw new PurchaseError(check.reason);
  }
  check.url.hash = "";
  const method = input.method ?? "GET";
  if (method === "GET" && input.body !== null && input.body !== undefined) {
    throw new PurchaseError("GET purchases cannot carry a body.");
  }
  const body =
    method === "POST"
      ? canonical(
          Schema.decodeUnknownSync(Schema.Json)(JSON.parse(input.body ?? "{}"))
        )
      : null;
  if (
    body !== null &&
    new TextEncoder().encode(body).length > PURCHASE_INPUT_LIMIT
  ) {
    throw new PurchaseError("The JSON body exceeds 16 KiB.");
  }
  return { url: check.url.href, method, body };
};
const settlementResult = (
  header: string | null,
  status: number,
  network: PurchaseQuote["amount"]["asset"]["network"]
) => {
  const settlement = decodeSettlementHeader(header);
  const delivered = status >= 200 && status < 300;
  // The decoder returns null for success:false; a matching network is required.
  const confirmed = settlement !== null && settlement.network === network;
  let error: string | null = null;
  if (confirmed && !delivered) {
    error = `Payment settled, but delivery failed: the seller answered ${status}.`;
  } else if (!confirmed) {
    error = delivered
      ? "Content arrived, but the seller did not confirm settlement."
      : `The seller answered ${status} without confirming settlement.`;
  }
  return {
    confirmed,
    transactionId: settlement?.transactionId ?? null,
    error,
  };
};

const completedStatus = (
  purchase: Purchase,
  failed: string | null
): Purchase["status"] => {
  if (purchase.payment.state === "uncertain") {
    return "uncertain";
  }
  if (purchase.status === "cancelled") {
    return "cancelled";
  }
  return failed === null ? "completed" : "failed";
};
const interruptedStatus = (purchase: Purchase): Purchase["status"] => {
  if (purchase.payment.sentAt !== null) {
    return "uncertain";
  }
  return purchase.status === "cancelled" ? "cancelled" : "failed";
};
const ticket = (purchase: Purchase): PurchaseTicket => ({ v: 1, ...purchase });
const blankPayment: Purchase["payment"] = {
  state: "none",
  proofHash: null,
  transactionId: null,
  sentAt: null,
};
const blankDelivery: Purchase["delivery"] = {
  state: "pending",
  status: null,
  contentType: null,
  body: null,
  bodyHash: null,
};

interface WalletFunding {
  readonly network: Network;
  readonly address: string | null;
  readonly balance: bigint | null;
}

export interface PurchaseContext {
  readonly session: WorkspaceSession;
  readonly source: Purchase["source"];
  readonly browser?: BrowserHandle;
  readonly run?: Pick<ChatRun, "id" | "signal"> | undefined;
  readonly connectionId?: AgentConnectionId;
  readonly toolCallId?: string;
  readonly budgetUsdMicros?: number;
}

export class Purchases {
  private readonly services: Omit<Services, "purchases" | "createBrowser">;
  private readonly active = new Map<
    PurchaseId,
    {
      controller: AbortController;
      userId: UserId;
      completion: Promise<PurchaseId>;
    }
  >();
  constructor(services: Omit<Services, "purchases" | "createBrowser">) {
    this.services = services;
  }

  private get outbound() {
    return {
      allowPrivate: !this.services.environment.blockPrivateNetwork,
      maxRedirects: 0,
    };
  }

  private async patch(
    userId: UserId,
    purchase: Purchase,
    patch: Omit<PurchasePatch, "updatedAt">
  ): Promise<Purchase> {
    const updated = await this.services.store.purchases.update(
      userId,
      purchase.id,
      [purchase.status],
      { ...patch, updatedAt: Date.now() }
    );
    return updated ?? (await this.require(userId, purchase.id));
  }

  private async require(
    userId: UserId,
    id: PurchaseId,
    connectionId?: AgentConnectionId
  ): Promise<Purchase> {
    const purchase = await this.services.store.purchases.byId(userId, id);
    if (
      purchase === null ||
      (connectionId !== undefined && purchase.connectionId !== connectionId)
    ) {
      throw new PurchaseError("Purchase not found.", 404);
    }
    return purchase;
  }

  async get(
    userId: UserId,
    id: PurchaseId,
    connectionId?: AgentConnectionId
  ): Promise<PurchaseTicket> {
    let purchase = await this.require(userId, id, connectionId);
    if (
      purchase.status === "awaiting_approval" &&
      purchase.expiresAt <= Date.now()
    ) {
      purchase = await this.patch(userId, purchase, {
        status: "expired",
        error: "This approval expired. Start a new request for a fresh quote.",
      });
    }
    // A process restart loses the one-use owner credential. It must never sign again.
    if (
      (purchase.status === "paying" || purchase.status === "probing") &&
      !this.active.has(id) &&
      Date.now() - purchase.updatedAt > APPROVAL_TTL_MS
    ) {
      purchase = await this.patch(userId, purchase, {
        status: purchase.payment.sentAt === null ? "failed" : "uncertain",
        error:
          "The worker stopped before this purchase finished. This request will not be paid again.",
      });
    }
    return ticket(purchase);
  }

  async list(
    userId: UserId,
    connectionId?: AgentConnectionId
  ): Promise<readonly PurchaseTicket[]> {
    const rows = await this.services.store.purchases.list(userId, 50);
    return await Promise.all(
      rows
        .filter(
          (row) =>
            connectionId === undefined || row.connectionId === connectionId
        )
        .map(async (row) => await this.get(userId, row.id, connectionId))
    );
  }

  async request(
    context: PurchaseContext,
    input: PurchaseRequest,
    observed?: BrowserPaymentRequest
  ): Promise<PurchaseTicket> {
    const request = normalizedRequest(input, this.outbound.allowPrivate);
    const { method } = request;
    const requestFingerprint = hash(
      canonical({
        request,
        maxUsdMicros: input.maxUsdMicros,
        network: input.network ?? null,
      })
    );
    const now = Date.now();
    const purchase: Purchase = {
      id: PurchaseId.generate(),
      createdAt: now,
      updatedAt: now,
      idempotencyKey: `${context.connectionId ?? "owner"}:${input.idempotencyKey}`,
      connectionId: context.connectionId ?? null,
      source: context.source,
      runId: context.run?.id ?? RunId.generate(),
      toolCallId: context.toolCallId ?? null,
      browserPaymentId: observed?.id ?? null,
      request,
      requestFingerprint,
      purpose: input.purpose,
      maxUsdMicros: usdMicros(
        Math.min(input.maxUsdMicros, PURCHASE_MAX_USD_MICROS)
      ),
      budgetUsdMicros: usdMicros(
        Math.min(
          context.budgetUsdMicros ?? PURCHASE_RUN_USD_MICROS,
          PURCHASE_RUN_USD_MICROS
        )
      ),
      preferredNetwork: input.network ?? null,
      contactApprovedAt: method === "GET" ? now : null,
      status: method === "POST" ? "awaiting_approval" : "probing",
      quote: null,
      approvalId: ApprovalId.generate(),
      expiresAt: now + APPROVAL_TTL_MS,
      grant: null,
      payment: blankPayment,
      delivery: blankDelivery,
      receiptId: null,
      error: null,
      stubbed: this.services.environment.modes.database === "stub",
    };
    const saved = await this.services.store.purchases.create(
      context.session.userId,
      purchase
    );
    if (!saved.created) {
      if (saved.purchase.requestFingerprint !== requestFingerprint) {
        throw new PurchaseError(
          "This idempotency key already belongs to a different request.",
          409
        );
      }
      return await this.get(
        context.session.userId,
        saved.purchase.id,
        context.connectionId
      );
    }
    this.watchRun(context, purchase);
    if (method === "POST") {
      return ticket(purchase);
    }
    try {
      return ticket(
        await this.probe(
          context.session.userId,
          purchase,
          observed,
          context.run?.signal
        )
      );
    } catch (error) {
      return ticket(
        await this.patch(context.session.userId, purchase, {
          status: "failed",
          error:
            error instanceof Error
              ? errorText(error)
              : "The purchase could not complete.",
        })
      );
    }
  }

  private watchRun(context: PurchaseContext, purchase: Purchase): void {
    const { run } = context;
    if (run === undefined) {
      return;
    }
    const cancel = () => {
      this.active.get(purchase.id)?.controller.abort();
      detached("cancel purchase with run", async () => {
        await this.cancel(context.session.userId, purchase.id, context.browser);
      });
    };
    if (run.signal.aborted) {
      cancel();
    } else {
      run.signal.addEventListener("abort", cancel, { once: true });
    }
  }

  private async probe(
    userId: UserId,
    purchase: Purchase,
    observed?: BrowserPaymentRequest,
    signal?: AbortSignal
  ): Promise<Purchase> {
    const response =
      observed === undefined || observed.paymentRequired === null
        ? await safeFetch(
            purchase.request.url,
            Purchases.init(purchase, signal),
            this.outbound
          )
        : new Response(observed.body, {
            status: 402,
            headers: { "payment-required": observed.paymentRequired },
          });
    if (response.status !== 402) {
      const body = await readCapped(response, PURCHASE_BODY_LIMIT - 128);
      return await this.patch(userId, purchase, {
        status: response.ok ? "completed" : "failed",
        error: response.ok
          ? null
          : `The server answered ${response.status} without a payable x402 challenge.`,
        delivery: Purchases.delivery(
          response.status,
          response.headers.get("content-type"),
          body
        ),
      });
    }
    const challenge = await challengeFrom(response);
    const quote =
      challenge === null
        ? null
        : await this.fundedQuote(userId, purchase, challenge);
    if (quote === null) {
      throw new PurchaseError(
        "This seller did not offer a supported x402 v2 payment in known USDC or native HBAR on the configured networks."
      );
    }
    if (quote.usdMicros > purchase.maxUsdMicros) {
      throw new PurchaseError(
        "The seller's price exceeds this request's spending ceiling. Nothing was signed."
      );
    }
    return await this.patch(userId, purchase, {
      quote,
      status: "awaiting_approval",
      approvalId: ApprovalId.generate(),
      expiresAt: Date.now() + APPROVAL_TTL_MS,
    });
  }

  private quotes(
    purchase: Purchase,
    challenge: PaymentChallenge
  ): readonly PurchaseQuote[] {
    if (challenge.x402Version !== 2) {
      return [];
    }
    const quotes: PurchaseQuote[] = [];
    const env = this.services.environment;
    for (const offer of challenge.accepts) {
      if (
        offer.scheme !== "exact" ||
        (purchase.preferredNetwork !== null &&
          purchase.preferredNetwork !== offer.network)
      ) {
        continue;
      }
      if (
        ![
          env.evmNetwork,
          env.solanaNetwork,
          this.services.payer.network,
        ].includes(offer.network)
      ) {
        continue;
      }
      const priced = this.priceOffer(purchase, offer);
      if (priced !== null) {
        quotes.push(priced);
      }
    }
    return quotes;
  }

  private async fundedQuote(
    userId: UserId,
    purchase: Purchase,
    challenge: PaymentChallenge
  ): Promise<PurchaseQuote | null> {
    const quotes = this.quotes(purchase, challenge);
    const affordable = quotes.filter(
      (quote) => quote.usdMicros <= purchase.maxUsdMicros
    );
    if (affordable.length === 0) {
      return quotes[0] ?? null;
    }
    const funding = await this.fundingFor(userId, affordable);
    const funded = affordable.find(
      (quote) => this.fundingIssue(quote, funding) === null
    );
    if (funded !== undefined) {
      return funded;
    }
    const [first] = affordable;
    throw new PurchaseError(
      first === undefined
        ? "No funded payment offer is available."
        : (this.fundingIssue(first, funding) ??
            "No funded payment offer is available.")
    );
  }

  private usesUsdcWallet(quote: PurchaseQuote): boolean {
    const { asset } = quote.amount;
    const env = this.services.environment;
    return (
      this.services.privy.mode === "live" &&
      asset.symbol === "USDC" &&
      (asset.network === env.evmNetwork || asset.network === env.solanaNetwork)
    );
  }

  private async fundingFor(
    userId: UserId,
    quotes: readonly PurchaseQuote[]
  ): Promise<readonly WalletFunding[]> {
    const networks = [
      ...new Set(
        quotes
          .filter((quote) => this.usesUsdcWallet(quote))
          .map((quote) => quote.amount.asset.network)
      ),
    ];
    if (networks.length === 0) {
      return [];
    }
    let wallets: Awaited<ReturnType<Services["privy"]["paymentWallets"]>>;
    try {
      wallets = await this.services.privy.paymentWallets(userId);
    } catch {
      throw new PurchaseError(
        "Could not load your payment wallets. Open Services to reconnect your wallet, then request a fresh quote. Nothing was signed."
      );
    }
    return await Promise.all(
      networks.map(async (network): Promise<WalletFunding> => {
        const wallet = isSolanaNetwork(network)
          ? wallets.solana
          : wallets.ethereum;
        let balance: bigint | null = null;
        if (wallet !== null) {
          try {
            balance = await (isSolanaNetwork(network)
              ? this.readSolanaBalance(wallet.address)
              : this.services.balances.usdc(wallet.address));
          } catch {
            balance = null;
          }
        }
        return { network, address: wallet?.address ?? null, balance };
      })
    );
  }

  private fundingIssue(
    quote: PurchaseQuote,
    funding: readonly WalletFunding[]
  ): string | null {
    if (!this.usesUsdcWallet(quote)) {
      return null;
    }
    const { network } = quote.amount.asset;
    const found = funding.find((entry) => entry.network === network);
    const wallet = isSolanaNetwork(network) ? "Solana" : "Ethereum";
    if (found?.address === null) {
      return `Create your ${wallet} wallet in Services, then fund it with USDC on ${network}. Nothing was signed.`;
    }
    if (found === undefined || found.balance === null) {
      return `Could not read your USDC balance on ${network}. Check wallet funding in Services and request a fresh quote. Nothing was signed.`;
    }
    if (found.balance < BigInt(quote.amount.units)) {
      return `Fund your ${wallet} wallet with at least ${Number(quote.amount.units) / 1_000_000} USDC on ${network}, then request a fresh quote. Nothing was signed.`;
    }
    return null;
  }

  private priceOffer(
    purchase: Purchase,
    offer: PaymentChallenge["accepts"][number]
  ): PurchaseQuote | null {
    const amount = assetFor(offer);
    if (amount === null || !/^[1-9]\d{0,29}$/u.test(amount.units)) {
      return null;
    }
    const known = Object.values(KNOWN_ASSETS).some(
      (asset) =>
        asset.network === amount.asset.network && asset.id === amount.asset.id
    );
    if (!known || !["USDC", "HBAR"].includes(amount.asset.symbol)) {
      return null;
    }
    const rate =
      amount.asset.symbol === "USDC"
        ? 1_000_000
        : this.services.rates.current(Date.now())?.usdMicrosPerHbar;
    if (rate === undefined) {
      return null;
    }
    const price = priceInUsdMicros(amount, {
      asOf: Date.now(),
      source: "purchase-quote",
      usdMicrosPerUnit: rate,
    });
    if (!Number.isSafeInteger(price) || price <= 0) {
      return null;
    }
    const terms = {
      amount,
      payTo: offer.payTo,
      origin: new URL(purchase.request.url).origin,
      scheme: "exact" as const,
      extra: offer.extra ?? {},
      maxTimeoutSeconds: offer.maxTimeoutSeconds ?? 300,
    };
    if (
      !Number.isInteger(terms.maxTimeoutSeconds) ||
      terms.maxTimeoutSeconds < 1 ||
      terms.maxTimeoutSeconds > 3600
    ) {
      return null;
    }
    return {
      ...terms,
      usdMicros: price,
      fingerprint: hash(
        canonical(Schema.decodeUnknownSync(Schema.Json)(terms))
      ),
    };
  }

  private static init(
    purchase: Purchase,
    signal?: AbortSignal,
    proof?: string
  ): RequestInit {
    const headers = new Headers({
      accept: "application/json",
      "idempotency-key": purchase.id,
    });
    if (purchase.request.method === "POST") {
      headers.set("content-type", "application/json");
    }
    if (proof !== undefined) {
      const sent = paymentHeaders(proof);
      headers.set("payment-signature", sent["payment-signature"]);
      headers.set("x-payment", sent["x-payment"]);
    }
    return {
      method: purchase.request.method,
      body: purchase.request.body,
      headers,
      signal: signal ?? null,
    };
  }

  async answer(
    context: PurchaseContext,
    id: PurchaseId,
    answer: PurchaseAnswer,
    accessToken: string
  ): Promise<PurchaseTicket> {
    const { userId } = context.session;
    const purchase = await this.require(userId, id);
    if (purchase.approvalId !== answer.approvalId) {
      throw new PurchaseError(
        "This approval changed. Review the current quote before answering.",
        409
      );
    }
    if (purchase.status !== "awaiting_approval") {
      return ticket(purchase);
    }
    if (purchase.expiresAt <= Date.now()) {
      return await this.get(userId, id);
    }
    if (answer.decision !== "allow_once") {
      const declined = await this.services.store.purchases.update(
        userId,
        id,
        ["awaiting_approval"],
        {
          status: "declined",
          grant: null,
          error: "You declined this purchase.",
          updatedAt: Date.now(),
        },
        answer.approvalId
      );
      if (declined === null) {
        return ticket(await this.require(userId, id));
      }
      const refused = await this.refuse(context, declined);
      if (purchase.browserPaymentId !== null) {
        await context.browser?.cancelPayment(purchase.browserPaymentId);
      }
      return ticket(refused);
    }
    const now = Date.now();
    const claimed = await this.services.store.purchases.update(
      userId,
      id,
      ["awaiting_approval"],
      {
        status: purchase.quote === null ? "probing" : "paying",
        updatedAt: now,
        contactApprovedAt: purchase.contactApprovedAt ?? now,
        grant:
          purchase.quote === null
            ? null
            : {
                source: "human",
                ruleId: RuleId.generate(),
                approvalId: purchase.approvalId,
                directoryId: null,
                grantedAt: now,
                expiresAt: purchase.expiresAt,
                requestFingerprint: purchase.requestFingerprint,
                quoteFingerprint: purchase.quote.fingerprint,
              },
      },
      answer.approvalId
    );
    if (claimed === null) {
      return ticket(await this.require(userId, id));
    }
    const controller = new AbortController();
    const completion = Promise.withResolvers<PurchaseId>();
    this.active.set(id, { controller, userId, completion: completion.promise });
    detached("purchase", async () => {
      try {
        await (claimed.quote === null
          ? this.probe(userId, claimed, undefined, controller.signal)
          : this.execute(context, claimed, accessToken, controller.signal));
      } catch (error) {
        const latest = await this.require(userId, id);
        await this.patch(userId, latest, {
          status: interruptedStatus(latest),
          error:
            error instanceof Error
              ? errorText(error)
              : "The purchase could not complete.",
        });
      } finally {
        this.active.delete(id);
        completion.resolve(id);
      }
    });
    return ticket(claimed);
  }

  private async refuse(
    context: PurchaseContext,
    purchase: Purchase
  ): Promise<Purchase> {
    const { quote } = purchase;
    if (quote === null || purchase.receiptId !== null) {
      return purchase;
    }
    // The persisted decline has no grant, so policy refuses before this callback.
    const result = await context.session.spend({
      amount: quote.amount,
      budgetUsdMicros: purchase.budgetUsdMicros,
      host: new URL(purchase.request.url).host,
      kind: "service_payment",
      idempotencyKey: `purchase:${purchase.id}`,
      interactive: false,
      payeeId: quote.payTo,
      payeeLabel: new URL(purchase.request.url).host,
      provenance: "server",
      purpose: purchase.purpose,
      runId: purchase.runId,
      toolCallId: purchase.toolCallId ?? undefined,
      purchase: {
        id: purchase.id,
        requestFingerprint: purchase.requestFingerprint,
        quoteFingerprint: quote.fingerprint,
      },
      settle: async () =>
        await Promise.reject(
          new PurchaseError("A declined purchase cannot be settled.")
        ),
    });
    return await this.patch(context.session.userId, purchase, {
      receiptId: result.receipt.id,
      stubbed: purchase.stubbed || result.receipt.stubbed,
    });
  }

  private async connectionActive(
    userId: UserId,
    purchase: Purchase
  ): Promise<boolean> {
    if (purchase.connectionId === null) {
      return true;
    }
    const [tokens, grants] = await Promise.all([
      this.services.store.agents.list(userId),
      this.services.store.oauth.grants.list(userId),
    ]);
    // Legacy tokens have no expiry field; live revocation is checked here.
    return (
      tokens.some(
        (row) => row.id === purchase.connectionId && row.revokedAt === null
      ) ||
      grants.some(
        (row) =>
          row.id === purchase.connectionId &&
          row.revokedAt === null &&
          row.scopes.includes("pay")
      )
    );
  }

  private async payer(
    context: PurchaseContext,
    purchase: Purchase,
    accessToken: string
  ): Promise<Payer> {
    const network = purchase.quote?.amount.asset.network;
    if (network === this.services.payer.network) {
      return await this.services.hederaPayerFor({
        userId: context.session.userId,
        openingUsdMicros: context.session.pocket ?? 0,
      });
    }
    const owner = { accessToken, did: context.session.userId };
    if (network !== undefined && isSolanaNetwork(network)) {
      const signer = await this.services.privy.ownerSolanaSigner(owner);
      if (signer === null) {
        throw new PurchaseError(
          "Create your Solana wallet in Services, then fund it with USDC on the selected network."
        );
      }
      const rpcUrl = this.services.environment.solanaRpcUrl;
      return rpcUrl === ""
        ? solanaPayer({ network, signer })
        : solanaPayer({ network, signer, rpcUrl });
    }

    if (network === "eip155:8453" || network === "eip155:84532") {
      const signer = await this.services.privy.ownerEvmSigner(owner);
      if (signer === null) {
        throw new PurchaseError(
          "Create and fund your Privy Ethereum wallet with USDC on the selected Base network."
        );
      }
      return evmPayer({ network, signer });
    }
    throw new PurchaseError("No payer is configured for this network.");
  }

  private static delivery(
    status: number,
    contentType: string | null,
    body: string
  ): Purchase["delivery"] {
    const capped = body.slice(0, PURCHASE_BODY_LIMIT);
    return {
      state: status >= 200 && status < 300 ? "delivered" : "failed",
      status,
      contentType,
      body: capped,
      bodyHash: hash(capped),
    };
  }

  private async ready(
    context: PurchaseContext,
    purchase: Purchase,
    signal: AbortSignal
  ): Promise<void> {
    signal.throwIfAborted();
    if (!(await this.connectionActive(context.session.userId, purchase))) {
      throw new PurchaseError(
        "The requesting agent was disconnected before signing."
      );
    }
    if (Date.now() >= purchase.expiresAt) {
      throw new PurchaseError("The approved quote expired before signing.");
    }
    if (purchase.browserPaymentId !== null) {
      const pending = await context.browser?.pendingPayment();
      if (
        pending?.id !== purchase.browserPaymentId ||
        pending.url !== purchase.request.url
      ) {
        throw new PurchaseError(
          "The browser moved away from this paid page. Open it again for a new quote."
        );
      }
    } else if (purchase.request.method === "GET") {
      const response = await safeFetch(
        purchase.request.url,
        Purchases.init(purchase, signal),
        this.outbound
      );
      const challenge =
        response.status === 402 ? await challengeFrom(response) : null;
      const fresh =
        challenge === null
          ? null
          : this.quotes(purchase, challenge).find(
              (candidate) =>
                candidate.amount.asset.network ===
                  purchase.quote?.amount.asset.network &&
                candidate.fingerprint === purchase.quote?.fingerprint
            );
      if (fresh?.fingerprint !== purchase.quote?.fingerprint) {
        throw new PurchaseError(
          "The seller changed its payment terms. Nothing was signed; request a new quote."
        );
      }
    }
    if (purchase.quote !== null) {
      const funding = await this.fundingFor(context.session.userId, [
        purchase.quote,
      ]);
      const issue = this.fundingIssue(purchase.quote, funding);
      if (issue !== null) {
        throw new PurchaseError(issue);
      }
    }
  }

  private async execute(
    context: PurchaseContext,
    purchase: Purchase,
    accessToken: string,
    signal: AbortSignal
  ): Promise<void> {
    const { quote } = purchase;
    if (quote === null) {
      throw new PurchaseError("There is no quote to approve.");
    }
    const { userId } = context.session;
    let current = purchase;
    let handedOff = false;
    let finalOutcome: Settled | null = null;
    const result = await context.session.spend({
      amount: quote.amount,
      budgetUsdMicros: purchase.budgetUsdMicros,
      host: new URL(purchase.request.url).host,
      kind: "service_payment",
      idempotencyKey: `purchase:${purchase.id}`,
      interactive: false,
      payeeId: quote.payTo,
      payeeLabel: new URL(purchase.request.url).host,
      provenance: "server",
      purpose: purchase.purpose,
      runId: purchase.runId,
      signal,
      toolCallId: purchase.toolCallId ?? undefined,
      purchase: {
        id: purchase.id,
        requestFingerprint: purchase.requestFingerprint,
        quoteFingerprint: quote.fingerprint,
      },
      settle: async () => {
        let stubbed = false;
        try {
          await this.ready(context, purchase, signal);
          const payer = await this.payer(context, purchase, accessToken);
          signal.throwIfAborted();
          const attempt = await payer.pay({
            x402Version: 2,
            accepts: [
              {
                amount: quote.amount.units,
                asset: quote.amount.asset.id,
                extra: quote.extra,
                maxTimeoutSeconds: quote.maxTimeoutSeconds,
                network: quote.amount.asset.network,
                payTo: quote.payTo,
                scheme: "exact",
              },
            ],
          });
          ({ stubbed } = attempt);
          if (attempt.header === null) {
            throw new PurchaseError(
              attempt.error ?? "The wallet did not produce a payment."
            );
          }
          const details = describePayment(attempt.header);
          current = await this.patch(userId, current, {
            payment: {
              state: "signed",
              proofHash: hash(attempt.header),
              transactionId: details.transactionId,
              sentAt: null,
            },
            stubbed: current.stubbed || stubbed,
          });
          signal.throwIfAborted();
          if (!(await this.connectionActive(userId, purchase))) {
            throw new PurchaseError(
              "The agent was disconnected before the payment was sent."
            );
          }
          if (current.status !== "paying") {
            throw new PurchaseError("The purchase was stopped before sending.");
          }
          const claimedSend = await this.services.store.purchases.update(
            userId,
            purchase.id,
            ["paying"],
            {
              payment: {
                ...current.payment,
                state: "sent",
                sentAt: Date.now(),
              },
              updatedAt: Date.now(),
            }
          );
          if (claimedSend === null) {
            throw new PurchaseError("The purchase was stopped before sending.");
          }
          current = claimedSend;
          signal.throwIfAborted();
          handedOff = true;
          let responseHeader: string | null;
          let status: number;
          let body: string;
          let contentType: string | null;
          if (purchase.browserPaymentId === null) {
            const response = await safeFetch(
              purchase.request.url,
              Purchases.init(purchase, signal, attempt.header),
              this.outbound
            );
            ({ status } = response);
            responseHeader = settlementHeaderFrom(response.headers);
            contentType = response.headers.get("content-type");
            body = await readCapped(response, PURCHASE_BODY_LIMIT - 128);
          } else {
            if (context.browser === undefined) {
              throw new PurchaseError("The browser is unavailable.");
            }
            const replay = await context.browser.replayPayment({
              id: purchase.browserPaymentId,
              paymentHeader: attempt.header,
            });
            handedOff = replay.sent;
            if (replay.error !== null || replay.status === null) {
              throw new PurchaseError(
                replay.error ?? "The browser returned no response."
              );
            }
            ({ status, body } = replay);
            responseHeader = replay.paymentResponse;
            contentType = "text/html";
          }
          const response = settlementResult(
            responseHeader,
            status,
            quote.amount.asset.network
          );
          current = await this.patch(userId, current, {
            delivery: Purchases.delivery(status, contentType, body),
            payment: {
              ...current.payment,
              state: response.confirmed ? "settled" : "uncertain",
              transactionId:
                response.transactionId ?? current.payment.transactionId,
            },
          });
          const outcome: Settled = {
            network: quote.amount.asset.network,
            ok: response.confirmed,
            sent: true,
            stubbed,
            transactionId: current.payment.transactionId,
          };
          finalOutcome =
            response.error === null
              ? outcome
              : { ...outcome, error: response.error };
        } catch (error) {
          finalOutcome = {
            network: quote.amount.asset.network,
            ok: false,
            sent: handedOff,
            stubbed,
            transactionId: current.payment.transactionId,
            error:
              error instanceof Error
                ? errorText(error)
                : "The purchase could not complete.",
          };
          current = await this.patch(userId, current, {
            payment: {
              ...current.payment,
              state: handedOff ? "uncertain" : "failed",
              sentAt: handedOff ? current.payment.sentAt : null,
            },
          });
        }
        return finalOutcome;
      },
    });
    const latest = await this.require(userId, purchase.id);
    const failed =
      result.abandoned ??
      result.receipt.failure ??
      (result.decision._tag === "deny" ? result.decision.message : null);
    await this.patch(userId, latest, {
      status: completedStatus(latest, failed),
      receiptId: result.receipt.id,
      error: failed,
      stubbed: latest.stubbed || result.receipt.stubbed,
    });
  }

  async observe(
    context: PurchaseContext,
    observed: BrowserPaymentRequest
  ): Promise<PurchaseTicket> {
    return await this.request(
      { ...context, source: "browser" },
      {
        v: 1,
        url: observed.url,
        method: "GET",
        purpose: `Open paid page at ${new URL(observed.url).host}`,
        idempotencyKey: `browser:${observed.id}`,
        maxUsdMicros: PURCHASE_MAX_USD_MICROS,
      },
      observed
    );
  }

  async wait(
    context: PurchaseContext,
    id: PurchaseId
  ): Promise<PurchaseTicket> {
    const current = await this.get(
      context.session.userId,
      id,
      context.connectionId
    );
    if (purchaseFinished(current.status)) {
      return current;
    }
    if (context.run?.signal.aborted === true) {
      await this.cancel(context.session.userId, id, context.browser);
      return await this.get(context.session.userId, id);
    }
    await Bun.sleep(250);
    return await this.wait(context, id);
  }

  async cancel(
    userId: UserId,
    id: PurchaseId,
    browser?: BrowserHandle
  ): Promise<void> {
    let current = await this.require(userId, id);
    const active = this.active.get(id);
    if (active?.userId === userId) {
      active.controller.abort();
      // The payment task owns settlement state and its final receipt.
      await active.completion;
      current = await this.require(userId, id);
    }
    if (purchaseFinished(current.status)) {
      return;
    }
    if (current.browserPaymentId !== null) {
      await browser?.cancelPayment(current.browserPaymentId);
    }
    await this.patch(userId, current, {
      status: current.payment.sentAt === null ? "cancelled" : "uncertain",
      error: "The purchase was stopped. A sent payment will not be retried.",
    });
  }

  async cancelAll(userId: UserId, browser?: BrowserHandle): Promise<void> {
    const rows = await this.services.store.purchases.list(userId, 50);
    const ids = new Set(
      rows.filter((row) => !purchaseFinished(row.status)).map((row) => row.id)
    );
    const completions: Promise<PurchaseId>[] = [];
    // An active payment can be older than the bounded history shown in the UI.
    for (const [id, active] of this.active) {
      if (active.userId === userId) {
        active.controller.abort();
        ids.add(id);
        completions.push(active.completion);
      }
    }
    await Promise.all(
      [...ids].map(async (id) => {
        await this.cancel(userId, id, browser);
      })
    );
    // Deleting the account may follow this call; finish receipt writes first.
    await Promise.all(completions);
  }

  private async readSolanaBalance(address: string): Promise<bigint | null> {
    const { solanaNetwork: network, solanaRpcUrl: rpcUrl } =
      this.services.environment;
    return await (rpcUrl === ""
      ? solanaBalance({ network, address })
      : solanaBalance({ network, address, rpcUrl }));
  }

  async wallets(userId: UserId): Promise<PurchaseWallets> {
    const env = this.services.environment;
    const wallets = await this.services.privy.paymentWallets(userId);
    const [evm, solana] = await Promise.all([
      wallets.ethereum === null
        ? null
        : this.services.balances.usdc(wallets.ethereum.address),
      wallets.solana === null
        ? null
        : this.readSolanaBalance(wallets.solana.address),
    ]);
    return {
      v: 1,
      stubbed: env.modes.privy === "stub" || env.modes.database === "stub",
      networks: [
        {
          network: env.evmNetwork,
          address: wallets.ethereum?.address ?? null,
          balanceUnits: evm?.toString() ?? null,
          symbol: "USDC",
          ready: evm !== null && evm > 0n,
          note: `Fund this wallet with USDC on ${env.evmNetwork === "eip155:8453" ? "Base mainnet" : "Base Sepolia"}. Each new seller requires your approval.`,
        },
        {
          network: env.solanaNetwork,
          address: wallets.solana?.address ?? null,
          balanceUnits: solana?.toString() ?? null,
          symbol: "USDC",
          ready: solana !== null && solana > 0n,
          note:
            wallets.solana === null
              ? "Create a Solana wallet, then add USDC on the selected network."
              : "Use the displayed Solana network. The seller's facilitator pays transaction fees.",
        },
        {
          network: env.hederaNetwork,
          address: null,
          balanceUnits: null,
          symbol: "HBAR",
          ready: env.modes.hedera === "stub",
          note:
            env.modes.hedera === "stub"
              ? "Demo wallet: payments and receipts are marked stubbed."
              : "Uses your Froggy HBAR balance; funding is shown in the wallet pane.",
        },
      ],
    };
  }
}
