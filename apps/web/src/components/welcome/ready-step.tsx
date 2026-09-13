/**
 * The two endings.
 *
 * "Use Froggy here" ends on a composer with three starters and a list of what
 * was set and what was left for later. "Connect your own assistant" ends on
 * the sentence to paste, the same one Connections offers, and what the
 * consent screen will show. Both end with Finish, which is the one write:
 * this person has been welcomed.
 */

import { AgentToken, DigestSchedule, OAuthGrant } from "@froggy/domain";
import { Button } from "@froggy/ui/components/button";
import { useQueryClient } from "@tanstack/react-query";
import { Result, Schema } from "effect";
import { CheckIcon, TerminalIcon } from "lucide-react";
import type { ReactElement } from "react";

import { useCredits } from "../../hooks/use-credits";
import { useSetup } from "../../hooks/use-setup";
import { formatCredits } from "../../lib/credit-view";
import { useWorkspace } from "../../lib/workspace-context";
import { AgentOnboarding } from "../agents/copy-agent-prompt";
import { Composer } from "../composer";
import { CopyButton } from "../copy-button";
import { BuyCredits } from "../wallet/buy-credits";
import { StepActions, StepGlyph, StepHeading } from "./frame";

/** In an order a $0.00 account can act on: research first, paid work last. */
const STARTERS = [
  "Compare running shoes under $150",
  "What can you do for me?",
  "Get a lending brief for 5 credits",
] as const;

const decodeDigest = Schema.decodeUnknownResult(DigestSchedule);
const decodeTelegram = Schema.decodeUnknownResult(
  Schema.Struct({ paired: Schema.Boolean })
);
const decodeAgents = Schema.decodeUnknownResult(
  Schema.Struct({
    agents: Schema.Array(AgentToken),
    grants: Schema.Array(OAuthGrant),
  })
);

interface SetUp {
  readonly assistants: number | null;
  readonly digestHour: number | null;
  readonly telegram: boolean | null;
}

/**
 * What the earlier steps left in the cache, read rather than fetched again:
 * step three mounted both controls, and a row that has not loaded says the
 * product default, which is also what an untouched control saved.
 */
const useSetUp = (): SetUp => {
  const queries = useQueryClient();
  const { app } = useWorkspace();
  const digest = decodeDigest(queries.getQueryData(["digest", app.sessionId]));
  const telegram = decodeTelegram(queries.getQueryData(["telegram"]));
  const agents = decodeAgents(queries.getQueryData(["agents"]));
  return {
    assistants: Result.isSuccess(agents)
      ? [...agents.success.agents, ...agents.success.grants].filter(
          (agent) => agent.revokedAt === null
        ).length
      : null,
    digestHour: Result.isSuccess(digest) ? digest.success.hour : null,
    telegram: Result.isSuccess(telegram) ? telegram.success.paired : null,
  };
};

const hourWords = (hour: number): string =>
  new Date(2000, 0, 1, hour).toLocaleTimeString([], { hour: "numeric" });

const Row = ({
  detail,
  done,
  label,
}: {
  readonly detail: string;
  readonly done: boolean;
  readonly label: string;
}): ReactElement => (
  <li className="flex items-start gap-3 py-2.5">
    <span
      aria-hidden
      className={
        done
          ? "bg-primary text-primary-foreground mt-0.5 grid size-5 shrink-0 place-items-center rounded-full"
          : "border-border mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border"
      }
    >
      {done ? <CheckIcon className="size-3" /> : null}
    </span>
    <div className="min-w-0 flex-1">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-medium">{label}</span>
        {done ? null : (
          <span className="text-muted-foreground text-xs">Later</span>
        )}
      </div>
      <p className="text-muted-foreground text-xs leading-relaxed">{detail}</p>
    </div>
  </li>
);

