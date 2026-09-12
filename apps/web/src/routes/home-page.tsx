/**
 * Home: what needs you, what came back, and what is still running.
 *
 * Priority, not recency. Items that need a person come first, then finished
 * work, then a single quiet line for anything scheduled. The composer is here
 * because a task starts with a sentence, but the page is not a chat log — a
 * conversation is something a task *has*, and it lives at /chat.
 *
 * Approvals are surfaced as a count that opens the conversation holding the
 * card, never as a second set of approve buttons. Two places to approve the
 * same thing is how a person pays twice.
 */

import type { Conversation } from "@froggy/domain";
import { ScheduleList as ScheduleListSchema } from "@froggy/protocol";
import { Button } from "@froggy/ui/components/button";
import { FrogMark } from "@froggy/ui/components/frog-mark";
import { Skeleton } from "@froggy/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { Link, Navigate, useNavigate } from "@tanstack/react-router";
import { Schema } from "effect";
import { useMemo } from "react";
import type { ReactElement } from "react";

import { AgentOnboarding } from "../components/agents/copy-agent-prompt";
import { Composer } from "../components/composer";
import { StopFeedback } from "../components/stop-feedback";
import { useConnectionLock } from "../hooks/use-connection-lock";
import { useSetup } from "../hooks/use-setup";
import { useChatSurface } from "../lib/chat-context";
import { copyForHome, poseForHome } from "../lib/frog-pose";
import { useHistoryPage } from "../lib/history-client";
import { useIdentity } from "../lib/privy";
import { cadenceWords, nextRunWords } from "../lib/schedule-words";
import { useSessionToken } from "../lib/session-token";
import { applySlash } from "../lib/slash";
import { useWorkspace } from "../lib/workspace-context";

const decodeSchedules = Schema.decodeUnknownSync(ScheduleListSchema);

const Card = ({
  children,
  tone = "plain",
}: {
  readonly children: ReactElement | readonly ReactElement[];
  readonly tone?: "plain" | "needs";
}): ReactElement => (
  <div
    className={
      tone === "needs"
        ? "bg-card rounded-[var(--radius)] border border-[color-mix(in_oklab,var(--lime)_45%,transparent)] p-4"
        : "bg-card border-border rounded-[var(--radius)] border p-4"
    }
  >
    {children}
  </div>
);

