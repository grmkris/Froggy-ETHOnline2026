/**
 * What the agent did, as a card.
 *
 * A sentence and an icon, a status word, then one line saying what it came
 * to, read from the tool's own answer. The raw input and output are one click
 * away, never hidden, because "what exactly did it send" is the question this
 * product exists to answer. Closed by default: the story is the sentence and
 * the summary; the JSON is for when someone wants to check.
 */

import { WalletMonitorStatus } from "@froggy/domain";
import type { Receipt } from "@froggy/domain";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@froggy/ui/components/collapsible";
import { cn } from "@froggy/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import { Schema } from "effect";
import { ChevronDownIcon } from "lucide-react";
import type { ReactElement } from "react";

import { richResultOf } from "../../lib/tool-call";
import type { ToolCall } from "../../lib/tool-call";
import { toolStatus } from "../../lib/tool-status";
import type { ToolPhase } from "../../lib/tool-status";
import { storyLine, storyOf } from "../../lib/tool-stories";
import type { Tone } from "../../lib/tool-stories";
import { summarize } from "../../lib/tool-summary";
import type { Outcome, ToolSummary } from "../../lib/tool-summary";
import { walletStatusOf } from "../../lib/wallet-status";
import type { WalletStatus } from "../../lib/wallet-status";
import { BrowseTaskForm } from "../browser/browse-task-form";
import { MotionItem } from "../motion-item";
import { GraphSummary } from "./graph-summary";
import { MoneyBody } from "./money-card";
import { RichToolResult } from "./rich-tool-result";
import { WalletStatusCard } from "./wallet-status-card";

const TONE: Record<Tone, string> = {
  money: "ring-brand/30 bg-brand-soft/50",
  page: "ring-drive-agent/30 bg-drive-agent-soft/50",
  plain: "ring-border bg-card",
};

/** The phase overrides the tone's ring; waiting borrows the agent's amber. */
const PHASE: Partial<Record<ToolPhase, string>> = {
  denied: "ring-refused/40",
  failed: "ring-destructive/40",
  refused: "ring-refused/40",
  waiting: "ring-drive-agent/60 bg-drive-agent-soft/70",
};

const OUTCOME_TEXT: Record<Outcome, string> = {
  asked: "text-drive-agent-foreground",
  info: "text-foreground",
  ok: "text-foreground",
  refused: "text-refused",
};

const monitorOutput = Schema.decodeUnknownResult(
  Schema.fromJsonString(
    Schema.Struct({ v: Schema.Literal(1), status: WalletMonitorStatus })
  )
);
const onchainStatusOf = (call: ToolCall): WalletMonitorStatus | null => {
  if (
    ![
      "track_wallet",
      "onchain_alert_configure",
      "wallet_monitor_update",
      "wallet_monitor_status",
    ].includes(call.name) ||
    call.output === null ||
    call.output.length > 200_000
  ) {
    return null;
  }
  const parsed = monitorOutput(call.output);
  return parsed._tag === "Success" ? parsed.success.status : null;
};
const OnchainSummary = ({
  status,
}: {
  readonly status: WalletMonitorStatus;
}): ReactElement => {
  const [rule] = status.monitor?.rules ?? [];
  let condition = "Wallet activity";
  if (rule?.condition._tag === "price") {
    condition = `Price ${rule.condition.comparison} ${rule.condition.threshold} ${rule.condition.quoteCurrency}`;
  } else if (rule?.condition._tag === "transfer") {
    condition = {
      both: "Wallet sends and receives",
      sent: "Wallet sends",
      received: "Wallet receives",
    }[rule.condition.direction];
  } else if (rule?.condition._tag === "swap") {
    condition = {
      both: "Wallet buys and sells",
      bought: "Wallet buys",
      sold: "Wallet sells",
    }[rule.condition.side];
  }
  const state =
    status.state === "triggered"
      ? "price matched"
      : status.state.replaceAll("_", " ");
  return (
    <div className="flex flex-col gap-1 px-3 pb-3 pl-9">
      <p className="font-medium">
        {condition} · {state}
      </p>
      {status.monitor ? (
        <p className="text-muted-foreground text-xs">
          Until {new Date(status.monitor.expiresAt).toLocaleString()} ·{" "}
          {status.telegramPaired
            ? "Telegram connected"
            : "Telegram not connected"}
        </p>
      ) : null}
      {status.stubbed ? (
        <span className="text-muted-foreground text-xs">Simulated stream</span>
      ) : null}
      <Link
        to="/watchlist/$itemId"
        params={{ itemId: status.itemId }}
        className="text-primary w-fit text-xs underline underline-offset-4"
      >
        View in Watchlist
      </Link>
    </div>
  );
};

