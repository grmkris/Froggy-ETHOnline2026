/**
 * The free answer to "what is this address".
 *
 * A pasted `0x…` with no instruction used to send the agent to the Pons
 * factory (useless for a wallet) and then to a paid web search. This read
 * settles the two questions that decide everything after it, on the server's
 * own configured RPCs and at one pinned block per network: does the address
 * hold code, and on which networks does it hold anything at all. It rides on
 * the same allowlisted `TradingRpc` the paid `rpc_read` uses, so the stub is
 * the same loud stub, the network identity check is the same, and no new
 * transport is introduced. It is chain state only, never a screen or a quote.
 */

import { EvmAddress, EvmTradingNetwork, KNOWN_ASSETS } from "@froggy/domain";
import { AddressLookupInput, AddressLookupResult } from "@froggy/protocol";
import type { AddressLookupNetwork } from "@froggy/protocol";
import { Schema } from "effect";
import {
  decodeAbiParameters,
  encodeFunctionData,
  getAddress,
  parseAbi,
} from "viem";
import type { Hex } from "viem";

import type { Services } from "../services";
import type { WorkspaceSession } from "../session";
import type { TradingRpc } from "./rpc";

const ERC20 = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
]);

/** Fan-out bound: the catalog lists three EVM networks today; six leaves room without a runaway. */
export const LOOKUP_MAX_NETWORKS = 6;

export interface OwnAddress {
  readonly label: AddressLookupResult["mine"][number];
  readonly address: string;
}

export interface AddressLookupOptions {
  readonly rpc: TradingRpc;
  /** Configured EVM networks, in catalog order. */
  readonly networks: readonly EvmTradingNetwork[];
  readonly now?: () => number;
}

/** Demo networks when the RPC is stubbed: the same three the research catalog advertises. */
const DEMO_LOOKUP_NETWORKS: readonly EvmTradingNetwork[] = [
  "eip155:8453",
  "eip155:1",
  "eip155:4663",
];

/** The EVM networks a lookup fans out to: every configured endpoint when live, the demo trio when stubbed. */
export const lookupNetworks = (
  configured: readonly string[],
  live: boolean
): readonly EvmTradingNetwork[] =>
  live
    ? Schema.decodeUnknownSync(Schema.Array(EvmTradingNetwork))(
        configured.filter((network) => network.startsWith("eip155:"))
      )
    : DEMO_LOOKUP_NETWORKS;

const isHex = (value: unknown): value is Hex =>
  typeof value === "string" && /^0x[\da-fA-F]*$/u.test(value);

const decodeString = (data: Hex): string | null => {
  try {
    const [value] = decodeAbiParameters([{ type: "string" }], data);
    return value.length > 64 ? value.slice(0, 64) : value;
  } catch {
    return null;
  }
};

const decodeUint = (data: Hex): bigint | null => {
  try {
    const [value] = decodeAbiParameters([{ type: "uint256" }], data);
    return value;
  } catch {
    return null;
  }
};

const unavailable = (
  network: EvmTradingNetwork,
  note: string
): AddressLookupNetwork => ({
  network,
  status: "unavailable",
  block: null,
  kind: null,
  nativeBalance: null,
  usdc: null,
  token: null,
  note: note.slice(0, 300),
});

const messageOf = (error: Error | null): string =>
  error?.message ?? "RPC read failed.";

/** One network's reads, all pinned to the block the first read returned. */
interface Reader {
  readonly network: EvmTradingNetwork;
  readonly address: EvmAddress;
  readonly block: string;
  readonly call: (to: EvmAddress, data: Hex) => Promise<Hex | null>;
}

const readUsdc = async (
  reader: Reader
): Promise<AddressLookupNetwork["usdc"]> => {
  const asset = Object.values(KNOWN_ASSETS).find(
    (entry) => entry.network === reader.network && entry.symbol === "USDC"
  );
  if (asset === undefined) {
    return null;
  }
  const contract = Schema.decodeUnknownSync(EvmAddress)(asset.id);
  const data = await reader.call(
    contract,
    encodeFunctionData({
      abi: ERC20,
      functionName: "balanceOf",
      args: [getAddress(reader.address)],
    })
  );
  const units = data === null ? null : decodeUint(data);
  return units === null
    ? null
    : { asset: contract, decimals: asset.decimals, units: units.toString() };
};

const readErc20 = async (
  reader: Reader
): Promise<NonNullable<AddressLookupNetwork["token"]>> => {
  const probe = async (
    functionName: "name" | "symbol" | "decimals" | "totalSupply"
  ): Promise<Hex | null> =>
    await reader.call(
      reader.address,
      encodeFunctionData({ abi: ERC20, functionName })
    );
  const [name, symbol, decimals, totalSupply] = await Promise.all([
    probe("name"),
    probe("symbol"),
    probe("decimals"),
    probe("totalSupply"),
  ]);
  const decimalsValue = decimals === null ? null : decodeUint(decimals);
  return {
    name: name === null ? null : decodeString(name),
    symbol: symbol === null ? null : decodeString(symbol),
    decimals:
      decimalsValue === null || decimalsValue > 255n
        ? null
        : Number(decimalsValue),
    totalSupply:
      totalSupply === null
        ? null
        : (decodeUint(totalSupply)?.toString() ?? null),
  };
};

