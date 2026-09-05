/**
 * The workspace: one column, and everything in it.
 *
 * The header is the leash; the stream is the conversation with the ledger
 * filed into it and the live page under the turn that opened it; the
 * composer is where you ask. A question for you — an approval — is pinned
 * above the composer so it can be answered from wherever you are looking.
 */

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";

import { BrowserStrip } from "../components/browser/browser-strip";
import {
  driveModeOf,
  LiveBrowserCard,
} from "../components/browser/live-browser-card";
import { ApprovalTicket } from "../components/cards/approval-ticket";
import { NoticeList } from "../components/cards/notice-list";
import { Composer } from "../components/composer";
import { DetailsDrawer } from "../components/drawer/details-drawer";
import { Stream } from "../components/stream/stream";
import { TopBar } from "../components/top-bar";
import { useAppSocket } from "../hooks/use-app-socket";
import { useBrowserSocket } from "../hooks/use-browser-socket";
import { useReceipts } from "../hooks/use-receipts";
import { createBrowserPainter } from "../lib/browser-painter";
import { useSessionToken } from "../lib/session-token";
import { buildStream, lastBrowserTurn } from "../lib/stream-model";
import type { FroggyMessage } from "../lib/stream-model";

const SPRING = { damping: 38, stiffness: 420, type: "spring" } as const;

const composerLock = (frozen: boolean, connected: boolean): string | null => {
  if (frozen) {
    return "The wallet is frozen. Unfreeze it to continue.";
  }
  return connected ? null : "Connecting…";
};

const Empty = (): ReactElement => (
  <div className="mx-auto max-w-md py-16 text-center">
    <p className="font-display text-xl font-semibold">
      Ask for something that costs money.
    </p>
    <p className="text-muted-foreground mt-2 text-sm">
      The mandate decides whether it happens. You will see the page, the
      receipt, and the rule — in that order.
    </p>
  </div>
);

export const WorkspacePage = (): ReactElement => {
  const painter = useMemo(() => createBrowserPainter(), []);
  useEffect(
    () => () => {
      painter.dispose();
    },
    [painter]
  );

  const app = useAppSocket();
  const browser = useBrowserSocket(painter);
  const { getToken } = useSessionToken();
  useReceipts(app.sessionId, app.dispatch);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [liveVisible, setLiveVisible] = useState(true);

  // `headers` is resolved per request rather than captured once, so a turn
  // started an hour into a session sends the refreshed token instead of the
  // one that happened to be current when this component mounted.
  const transport = useMemo(
    () =>
      new DefaultChatTransport<FroggyMessage>({
        api: "/api/chat",
        headers: async () => {
          const token = await getToken();
          return token === null ? {} : { authorization: `Bearer ${token}` };
        },
      }),
    [getToken]
  );
  const chat = useChat<FroggyMessage>({ resume: true, transport });
  const busy = chat.status === "streaming" || chat.status === "submitted";

  const stop = useCallback((): void => {
    // Both halves. The local `stop()` alone detaches this client and leaves
    // the server-owned run happily continuing to spend.
    void (async () => {
      try {
        const token = await getToken();
        await fetch("/api/chat/stop", {
          headers: token === null ? {} : { authorization: `Bearer ${token}` },
          method: "POST",
        });
      } catch {
        console.warn("Could not stop the run; it may still be going.");
      }
    })();
    void chat.stop();
  }, [chat, getToken]);

  const frozen = app.mandate?.frozen ?? false;
  const drive = driveModeOf(browser.state, frozen);
  const items = useMemo(
    () => buildStream(chat.messages, app.receipts),
    [app.receipts, chat.messages]
  );
  const liveAfter = lastBrowserTurn(chat.messages);
  const showLive =
    browser.state !== null &&
    (browser.state.status !== "idle" || liveAfter !== null);
  const currentUrl =
    browser.state?.tabs.find((tab) => tab.id === browser.state?.activeTabId)
      ?.url ?? null;

  const liveCard = showLive ? (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      initial={{ opacity: 0, y: 12 }}
      layout
      onViewportEnter={() => {
        setLiveVisible(true);
      }}
      onViewportLeave={() => {
        setLiveVisible(false);
      }}
      transition={SPRING}
    >
      <LiveBrowserCard
        connected={browser.connected}
        drive={drive}
        painter={painter}
        send={browser.send}
        state={browser.state}
      />
    </motion.div>
  ) : null;

  const disabledReason = composerLock(frozen, app.connected);

  return (
    <div className="flex h-dvh flex-col">
      <TopBar
        connected={app.connected}
        drive={drive}
        mandate={app.mandate}
        modes={app.modes}
        onFreeze={(next) => {
          app.send({ frozen: next, type: "mandate.freeze", v: 1 });
        }}
        onOpenDetails={() => {
          setDetailsOpen(true);
        }}
        wallet={app.wallet}
      />
      {showLive && !liveVisible && busy ? (
        <div className="px-4 pt-3">
          <BrowserStrip
            drive={drive}
            onJump={() => {
              document
                .querySelector('[data-slot="driving-ring"]')
                ?.scrollIntoView({ behavior: "smooth", block: "center" });
            }}
            painter={painter}
            url={currentUrl}
          />
        </div>
      ) : null}
      <Stream
        busy={busy}
        empty={<Empty />}
        items={items}
        liveAfter={liveAfter}
        liveCard={liveCard}
      />
      <div className="mx-auto w-full max-w-3xl space-y-3 px-4 pb-4">
        <NoticeList
          notices={app.notices}
          onDismiss={(id) => {
            app.dispatch({ id, type: "dismiss" });
          }}
        />
        <AnimatePresence>
          {app.approvals.map((request) => (
            <motion.div
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 8 }}
              initial={{ opacity: 0, scale: 0.98, y: 12 }}
              key={request.id}
              transition={SPRING}
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
            </motion.div>
          ))}
        </AnimatePresence>
        <Composer
          busy={busy}
          disabledReason={disabledReason}
          empty={chat.messages.length === 0}
          onSend={(text) => {
            void chat.sendMessage({ metadata: { at: Date.now() }, text });
          }}
          onStop={stop}
        />
      </div>
      <DetailsDrawer
        mandate={app.mandate}
        modes={app.modes}
        onOpenChange={setDetailsOpen}
        open={detailsOpen}
        receipts={app.receipts}
        sessionId={app.sessionId}
        wallet={app.wallet}
      />
    </div>
  );
};