/** What sits under the header: the receipt, the Graph, the wallet, or one line. */
const Body = ({
  call,
  receipt,
  summary,
  wallet,
}: {
  readonly call: ToolCall;
  readonly receipt: Receipt | null;
  readonly summary: ToolSummary | null;
  readonly wallet: WalletStatus | null;
}): ReactElement | null => {
  if (receipt !== null) {
    return (
      <MotionItem key={receipt.id} spring>
        <MoneyBody call={call} receipt={receipt} />
      </MotionItem>
    );
  }
  if (richResultOf(call) !== null) {
    return null;
  }
  const onchain = onchainStatusOf(call);
  if (onchain !== null) {
    return <OnchainSummary status={onchain} />;
  }
  if (call.graph !== null) {
    return <GraphSummary graph={call.graph} />;
  }
  if (wallet !== null) {
    return <WalletStatusCard status={wallet} />;
  }
  if (summary === null) {
    return null;
  }
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-3 pb-2.5 pl-9">
      <span className={cn("font-medium", OUTCOME_TEXT[summary.outcome])}>
        {summary.headline}
      </span>
      {summary.detail === null ? null : (
        <span className="text-muted-foreground text-xs">{summary.detail}</span>
      )}
      {summary.stubbed ? (
        <span className="text-machine text-muted-foreground">fixture</span>
      ) : null}
    </div>
  );
};

interface ToolCardProps {
  /** An approval card is open somewhere on the page. */
  readonly asking?: boolean;
  readonly call: ToolCall;
  /** The receipt this call produced, when it spent or tried to. */
  readonly receipt?: Receipt | null;
}

export const ToolCard = ({
  asking = false,
  call,
  receipt = null,
}: ToolCardProps): ReactElement => {
  if (
    call.name === "browse_task" &&
    call.output !== null &&
    call.input.prompt !== undefined
  ) {
    return (
      <BrowseTaskForm
        instruction={call.input.prompt}
        requestKey={`browse:${call.toolCallId}`}
      />
    );
  }
  const story = storyOf(call.name);
  const summary = summarize(call);
  const status = toolStatus(call, summary, { asking });
  const IconOf = story.icon;
  const refusedReceipt = receipt?.decision._tag === "deny";
  const wallet =
    call.name === "wallet_status" && call.output !== null
      ? walletStatusOf(call.output)
      : null;
  return (
    <Collapsible
      className={cn(
        "shadow-card rounded-xl text-sm ring-1 transition-colors",
        TONE[story.tone],
        PHASE[status.phase],
        refusedReceipt && "ring-refused/40 bg-card"
      )}
      data-phase={status.phase}
      data-tool={call.name}
    >
      <CollapsibleTrigger className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left select-none [&[data-panel-open]_[data-slot=chevron]]:rotate-180">
        <IconOf aria-hidden className="size-4 shrink-0 opacity-70" />
        <span className="min-w-0 flex-1 truncate">
          {storyLine(story, call.input, status.live)}
        </span>
        <span className="text-machine shrink-0 opacity-60">{status.label}</span>
        <ChevronDownIcon
          aria-hidden
          className="size-3.5 shrink-0 opacity-50"
          data-slot="chevron"
        />
      </CollapsibleTrigger>
      <RichToolResult call={call} />
      <Body call={call} receipt={receipt} summary={summary} wallet={wallet} />
      <CollapsibleContent className="space-y-2 border-t px-3 py-2">
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
      </CollapsibleContent>
    </Collapsible>
  );
};