const describe = (
  row: Pick<AddressLookupNetwork, "kind" | "nativeBalance" | "usdc" | "token">
): string => {
  if (row.kind === "contract") {
    return row.token?.symbol === null && row.token.decimals === null
      ? "Contract code without ERC-20 metadata: not a plain token."
      : "Contract with ERC-20 metadata. Metadata is self-reported by the contract, not a screen.";
  }
  return row.nativeBalance === "0" &&
    row.usdc !== null &&
    row.usdc.units !== "0"
    ? "No contract code. This address holds USDC but no native gas token."
    : "No contract code observed. This does not establish wallet ownership or activity.";
};

export const lookupAddress = async (
  options: AddressLookupOptions,
  rawInput: AddressLookupInput,
  own: readonly OwnAddress[]
): Promise<AddressLookupResult> => {
  const input = Schema.decodeUnknownSync(AddressLookupInput)(rawInput);
  const address = input.address.toLowerCase();
  const networks = (
    input.network === undefined ? options.networks : [input.network]
  ).slice(0, LOOKUP_MAX_NETWORKS);
  let stubbed = false;
  const read = async (
    request: Parameters<TradingRpc["read"]>[0]
  ): Promise<Schema.Json> => {
    const result = await options.rpc.read(request);
    stubbed ||= result.stubbed;
    return result.result;
  };

  const readNetwork = async (
    network: EvmTradingNetwork
  ): Promise<AddressLookupNetwork> => {
    try {
      const head = await read({
        network,
        call: { method: "eth_blockNumber", params: [] },
      });
      if (!isHex(head)) {
        return unavailable(network, "RPC returned no block number.");
      }
      const block = head;
      const reader: Reader = {
        network,
        address: input.address,
        block,
        call: async (to, data) => {
          try {
            const value = await read({
              network,
              call: { method: "eth_call", params: [{ to, data }, block] },
            });
            return isHex(value) && value !== "0x" ? value : null;
          } catch {
            // A revert or a bad answer for one probe is "unknown", not a failed row.
            return null;
          }
        },
      };
      const [code, balance] = await Promise.all([
        read({
          network,
          call: { method: "eth_getCode", params: [input.address, block] },
        }),
        read({
          network,
          call: { method: "eth_getBalance", params: [input.address, block] },
        }),
      ]);
      const kind: "contract" | "eoa" =
        isHex(code) && code !== "0x" ? "contract" : "eoa";
      const [usdc, token] = await Promise.all([
        readUsdc(reader),
        kind === "contract" ? readErc20(reader) : Promise.resolve(null),
      ]);
      const row = {
        kind,
        nativeBalance: isHex(balance) ? BigInt(balance).toString() : null,
        usdc,
        token,
      };
      return {
        network,
        status: "observed",
        block,
        ...row,
        note: describe(row),
      };
    } catch (error) {
      return unavailable(
        network,
        messageOf(error instanceof Error ? error : null)
      );
    }
  };

  const rows = await Promise.all(networks.map(readNetwork));
  const mine = own
    .filter((entry) => entry.address.toLowerCase() === address)
    .map((entry) => entry.label);
  const limitations = [
    "Chain state at one pinned block per network; balances are units, not USD.",
    "A wallet on one network can hold a token contract on another; only the configured networks were read.",
  ];
  if (stubbed) {
    limitations.push(
      "DEMO fixture. Nothing here describes the requested address."
    );
  }
  return Schema.decodeUnknownSync(AddressLookupResult)({
    v: 1,
    operation: "address_lookup",
    provider: "froggy",
    stubbed,
    observedAt: (options.now ?? Date.now)(),
    address: input.address,
    mine: [...new Set(mine)],
    networks: rows,
    limitations,
  });
};

/**
 * The embedded EOA from the session and the Privy owner wallet trading routes
 * pay from. A Privy outage must not turn a free read into an error, so a
 * failed wallet fetch only means `mine` cannot name the owner wallet.
 */
const ownEvmAddresses = async (
  services: Services,
  session: WorkspaceSession
): Promise<readonly OwnAddress[]> => {
  const own: OwnAddress[] = [...session.ownEvmAddresses()];
  try {
    const wallets = await services.privy.paymentWallets(session.userId);
    if (wallets.ethereum !== null) {
      own.push({ label: "owner_ethereum", address: wallets.ethereum.address });
    }
  } catch {
    // Reported through `mine` being incomplete, not by failing the lookup.
  }
  return own;
};

/** The chat and MCP entry point: configured networks, this person's own addresses, one bounded read. */
export const runAddressLookup = async (
  services: Services,
  session: WorkspaceSession,
  input: AddressLookupInput
): Promise<AddressLookupResult> =>
  await lookupAddress(
    {
      rpc: services.trading.rpc,
      networks: lookupNetworks(
        Object.keys(services.environment.trading.rpcEndpoints),
        services.environment.modes.quicknode === "live"
      ),
    },
    input,
    await ownEvmAddresses(services, session)
  );
