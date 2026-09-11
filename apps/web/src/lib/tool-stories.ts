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
  /** What is happening, while it is: "Opening example.com". Falls back to `sentence`. */
  readonly doing?: (input: ToolInput) => string;
  readonly icon: Icon;
  readonly sentence: (input: ToolInput) => string;
  readonly tone: Tone;
}

const amount = (input: ToolInput): string =>
  input.amountUsd === undefined ? "some USDC" : `${input.amountUsd} USDC`;

const STORIES = {
  trade_execute: {
    icon: WalletIcon,
    doing: () => "Checking your trading rule and submitting the trade",
    sentence: () => "Requested execution under your trading rule",
    tone: "money",
  },
  services_list: {
    icon: SearchIcon,
    sentence: () => "Checked available services",
    tone: "plain",
  },
  service_run: {
    icon: ReceiptTextIcon,
    doing: () => "Starting your service task",
    sentence: (input) =>
      `Requested ${input.service?.replaceAll("_", " ") ?? "a service"}`,
    tone: "money",
  },
  service_status: {
    icon: ReceiptTextIcon,
    sentence: () => "Checked your service result",
    tone: "plain",
  },
  browse_task: {
    icon: GlobeIcon,
    tone: "plain",
    doing: () => "Preparing a browsing task",
    sentence: () => "Choose a browsing budget",
  },
  browser_click: {
    doing: (input) => `Clicking ${input.ref ?? "an element"}`,
    icon: MousePointerClickIcon,
    sentence: (input) => `Clicked ${input.ref ?? "an element"}`,
    tone: "page",
  },
  browser_navigate: {
    doing: (input) => `Opening ${hostOf(input.url ?? "")}`,
    icon: GlobeIcon,
    sentence: (input) => `Opened ${hostOf(input.url ?? "")}`,
    tone: "page",
  },
  browser_snapshot: {
    doing: () => "Reading the page",
    icon: CameraIcon,
    sentence: () => "Read the page",
    tone: "page",
  },
  browser_type: {
    doing: (input) => `Typing “${(input.text ?? "").slice(0, 40)}”`,
    icon: KeyboardIcon,
    sentence: (input) => `Typed “${(input.text ?? "").slice(0, 40)}”`,
    tone: "page",
  },
  graph_discover: {
    icon: SearchIcon,
    sentence: (input) =>
      `Searched The Graph for ${input.contract ?? input.query ?? "a subgraph"}`,
    tone: "plain",
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
  "service_run",
  "wallet_send",
  "x402_fetch",
]);

const BY_NAME: ReadonlyMap<string, Story> = new Map(Object.entries(STORIES));

/** The line for a call: what it is doing while live, what it did after. */
export const storyLine = (
  story: Story,
  input: ToolInput,
  live: boolean
): string =>
  live ? (story.doing ?? story.sentence)(input) : story.sentence(input);

/** A tool this file has not met reads as "Ran <its name in words>". */
export const storyOf = (name: string): Story =>
  BY_NAME.get(name) ?? {
    icon: WrenchIcon,
    sentence: () => `Ran ${name.replaceAll("_", " ")}`,
    tone: "plain",
  };
