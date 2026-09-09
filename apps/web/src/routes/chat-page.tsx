import type { BrowserState } from "@froggy/protocol";
import { Field, FieldLabel } from "@froggy/ui/components/field";
import { Skeleton } from "@froggy/ui/components/skeleton";
import { Switch } from "@froggy/ui/components/switch";
/**
 * The conversation: the stream with the ledger filed into it and the live
 * page under the turn that opened it, the composer beneath.
 *
 * The page can leave the column: to a pane beside it, or to a window of its
 * own. Either way it is the same card, and the same painter, with more room.
 */
import { useMemo, useState } from "react";
import type { ReactElement } from "react";

import { SplitPane } from "../components/browser/browser-split-pane";
import { BrowserStrip } from "../components/browser/browser-strip";
import {
  driveModeOf,
  LiveBrowserCard,
} from "../components/browser/live-browser-card";
import { ChatToolbar } from "../components/chat/chat-toolbar";
import { ComposerStack } from "../components/chat/composer-stack";
import { LiveCardSlot } from "../components/chat/live-card-slot";
import { ConversationHeader } from "../components/chat/recent-conversations";
import { EmptyState } from "../components/stream/empty-state";
import { Stream } from "../components/stream/stream";
import { useChatSurface } from "../lib/chat-context";
import { scrollToLive } from "../lib/scroll-to-live";
import {
  buildStream,
  lastBrowserTurn,
  retryIdOf,
  showThinking,
} from "../lib/stream-model";
import { suggestionInputFrom, suggestionsFor } from "../lib/suggestions";
import { useWorkspace } from "../lib/workspace-context";

const hasLivePage = (
  state: BrowserState | null,
  lastTurn: string | null
): boolean => state !== null && (state.status !== "idle" || lastTurn !== null);

const composerLock = (connected: boolean): string | null =>
  connected ? null : "Connecting…";

const activeUrl = (
  state: ReturnType<typeof useChatSurface>["browser"]["state"]
): string | null =>
  state?.tabs.find((tab) => tab.id === state.activeTabId)?.url ?? null;
