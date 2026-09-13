/**
 * What sits under the conversation: notices, the open questions, the stop
 * feedback, and the composer. Pinned above the keyboard so an approval can be
 * answered from wherever the person is looking.
 */

import { AnimatePresence } from "motion/react";
import { useEffect, useRef } from "react";
import type { ReactElement } from "react";

import type { AppStream } from "../../hooks/use-app-socket";
import type { Notice } from "../../lib/app-state";
import { CHAT_ERROR_ID } from "../../lib/chat-error";
import type { SlashCommand } from "../../lib/slash";
import { ApprovalTicket } from "../cards/approval-ticket";
import { NoticeList } from "../cards/notice-list";
import { Composer } from "../composer";
import { MotionItem, useArrivalDelays } from "../motion-item";
import { StopFeedback } from "../stop-feedback";
import type { useStopRun } from "../stop-feedback";
import { AttachedItem } from "../watchlist/attached-item";
import { ConversationOptions } from "./conversation-options";

export const ComposerStack = ({
  app,
  busy,
  chatNotices,
  disabledReason,
  onClearError,
  onCommand,
  onSend,
  stopRun,
  suggestions,
}: {
  readonly app: AppStream;
  readonly busy: boolean;
  readonly chatNotices: readonly Notice[];
  readonly disabledReason: string | null;
  readonly onClearError: () => void;
  readonly onCommand: (command: SlashCommand) => void;
  readonly onSend: (text: string) => void;
  readonly stopRun: ReturnType<typeof useStopRun>;
  readonly suggestions: readonly string[];
}): ReactElement => {
  const delays = useArrivalDelays(app.approvals.map((request) => request.id));
  const approvalCount = app.approvals.length;
  const previousCount = useRef(approvalCount);
  useEffect(() => {
    const lost = previousCount.current > approvalCount;
    previousCount.current = approvalCount;
    if (!lost) {
      return;
    }
    const active = document.activeElement;
    if (active instanceof HTMLElement && document.contains(active)) {
      return;
    }
    const nextDeny =
      document.querySelector<HTMLButtonElement>('[data-kind="deny"]');
    if (nextDeny !== null) {
      nextDeny.focus();
      return;
    }
    document.querySelector<HTMLTextAreaElement>("#composer-message")?.focus();
  }, [approvalCount]);
  return (
    <div className="mx-auto flex w-full max-w-3xl shrink-0 flex-col gap-3 px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <NoticeList
        notices={[
          ...chatNotices,
          ...app.notices.filter((notice) => !notice.id.startsWith("browse:")),
        ]}
        onDismiss={(id) => {
          if (id === CHAT_ERROR_ID) {
            onClearError();
            return;
          }
          app.dispatch({ id, type: "dismiss" });
        }}
      />
      {/* /chat and /chat/$id are separate routes, so this stack remounts
          onto a card that is already waiting. Skipping first-mount would
          drop the spring the typed-then-asked path is specified to keep. */}
      <AnimatePresence>
        {app.approvals.map((request) => (
          <MotionItem
            delay={delays.get(request.id) ?? 0}
            key={request.id}
            spring
          >
            <ApprovalTicket
              disabled={!app.connected}
              onAnswer={(requestId, optionId) => {
                app.send({
                  optionId,
                  requestId,
                  type: "approval.resolve",
                  v: 1,
                });
              }}
              request={request}
            />
          </MotionItem>
        ))}
      </AnimatePresence>
      <StopFeedback
        state={stopRun.state}
        onRetry={() => {
          stopRun.stop();
        }}
        onDismiss={() => {
          stopRun.clear();
        }}
      />
      <Composer
        tools={
          <>
            <ConversationOptions />
            <AttachedItem />
          </>
        }
        asking={app.approvals.length > 0}
        busy={busy}
        disabledReason={disabledReason}
        onCommand={onCommand}
        onSend={onSend}
        onStop={() => {
          stopRun.stop();
        }}
        suggestions={suggestions}
      />
    </div>
  );
};
