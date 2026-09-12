import { EvmAddress, EvmTradingNetwork } from "@froggy/domain";
import type { Trade, TradeStep } from "@froggy/domain";
import { APIError } from "@privy-io/node";
import type { PrivyClient } from "@privy-io/node";
import { Schema } from "effect";

const Hex = Schema.String.check(
  Schema.isPattern(/^0x[0-9a-fA-F]*$/u),
  Schema.isMaxLength(64_002)
);
const RequestBody = Schema.Struct({
  method: Schema.Literal("wallet_sendCalls"),
  caip2: EvmTradingNetwork,
  sponsor: Schema.Literal(true),
  params: Schema.Struct({
    calls: Schema.Array(
      Schema.Struct({
        to: EvmAddress,
        data: Hex,
        value: Hex,
      })
    ).check(Schema.isMinLength(1), Schema.isMaxLength(8)),
  }),
}).annotate({ parseOptions: { onExcessProperty: "error" } });

export interface PrivyExecution {
  readonly authorization: (
    walletId: string,
    trade: Trade,
    step: TradeStep
  ) => {
    readonly version: 1;
    readonly method: "POST";
    readonly url: string;
    readonly headers: Record<string, string>;
    readonly body: typeof RequestBody.Type;
  };
  readonly submit: (
    state: NonNullable<TradeStep["managed"]>
  ) => Promise<string>;
  readonly get: (id: string) => Promise<{
    readonly id: string;
    readonly walletId: string;
    readonly network: string;
    readonly status: string;
    readonly transactionHash: string | null;
    readonly userOperationHash: string | null;
    readonly sponsored: boolean;
  }>;
}

/** Owner authorization covers the body, wallet URL, idempotency key and deadline. */
export const privyExecution = (
  client: PrivyClient,
  appId: string
): PrivyExecution => ({
  authorization: (walletId, trade, step) => {
    if (
      step.payload.kind !== "evm_calls" ||
      !/^[a-zA-Z0-9_-]{1,128}$/u.test(walletId)
    ) {
      throw new Error(
        "trade.authorization: expected a managed batch and embedded wallet."
      );
    }
    return {
      version: 1,
      method: "POST",
      url: `https://api.privy.io/v1/wallets/${walletId}/rpc`,
      headers: {
        "privy-app-id": appId,
        "privy-idempotency-key": step.id,
        "privy-request-expiry": String(step.expiresAt),
      },
      body: Schema.decodeUnknownSync(RequestBody)({
        method: "wallet_sendCalls",
        caip2: trade.input.network,
        sponsor: true,
        params: {
          calls: step.payload.calls.map((call) => ({
            to: call.to,
            data: call.data,
            value: `0x${BigInt(call.value).toString(16)}`,
          })),
        },
      }),
    };
  },
  submit: async (state) => {
    const body = Schema.decodeUnknownSync(RequestBody)(state.request);
    try {
      const result = await client.wallets().rpc(state.walletId, {
        ...body,
        params: { calls: [...body.params.calls] },
        idempotency_key: state.idempotencyKey,
        request_expiry: state.expiresAt,
        authorization_context: { signatures: [state.authorizationSignature] },
      });
      if (
        result.method !== "wallet_sendCalls" ||
        result.data.caip2 !== body.caip2
      ) {
        throw new Error(
          "trade.provider_identity: Privy returned a different method or network."
        );
      }
      return result.data.transaction_id;
    } catch (error) {
      // Provider bodies can echo signing material. Keep only the actionable HTTP class.
      if (error instanceof APIError) {
        throw new TypeError(
          `trade.privy_submission: Privy returned HTTP ${error.status ?? "unknown"}; verify owner authorization, Base sponsorship and app gas credits before retrying. Reconcile this operation first.`,
          { cause: error }
        );
      }
      throw new Error(
        "trade.submission_unknown: Privy did not return a verified operation identity.",
        { cause: error }
      );
    }
  },
  get: async (id) => {
    const result = await client.transactions().get(id);
    return {
      id: result.id,
      walletId: result.wallet_id,
      network: result.caip2,
      status: result.status,
      transactionHash: result.transaction_hash,
      userOperationHash: result.user_operation_hash ?? null,
      sponsored: result.sponsored === true,
    };
  },
});
