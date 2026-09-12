import {
  EvmAddress,
  EvmTradingNetwork,
  TradeSimulation,
  TradingUnits,
} from "@froggy/domain";
import type { TradePayload } from "@froggy/domain";
import { Redacted, Schema } from "effect";

import { boundedBytes, safeFetch } from "../outbound";
import type { OutboundOptions } from "../outbound";
import { chainIdOf } from "./networks";

type EvmPayload = Extract<TradePayload, { kind: "evm" }>;
const Integer = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
const Hex = Schema.String.check(
  Schema.isPattern(/^0x(?:[a-fA-F0-9]{2})*$/u),
  Schema.isMaxLength(64_002)
);
const Trace = Schema.Struct({
  from: EvmAddress,
  to: Schema.optional(Schema.NullOr(EvmAddress)),
  input: Schema.optional(Schema.NullOr(Hex)),
  output: Schema.optional(Schema.NullOr(Hex)),
  trace_address: Schema.Array(Integer).check(Schema.isMaxLength(64)),
});
const Result = Schema.Struct({
  status: Schema.Boolean,
  gas_used: Integer,
  block_number: Integer,
  trace: Schema.Array(Trace).check(Schema.isMaxLength(512)),
});
const Bundle = Schema.Struct({
  simulations: Schema.Array(Result).check(
    Schema.isMinLength(1),
    Schema.isMaxLength(10)
  ),
});

export interface TenderlyOptions {
  readonly accessKey: Redacted.Redacted;
  readonly account: string;
  readonly project: string;
  readonly outbound?: OutboundOptions;
  readonly now?: () => number;
}

export interface EvmSimulationRequest {
  readonly network: string;
  readonly wallet: string;
  readonly blockNumber: number;
  readonly transactions: readonly EvmPayload[];
  /** Balances independently read at blockNumber, never supplied by the model. */
  readonly assets: readonly {
    readonly address: string;
    readonly balance: string;
  }[];
}

interface Call {
  readonly from: string;
  readonly to: string;
  readonly gas: number;
  readonly gas_price: string;
  readonly value: string;
  readonly data: string;
}

const callsFor = (input: EvmSimulationRequest): readonly Call[] => {
  Schema.decodeUnknownSync(EvmTradingNetwork)(input.network);
  Schema.decodeUnknownSync(EvmAddress)(input.wallet);
  Schema.decodeUnknownSync(Integer)(input.blockNumber);
  if (
    input.transactions.length === 0 ||
    input.transactions.length > 8 ||
    input.assets.length > 2 ||
    input.transactions.length + input.assets.length > 10
  ) {
    throw new Error(
      "trade.simulation_capacity: Simulation is bounded to eight transactions and two balance probes."
    );
  }
  const calls: Call[] = input.transactions.map((transaction) => ({
    from: input.wallet,
    to: transaction.to,
    gas: Schema.decodeUnknownSync(Integer)(Number(transaction.gasLimit)),
    gas_price: transaction.maxFeePerGas,
    value: transaction.value,
    data: transaction.data,
  }));
  for (const asset of input.assets) {
    Schema.decodeUnknownSync(EvmAddress)(asset.address);
    Schema.decodeUnknownSync(TradingUnits)(asset.balance);
    calls.push({
      from: input.wallet,
      to: asset.address,
      gas: 100_000,
      gas_price: "0",
      value: "0",
      data: `0x70a08231${input.wallet.slice(2).toLowerCase().padStart(64, "0")}`,
    });
  }
  return calls;
};

const verifyRoot = (
  result: typeof Result.Type,
  call: Call,
  block: number
): typeof Trace.Type => {
  const root = result.trace.find((trace) => trace.trace_address.length === 0);
  if (
    result.block_number !== block ||
    root === undefined ||
    root.from.toLowerCase() !== call.from.toLowerCase() ||
    root.to?.toLowerCase() !== call.to.toLowerCase() ||
    root.input?.toLowerCase() !== call.data.toLowerCase()
  ) {
    throw new Error(
      "trade.simulation_mismatch: Tenderly result differs from the requested call or block."
    );
  }
  return root;
};

/** Stateful execution plus post-state balanceOf calls, with no invented balance or allowance overrides. */
export const tenderlySimulation = async (
  options: TenderlyOptions,
  input: EvmSimulationRequest
): Promise<readonly TradeSimulation[]> => {
  const calls = callsFor(input);
  const credentials = /^[a-zA-Z0-9_-]{1,128}$/u;
  if (
    !credentials.test(options.account) ||
    !credentials.test(options.project) ||
    Redacted.value(options.accessKey).trim() === ""
  ) {
    throw new Error(
      "trade.simulation_unavailable: Tenderly credentials are incomplete."
    );
  }
  const chainId = chainIdOf(input.network);
  if (chainId === null) {
    throw new Error(
      "trade.simulation_unavailable: Tenderly requires an EVM network."
    );
  }
  const response = await safeFetch(
    `https://api.tenderly.co/api/v2/account/${options.account}/project/${options.project}/simulations/simulate/bundle`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Access-Key": Redacted.value(options.accessKey),
      },
      body: JSON.stringify({
        network_id: String(chainId),
        call_args: calls,
        block_number_or_hash: { blockNumber: input.blockNumber },
        overrides: null,
      }),
    },
    { ...options.outbound, maxRedirects: 0, timeoutMs: 25_000 }
  ).catch(() => {
    throw new Error("trade.simulation_unavailable: Tenderly transport failed.");
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(
      `trade.simulation_unavailable: Tenderly returned HTTP ${response.status}.`
    );
  }
  let bundle: typeof Bundle.Type;
  try {
    bundle = Schema.decodeUnknownSync(Bundle)(
      JSON.parse(
        new TextDecoder().decode(await boundedBytes(response, 512 * 1024))
      )
    );
  } catch {
    throw new Error(
      "trade.simulation_invalid: Tenderly returned an invalid bounded response."
    );
  }
  if (bundle.simulations.length !== calls.length) {
    throw new Error("trade.simulation_invalid: incomplete bundle response.");
  }
  const roots = bundle.simulations.map((result, index) => {
    const call = calls[index];
    if (call === undefined) {
      throw new Error("trade.simulation_invalid: unexpected simulation.");
    }
    return verifyRoot(result, call, input.blockNumber);
  });
  const assetChanges = input.assets.map((asset, index) => {
    const position = input.transactions.length + index;
    const result = bundle.simulations[position];
    const output = roots[position]?.output;
    if (
      result?.status !== true ||
      output === null ||
      output === undefined ||
      !/^0x[a-fA-F0-9]{64}$/u.test(output)
    ) {
      throw new Error(
        "trade.simulation_invalid: post-state token balance is unavailable."
      );
    }
    return {
      asset: asset.address,
      before: asset.balance,
      after: BigInt(output).toString(),
    };
  });
  const observedAt = (options.now ?? Date.now)();
  return bundle.simulations
    .slice(0, input.transactions.length)
    .map((result, index) =>
      Schema.decodeUnknownSync(TradeSimulation)({
        status: result.status ? "passed" : "failed",
        provider: "tenderly",
        observedAt,
        block: input.blockNumber.toString(),
        gasUnits: result.gas_used.toString(),
        assetChanges:
          index === input.transactions.length - 1 ? assetChanges : [],
        error: result.status
          ? null
          : "Transaction reverted during independent simulation.",
        stubbed: false,
      })
    );
};