const Home = (): ReactElement => {
  const { app, pendingPurchases } = useWorkspace();
  const { busy, send, stopRun } = useChatSurface();
  const navigate = useNavigate();
  const { getToken } = useSessionToken();
  const connectionLock = useConnectionLock(app.connected);

  const needsUser = app.approvals.length + pendingPurchases;
  const pose = poseForHome(needsUser, busy);

  const conversations = useHistoryPage("/api/conversations?limit=3&q=");
  const recent = useMemo(
    () =>
      conversations.records.filter(
        (record): record is Conversation => record.kind === "conversation"
      ),
    [conversations.records]
  );

  const schedules = useQuery({
    queryFn: async () => {
      const token = await getToken();
      const response = await fetch("/api/schedules", {
        headers: token === null ? {} : { authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        throw new Error(`schedules: ${response.status}`);
      }
      return decodeSchedules(await response.json());
    },
    queryKey: ["schedules"],
    retry: false,
  });
  const watching = (schedules.data?.schedules ?? []).filter(
    (schedule) => schedule.status === "active"
  );

  // One quiet line, and it never says "monitoring": these run on a stated
  // cadence with an expiry, which is a different promise from continuously.
  const [firstWatch] = watching;
  const backgroundLine = ((): string | null => {
    if (firstWatch === undefined) {
      return null;
    }
    if (watching.length === 1) {
      return `One watch, ${cadenceWords(firstWatch.cadence)}. ${nextRunWords(firstWatch)}`;
    }
    return `${watching.length} watches, each on its own schedule.`;
  })();

  const openChat = (): void => {
    void navigate({ to: "/chat" });
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-3.5 px-4 py-6 sm:py-10">
        <div className="flex items-center gap-3">
          <FrogMark className="size-12 shrink-0" pose={pose} />
          <div>
            <h1 className="text-[20px] font-semibold tracking-[-0.02em]">
              {copyForHome(needsUser, busy)}
            </h1>
            <p className="text-muted-foreground text-sm">
              Ask Froggy to look into something, or pick up where you left off.
            </p>
          </div>
        </div>

        <Composer
          asking={needsUser > 0}
          busy={busy}
          disabledReason={connectionLock}
          onCommand={(command) => {
            applySlash(command, { send, stop: stopRun.stop });
            if (command.kind === "status") {
              openChat();
            }
          }}
          onSend={(text) => {
            send(text);
            openChat();
          }}
          onStop={() => {
            stopRun.stop();
          }}
          suggestions={[]}
        />
        <StopFeedback
          state={stopRun.state}
          onRetry={() => {
            stopRun.stop();
          }}
          onDismiss={() => {
            stopRun.clear();
          }}
        />

        {needsUser > 0 ? (
          <Card tone="needs">
            <h2 className="text-[15px] font-semibold">
              {needsUser === 1
                ? "A decision is waiting"
                : `${needsUser} decisions are waiting`}
            </h2>
            <p className="text-muted-foreground mt-0.5 text-sm">
              Froggy will not spend anything until you answer.
            </p>
            <div className="mt-3">
              <Button onClick={openChat}>Review</Button>
            </div>
          </Card>
        ) : null}

        {conversations.isPending ? <Skeleton className="h-24 w-full" /> : null}

        {conversations.isError ? (
          <Card>
            <h2 className="text-[15px] font-semibold">
              Conversations could not be loaded
            </h2>
            <p className="text-muted-foreground mt-0.5 text-sm" role="alert">
              History could not be loaded.
            </p>
            <div className="mt-3">
              <Button
                onClick={() => {
                  void conversations.refetch();
                }}
                variant="outline"
              >
                Retry
              </Button>
            </div>
          </Card>
        ) : null}

        {conversations.isError
          ? null
          : recent.map((record) => (
              <Card key={record.id}>
                <h2 className="text-[15px] font-semibold">{record.title}</h2>
                <p className="text-muted-foreground mt-0.5 text-xs font-[var(--machine)]">
                  {new Date(record.updatedAt).toLocaleString()}
                </p>
                <div className="mt-3">
                  <Button
                    onClick={() => {
                      void navigate({
                        params: { conversationId: record.id },
                        to: "/chat/$conversationId",
                      });
                    }}
                    variant="outline"
                  >
                    Open task
                  </Button>
                </div>
              </Card>
            ))}

        {!conversations.isPending &&
        !conversations.isError &&
        recent.length === 0 &&
        needsUser === 0 ? (
          <Card>
            <h2 className="text-[15px] font-semibold">Nothing yet</h2>
            <p className="text-muted-foreground mt-0.5 text-sm">
              Ask Froggy to compare something, research a token, or plan a trip.
            </p>
          </Card>
        ) : null}

        <AgentOnboarding />

        {backgroundLine === null ? null : (
          <p className="text-muted-foreground flex items-center gap-2 text-sm">
            <span
              aria-hidden
              className="bg-brand size-[7px] shrink-0 rounded-full"
            />
            {backgroundLine}
          </p>
        )}

        {/* The welcome, on request: for a second look, or to show someone. */}
        <p className="mt-4">
          <Link
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex min-h-11 items-center rounded-lg text-xs underline underline-offset-4 outline-none focus-visible:ring-2"
            to="/welcome"
          >
            Show the welcome again
          </Link>
        </p>
      </div>
    </div>
  );
};

/**
 * A signed-up person who has not been welcomed is sent to the welcome first;
 * everyone else gets Home. A local identity is not a sign-up — it walks
 * straight through the gate — so it is never sent, and reaches the welcome
 * from the link at the foot of the page like anyone who wants to see it
 * again. Nothing is drawn while the answer is on its way, so Home does not
 * flash before the welcome replaces it; if the answer never comes, Home it is.
 */
const useWelcomeGate = (): "welcome" | "waiting" | "home" => {
  const identity = useIdentity();
  const setup = useSetup();
  if (identity.stubbed || setup.failed) {
    return "home";
  }
  if (setup.seenAt === undefined) {
    return "waiting";
  }
  return setup.seenAt === null ? "welcome" : "home";
};

export const HomePage = (): ReactElement | null => {
  const gate = useWelcomeGate();
  if (gate === "welcome") {
    return <Navigate replace to="/welcome" />;
  }
  return gate === "home" ? <Home /> : null;
};
