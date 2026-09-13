import type { BrowserState } from "@froggy/protocol";
import { Button } from "@froggy/ui/components/button";
import { Skeleton } from "@froggy/ui/components/skeleton";
import { Link } from "@tanstack/react-router";
import { XIcon } from "lucide-react";
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
import { ComposerStack } from "../components/chat/composer-stack";
import { HomeSummary } from "../components/chat/home-summary";
import { LiveCardSlot } from "../components/chat/live-card-slot";
import { ConversationHeader } from "../components/chat/recent-conversations";
import { EmailThread } from "../components/email/email-thread";
import { EmptyState } from "../components/stream/empty-state";
import { Stream } from "../components/stream/stream";
import { SaveItem } from "../components/watchlist/item-form";
import { WatchlistItems } from "../components/watchlist/watchlist-items";
import { useConnectionLock } from "../hooks/use-connection-lock";
import { useMediaQuery } from "../hooks/use-media-query";
import { useChatSurface } from "../lib/chat-context";
import { useEmailStatus } from "../lib/email-client";
import { scrollToLive } from "../lib/scroll-to-live";
import { applySlash } from "../lib/slash";
import {
  buildStream,
  lastBrowserTurn,
  retryIdOf,
  showThinking,
} from "../lib/stream-model";
import { suggestionInputFrom, suggestionsFor } from "../lib/suggestions";
import { useWorkspace } from "../lib/workspace-context";

const showWatchlistPane = (
  roomy: boolean,
  open: boolean,
  split: boolean
): boolean => roomy && open && !split;

const hasLivePage = (
  state: BrowserState | null,
  lastTurn: string | null
): boolean => state !== null && (state.status !== "idle" || lastTurn !== null);

const activeUrl = (
  state: ReturnType<typeof useChatSurface>["browser"]["state"]
): string | null =>
  state?.tabs.find((tab) => tab.id === state.activeTabId)?.url ?? null;
const historyDisabled = (
  loading: boolean,
  error: string | null,
  blocked: boolean,
  connectionLock: string | null
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
  return connectionLock;
};
const isEmptyConversation = (
  mailbox: boolean,
  messages: number,
  busy: boolean,
  requested: boolean,
  mode: string
): boolean =>
  !mailbox && messages === 0 && !busy && !requested && mode === "inline";
export const ChatPage = (): ReactElement => {
  const { app, pendingPurchases } = useWorkspace();
  const {
    conversationId,
    historyLoading,
    historyError,
    historyReceipts,
    watchlistOpen,
    setWatchlistOpen,
    browser,
    browserRequested,
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
  const roomy = useMediaQuery("(min-width: 1280px)");
  const [liveVisible, setLiveVisible] = useState(true);
  const connectionLock = useConnectionLock(app.connected);

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
  // A paid browse outlives the chat turn that offered the card. Busy is not
  // a gate: Open browser and a live page are each enough on their own.
  const showLive =
    browserRequested ||
    popOut.mode === "window" ||
    hasLivePage(browser.state, liveAfter);
  const browserSplit = roomy && popOut.mode === "split" && showLive;
  const watchlistVisible = showWatchlistPane(
    roomy,
    watchlistOpen,
    browserSplit
  );
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
          popOut.mode === "inline" && roomy ? popOut.handleSplit : null,
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
    connectionLock
  );
  // Loading earlier receipts or restoring Chrome must not dismiss onboarding.
  // Only work in this conversation or an explicit browser action replaces it.
  const emailStatus = useEmailStatus();
  const mailboxConversation =
    emailStatus.data?.mailbox?.conversationId === conversationId;
  const firstUse = isEmptyConversation(
    mailboxConversation,
    chat.messages.length,
    busy,
    browserRequested,
    popOut.mode
  );

  return (
    <div className="flex min-h-0 flex-1">
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        {firstUse ? <HomeSummary /> : null}
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
                <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-4 sm:px-6 sm:py-8">
                  <EmptyState
                    disabled={disabledReason !== null}
                    onSend={send}
                  />
                </div>
              </div>
            ) : (
              <Stream
                key={conversationId}
                context={<EmailThread conversationId={conversationId} />}
                asking={app.approvals.length > 0 || pendingPurchases > 0}
                busy={busy}
                items={items}
                liveAfter={liveAfter}
                liveCard={
                  <LiveCardSlot
                    card={card(false)}
                    mode={
                      popOut.mode === "split" && !roomy ? "inline" : popOut.mode
                    }
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
        <ComposerStack
          app={app}
          busy={busy}
          chatNotices={chatNotices}
          disabledReason={disabledReason}
          onClearError={() => {
            chat.clearError();
          }}
          onCommand={(command) => {
            applySlash(command, { send, stop: stopRun.stop });
          }}
          onSend={send}
          stopRun={stopRun}
          suggestions={suggestions}
        />
      </div>
      {watchlistVisible ? (
        <aside
          aria-label="Watchlist pane"
          className="border-border bg-muted/30 flex w-80 shrink-0 flex-col gap-5 overflow-y-auto border-l p-5 2xl:w-96"
        >
          <div className="flex items-center justify-between">
            <Link
              to="/watchlist"
              className="text-lg font-semibold tracking-tight"
            >
              Watchlist
            </Link>
            <Button
              aria-label="Close watchlist"
              variant="ghost"
              size="icon-sm"
              onClick={() => {
                setWatchlistOpen(false);
              }}
            >
              <XIcon />
            </Button>
          </div>
          <p className="text-muted-foreground -mt-3 text-xs">
            Good things to come back to.
          </p>
          <WatchlistItems compact />
          <SaveItem />
        </aside>
      ) : null}
      {browserSplit ? (
        <SplitPane
          onPointerDownHandle={split.handlePointerDown}
          onKeyDownHandle={split.handleKeyDown}
          width={split.width}
        >
          {card(true)}
        </SplitPane>
      ) : null}
    </div>
  );
};
