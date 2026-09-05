/**
 * What the agent did, as a card.
 *
 * Each tool has a sentence and an icon, so a turn reads as a short story
 * rather than a list of function names. The raw input and output are one
 * click away, never hidden, because "what exactly did it send" is the
 * question this product exists to answer.
 */

import { cn } from "@froggy/ui/lib/utils";
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
} from "lucide-react";
import type { ReactElement } from "react";

import { hostOf } from "../../lib/format";
import type { ToolCall, ToolInput } from "../../lib/tool-call";

type Icon = typeof GlobeIcon;
type Tone = "money" | "page" | "plain";

interface Story {
  readonly icon: Icon;
  readonly sentence: (input: ToolInput) => string;
  readonly tone: Tone;
}

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
      `Tried to send ${input.amountUsd ?? "some"} USDC to ${input.to ?? "an address"}`,
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

const TONE: Record<Tone, string> = {
  money: "border-brand/30 bg-brand-soft/50",
  page: "border-drive-agent/30 bg-drive-agent-soft/50",
  plain: "border-border bg-card",
};

const BY_NAME: ReadonlyMap<string, Story> = new Map(Object.entries(STORIES));

const storyOf = (name: string): Story =>
  BY_NAME.get(name) ?? {
    icon: WalletIcon,
    sentence: () => name,
    tone: "plain",
  };

const statusWord = (call: ToolCall): string => {
  if (call.state === "output-error") {
    return "failed";
  }
  if (call.state === "output-available") {
    return "done";
  }
  return "running…";
};

export const ToolCard = ({
  call,
}: {
  readonly call: ToolCall;
}): ReactElement => {
  const story = storyOf(call.name);
  const status = statusWord(call);
  const IconOf = story.icon;
  return (
    <details
      className={cn(
        "group open:shadow-card rounded-xl border text-sm transition-colors",
        TONE[story.tone],
        status === "failed" && "border-destructive/40"
      )}
    >
      <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 select-none [&::-webkit-details-marker]:hidden">
        <IconOf
          className={cn(
            "size-4 shrink-0 opacity-70",
            status === "running…" && "motion-safe:animate-pulse"
          )}
        />
        <span className="flex-1 truncate">{story.sentence(call.input)}</span>
        <span className="text-machine opacity-60">{status}</span>
      </summary>
      <div className="space-y-2 border-t px-3 py-2">
        <pre className="text-machine max-h-40 overflow-auto whitespace-pre-wrap">
          {JSON.stringify(call.input, null, 2)}
        </pre>
        {call.output === null ? null : (
          <pre className="text-machine bg-paper-deep/70 max-h-64 overflow-auto rounded-lg p-2 whitespace-pre-wrap">
            {call.output.slice(0, 4000)}
          </pre>
        )}
        {call.errorText === null ? null : (
          <p className="text-destructive text-xs">{call.errorText}</p>
        )}
      </div>
    </details>
  );
};
