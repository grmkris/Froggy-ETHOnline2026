/**
 * The conversation: the stream with the ledger filed into it and the live
 * page under the turn that opened it, the composer beneath.
 *
 * The page can leave the column: to a pane beside it, or to a window of its
 * own. Either way it is the same card, and the same painter, with more room.
 */

import type { BrowserState } from "@froggy/protocol";
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

export const ChatPage = (): ReactElement => {
  const { app } = useWorkspace();
  const {
    browser,
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
  // Asked for from the toolbar, before any turn has opened a page.
  const [wanted, setWanted] = useState(false);

  const drive = driveModeOf(browser.state);
  const items = useMemo(
    () => buildStream(chat.messages, app.receipts, app.events),
    [app.events, app.receipts, chat.messages]
  );
  const suggestions = suggestionsFor(
    suggestionInputFrom({
      busy,
      messages: chat.messages,
      pocketUsdMicros: app.wallet?.pocketUsdMicros ?? null,
      receipts: app.receipts,
    })
  );
  const liveAfter = lastBrowserTurn(chat.messages);
  // Only the turn that just failed can be asked again, and only while the
  // error stands; clearing it is part of asking.
  const retryId = retryIdOf(chat.messages, chat.status);
  const showLive =
    wanted || popOut.mode === "window" || hasLivePage(browser.state, liveAfter);
  const currentUrl =
    browser.state?.tabs.find((tab) => tab.id === browser.state?.activeTabId)
      ?.url ?? null;

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

  const disabledReason = stopRun.blocked
    ? "Waiting for the stop request. Check its status below."
    : composerLock(app.connected);
  const firstUse = items.length === 0 && !busy && !showLive;

  return (
    <div className="flex min-h-0 flex-1">
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <ChatToolbar
          drive={drive}
          onShowBrowser={() => {
            setWanted(true);
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
        {firstUse ? (
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-4 sm:px-6 sm:py-6">
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
            asking={app.approvals.length > 0}
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
              void chat.regenerate({ messageId });
            }}
            retryId={retryId}
            thinking={showThinking(chat.messages, chat.status)}
          />
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
