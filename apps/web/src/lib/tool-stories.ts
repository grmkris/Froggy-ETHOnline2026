/**
 * Each tool as a sentence and an icon.
 *
 * A turn reads as a short story rather than a list of function names because
 * every tool the agent has is named here in plain words. A tool this file has
 * never heard of still gets a sentence built from its name, never a blank.
 */

import {
  BarChart3Icon,
  CameraIcon,
  GlobeIcon,
  KeyboardIcon,
  MousePointerClickIcon,
  PiggyBankIcon,
  ReceiptTextIcon,
  SearchIcon,
  SendIcon,
  WalletIcon,
  WrenchIcon,
} from "lucide-react";

import { hostOf, shortAddress } from "./format";
import type { ToolInput } from "./tool-call";

type Icon = typeof GlobeIcon;

/** Money touches the mandate, page touches the shared browser, plain is neither. */
export type Tone = "money" | "page" | "plain";

export interface Story {
  readonly icon: Icon;
  readonly sentence: (input: ToolInput) => string;
  readonly tone: Tone;
}

const amount = (input: ToolInput): string =>
  input.amountUsd === undefined ? "some USDC" : `${input.amountUsd} USDC`;

const STORIES = {
  browser_click: {
    icon: MousePointerClickIcon,
    sentence: (input) => `Clicked ${input.ref ?? "an element"}`,
    tone: "page",
  },
  browser_navigate: {
    icon: GlobeIcon,
    sentence: (input) => `Opened ${hostOf(input.url ?? "")}`,
    tone: "page",
  },
  browser_snapshot: {
    icon: CameraIcon,
    sentence: () => "Read the page",
    tone: "page",
  },
  browser_type: {
    icon: KeyboardIcon,
    sentence: (input) => `Typed “${(input.text ?? "").slice(0, 40)}”`,
    tone: "page",
  },
  graph_query: {
    icon: BarChart3Icon,
    sentence: (input) =>
      `Asked The Graph about ${input.symbol ?? "the market"}`,
    tone: "plain",
  },
  wallet_send: {
    icon: SendIcon,
    sentence: (input) =>
      `Tried to send ${amount(input)} to ${shortAddress(input.to ?? null)}`,
    tone: "money",
  },
  wallet_status: {
    icon: WalletIcon,
    sentence: () => "Checked the wallet",
    tone: "plain",
  },
  wallet_topup: {
    icon: PiggyBankIcon,
    sentence: (input) => `Topped up the pocket with ${amount(input)}`,
    tone: "money",
  },
  x402_probe: {
    icon: SearchIcon,
    sentence: (input) => `Asked what ${hostOf(input.url ?? "")} costs`,
    tone: "plain",
  },
  x402_fetch: {
    icon: ReceiptTextIcon,
    sentence: (input) =>
      `Requested a paid resource at ${hostOf(input.url ?? "")}`,
    tone: "money",
  },
} satisfies Record<string, Story>;

/** The tools whose run can end in a payment, and so can wait on the person. */
export const MONEY_TOOLS: ReadonlySet<string> = new Set([
  "graph_query",
  "wallet_send",
  "wallet_topup",
  "x402_fetch",
]);

const BY_NAME: ReadonlyMap<string, Story> = new Map(Object.entries(STORIES));

/** A tool this file has not met reads as "Ran <its name in words>". */
export const storyOf = (name: string): Story =>
  BY_NAME.get(name) ?? {
    icon: WrenchIcon,
    sentence: () => `Ran ${name.replaceAll("_", " ")}`,
    tone: "plain",
  };