const historyDisabled = (
  loading: boolean,
  error: string | null,
  blocked: boolean,
  connected: boolean
): string | null => {
  if (blocked) {
    return "Waiting for the stop request. Check its status below.";
  }
  if (loading) {
    return "Loading saved conversation…";
  }
  if (error !== null) {
    return "Reload history before sending.";
  }
  return composerLock(connected);
};
export const ChatPage = (): ReactElement => {
  const { app, pendingPurchases } = useWorkspace();
  const {
    conversationId,
    historyLoading,
    historyError,
    historyRecords,
    historyReceipts,
    crossThreadHistory,
    setCrossThreadHistory,
    browser,
    browserRequested,
    showBrowser,
    busy,
    chat,
    chatNotices,
    painter,
    phone,
    popOut,
    send,
    split,
    stopRun,
  } = useChatSurface();
  const [liveVisible, setLiveVisible] = useState(true);

  const drive = driveModeOf(browser.state);
  const receipts = useMemo(() => {
    const runs = new Set(
      chat.messages.flatMap((message) =>
        message.metadata?.runId === undefined ? [] : [message.metadata.runId]
      )
    );
    return [
      ...new Map(
        [...historyReceipts, ...app.receipts]
          .filter((receipt) => runs.has(receipt.runId))
          .map((receipt) => [receipt.id, receipt])
      ).values(),
    ];
  }, [app.receipts, chat.messages, historyReceipts]);
  const items = useMemo(
    () => buildStream(chat.messages, receipts, app.events),
    [app.events, receipts, chat.messages]
  );
  const suggestions = suggestionsFor(
    suggestionInputFrom({
      busy,
      messages: chat.messages,
      receipts,
    })
  );
  const liveAfter = lastBrowserTurn(chat.messages);
  // Only the turn that just failed can be asked again, and only while the
  // error stands; clearing it is part of asking.
  const retryId = retryIdOf(chat.messages, chat.status);
  const selectedActive = historyRecords.some((record) =>
    ["running", "waiting", "accepted"].includes(record.status)
  );
  const showLive =
    (busy || selectedActive || chat.messages.length === 0) &&
    (browserRequested ||
      popOut.mode === "window" ||
      hasLivePage(browser.state, liveAfter));
  const currentUrl = activeUrl(browser.state);

  const card = (fill: boolean): ReactElement => (
    <LiveBrowserCard
      connected={browser.connected}
      drive={drive}
      fill={fill}
      interactive={!phone}
      painter={painter}
      popOut={{
        handleDock: popOut.mode === "split" ? popOut.handleDock : null,
        handleSplit:
          popOut.mode === "inline" && !phone ? popOut.handleSplit : null,
        handleToWindow: phone ? null : popOut.handleToWindow,
      }}
      send={browser.send}
      state={browser.state}
    />
  );

  const disabledReason = historyDisabled(
    historyLoading,
    historyError,
    stopRun.blocked,
    app.connected
  );
  // Loading earlier receipts or restoring Chrome must not dismiss onboarding.
  // Only work in this conversation or an explicit browser action replaces it.
  const firstUse =
    chat.messages.length === 0 &&
    !busy &&
    !browserRequested &&
    popOut.mode === "inline";

  return (
    <div className="flex min-h-0 flex-1">
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <ChatToolbar
          drive={drive}
          onShowBrowser={() => {
            showBrowser();
            scrollToLive();
          }}
        />
        {popOut.mode === "inline" && showLive && !liveVisible && busy ? (
          // Over the stream, not in the column: its arrival moves nothing.
          <div className="pointer-events-none absolute inset-x-0 top-12 z-20 px-4">
            <div className="pointer-events-auto">
              <BrowserStrip
                drive={drive}
                onJump={scrollToLive}
                painter={painter}
                url={currentUrl}
              />
            </div>
          </div>
        ) : null}
        <ConversationHeader />
        {historyLoading ? (
          <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 p-6">
            <Skeleton className="h-20 w-2/3" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : null}
        {historyLoading ? null : (
          <div className="contents">
            {firstUse ? (
              <div
                className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
                data-slot="chat-welcome-scroll"
              >
                <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-12">
                  <EmptyState
                    disabled={disabledReason !== null}
                    modes={app.modes}
                    onSend={send}
                    wallet={app.wallet}
                  />
                </div>
              </div>
            ) : (
              <Stream
                key={conversationId}
                asking={app.approvals.length > 0 || pendingPurchases > 0}
                busy={busy}
                items={items}
                liveAfter={liveAfter}
                liveCard={
                  <LiveCardSlot
                    card={card(false)}
                    mode={popOut.mode}
                    onDock={popOut.handleDock}
                    onVisible={setLiveVisible}
                    show={showLive}
                  />
                }
                onRetry={(messageId) => {
                  chat.clearError();
                  send(
                    `Review the saved outcome of message ${messageId} before continuing. Do not repeat any payment without checking its receipt.`
                  );
                }}
                retryId={retryId}
                thinking={showThinking(chat.messages, chat.status)}
              />
            )}
          </div>
        )}
        <Field className="mx-auto max-w-3xl px-4 py-1" orientation="horizontal">
          <Switch
            checked={crossThreadHistory}
            id="history-scope"
            onCheckedChange={(checked) => {
              setCrossThreadHistory(checked);
            }}
          />
          <FieldLabel className="text-muted-foreground" htmlFor="history-scope">
            Allow searching my other conversations
          </FieldLabel>
        </Field>
        <ComposerStack
          app={app}
          busy={busy}
          chatNotices={chatNotices}
          disabledReason={disabledReason}
          onClearError={() => {
            chat.clearError();
          }}
          onCommand={(command) => {
            if (command.kind === "stop") {
              stopRun.stop();
            } else if (command.kind === "status") {
              send("What is the state of the wallet and the mandate?");
            }
          }}
          onSend={send}
          stopRun={stopRun}
          suggestions={suggestions}
        />
      </div>
      {popOut.mode === "split" && showLive ? (
        <SplitPane
          onPointerDownHandle={split.handlePointerDown}
          width={split.width}
        >
          {card(true)}
        </SplitPane>
      ) : null}
    </div>
  );
};