export const ReadyHere = ({
  busy,
  connected,
  onFinish,
  onSend,
  onStop,
}: {
  /** A turn is already running — someone replaying the welcome mid-task. */
  readonly busy: boolean;
  readonly connected: boolean;
  readonly onFinish: () => void;
  /** A first task, typed or picked: the flow ends and the conversation opens. */
  readonly onSend: (text: string) => void;
  readonly onStop: () => void;
}): ReactElement => {
  const setUp = useSetUp();
  const { seenAt } = useSetup();
  const { summary } = useCredits();
  return (
    <>
      <StepHeading
        detail="Start with a conversation. Paid tools use credits within your limits, without a new wallet payment each time."
        illustration={
          <img
            src="/froggy/setup-complete.png"
            alt=""
            width={96}
            height={96}
            className={
              seenAt === null
                ? "setup-celebration size-24 object-contain"
                : "size-24 object-contain"
            }
          />
        }
        title="You’re set."
      />
      <Composer
        asking={false}
        busy={busy}
        disabledReason={connected ? null : "Connecting…"}
        onCommand={(command) => {
          // Slash commands belong to the conversation; Home hands them over too.
          if (command.kind === "stop") {
            onStop();
          } else {
            onFinish();
          }
        }}
        onSend={onSend}
        onStop={onStop}
        placeholder="What should I look into?"
        suggestions={STARTERS}
      />
      <section aria-labelledby="ready-set-up" className="flex flex-col gap-1">
        <h2 className="text-section" id="ready-set-up">
          What you set up
        </h2>
        <ul className="divide-y">
          <Row
            detail={
              summary.data
                ? `${formatCredits(summary.data.limits.perTaskUnits)} per task · ${formatCredits(summary.data.limits.dailyUnits)} in 24 hours`
                : "Your credit limits are available in Your money."
            }
            done={summary.data !== undefined}
            label="Credit limits"
          />
          <Row
            detail={
              setUp.digestHour === null
                ? "Off. Account › Daily digest, when you want it."
                : `Every day at ${hourWords(setUp.digestHour)}, in this browser’s time zone.`
            }
            done={setUp.digestHour !== null}
            label="Daily digest"
          />
          <Row
            detail={
              setUp.telegram === true
                ? "Connected. Froggy can reach your phone."
                : "Not connected. Connections › Telegram, when you want it."
            }
            done={setUp.telegram === true}
            label="Telegram"
          />
          <Row
            detail={
              setUp.assistants !== null && setUp.assistants > 0
                ? `${setUp.assistants} connected. Connections lists them.`
                : "Not connected. Connections › Connect one."
            }
            done={setUp.assistants !== null && setUp.assistants > 0}
            label="Your assistant"
          />
        </ul>
      </section>
      <section
        aria-labelledby="ready-funds"
        className="bg-card shadow-card flex flex-col gap-3 rounded-xl p-4"
      >
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-section" id="ready-funds">
            Buy credits
          </h2>
          <span className="text-muted-foreground text-xs">optional</span>
        </div>
        <p className="text-muted-foreground text-sm leading-relaxed">
          You can talk and look around for free. Paid work waits until you buy
          credits.
        </p>
        <BuyCredits />
      </section>
      <StepActions
        primary={
          <Button className="min-h-11" onClick={onFinish}>
            Finish
          </Button>
        }
      />
    </>
  );
};

const NEXT = [
  "Your assistant reads llm.md and asks to connect.",
  "A consent screen opens here. You choose what it may do: browse in your shared Chrome, use credits for tools under your limits, buy research briefs, read your history.",
  "Ask it what Froggy can do. Disconnect it any time on Connections.",
] as const;

export const ReadyAssistant = ({
  onFinish,
  origin,
}: {
  readonly onFinish: () => void;
  /** Where the MCP server answers: the deployment's, or this page's when it has not said. */
  readonly origin: string;
}): ReactElement => {
  const byHand = `claude mcp add --transport http froggy ${origin}/mcp`;
  return (
    <>
      <StepHeading
        detail="Paste one sentence into your agent’s chat, then approve access in your browser."
        illustration={
          <StepGlyph>
            <TerminalIcon aria-hidden className="size-6" />
          </StepGlyph>
        }
        title="Connect your assistant."
      />
      <div className="flex flex-col gap-2">
        <AgentOnboarding />
        <p className="text-muted-foreground text-xs">
          Works with Claude Code, Cursor and any MCP client.
        </p>
      </div>
      <section aria-labelledby="ready-by-hand" className="flex flex-col gap-2">
        <h2 className="text-sm font-medium" id="ready-by-hand">
          Or add it by hand (Claude Code)
        </h2>
        <p className="text-machine bg-muted shadow-inset rounded-lg p-3 break-all select-all">
          {byHand}
        </p>
        <CopyButton label="Copy the command" text={byHand} />
      </section>
      <section aria-labelledby="ready-next" className="flex flex-col gap-2">
        <h2 className="text-section" id="ready-next">
          What happens next
        </h2>
        <ol className="flex flex-col gap-2">
          {NEXT.map((line, index) => (
            <li className="flex items-start gap-3 text-sm" key={line}>
              <span className="text-machine text-muted-foreground mt-0.5 w-6 shrink-0">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="leading-relaxed">{line}</span>
            </li>
          ))}
        </ol>
      </section>
      <p className="text-muted-foreground text-sm leading-relaxed">
        It uses your Froggy credits within your limits. Buy credits from Your
        money when you need them.
      </p>
      <StepActions
        primary={
          <Button className="min-h-11" onClick={onFinish}>
            Finish
          </Button>
        }
      />
    </>
  );
};
