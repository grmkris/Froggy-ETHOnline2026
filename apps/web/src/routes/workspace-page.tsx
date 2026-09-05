/**
 * The workspace: one column, and everything in it.
 *
 * The header is the leash; the stream is the conversation with the ledger
 * filed into it and the live page under the turn that opened it; the
 * composer is where you ask. A question for you — an approval — is pinned
 * above the composer so it can be answered from wherever you are looking.
 *
 * The page can leave the column: to a pane beside it, or to a window of its
 * own. Either way it is the same card, and the same painter, with more room.
 */

import { useChat } from "@ai-sdk/react";
import { Button } from "@froggy/ui/components/button";
import { DefaultChatTransport } from "ai";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";

import {
  SplitPane,
  useSplitWidth,
} from "../components/browser/browser-split-pane";
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
import { useMediaQuery } from "../hooks/use-media-query";
import { usePopOut } from "../hooks/use-pop-out";
import { useReceipts } from "../hooks/use-receipts";
import { useWebMcp } from "../hooks/use-webmcp";
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

/** Stands in for the card while a window holds the page. */
const Elsewhere = ({
  onDock,
}: {
  readonly onDock: () => void;
}): ReactElement => (
  <div className="rise-in bg-card/60 flex items-center gap-3 rounded-2xl border border-dashed p-4 text-sm">
    <span className="flex-1">The page is open in another window.</span>
    <Button onClick={onDock} size="sm" variant="outline">
      Bring it back
    </Button>
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

  const popOut = usePopOut();
  const phone = useMediaQuery("(max-width: 767px)");
  const split = useSplitWidth();
  const app = useAppSocket();
  // While a window holds the page this tab has no screencast of its own.
  const browser = useBrowserSocket(painter, popOut.mode !== "window");
  const { getToken } = useSessionToken();
  useReceipts(app.sessionId, app.dispatch);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [liveVisible, setLiveVisible] = useState(true);
  // Asked for from the header, before any turn has opened a page.
  const [wanted, setWanted] = useState(false);

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
  // The wallet as tools for this browser's own agent, through the same leash.
  const webMcp = useWebMcp({
    mandate: app.mandate,
    receipts: app.receipts,
    send: (text) => {
      void chat.sendMessage({ metadata: { at: Date.now() }, text });
    },
    wallet: app.wallet,
  });
  const items = useMemo(
    () => buildStream(chat.messages, app.receipts),
    [app.receipts, chat.messages]
  );
  const liveAfter = lastBrowserTurn(chat.messages);
  const showLive =
    wanted ||
    popOut.mode === "window" ||
    (browser.state !== null &&
      (browser.state.status !== "idle" || liveAfter !== null));
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

  const inlineCard = (): ReactElement | null => {
    if (!showLive) {
      return null;
    }
    if (popOut.mode === "window") {
      return <Elsewhere onDock={popOut.handleDock} />;
    }
    if (popOut.mode === "split") {
      return null;
    }
    return (
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
        {card(false)}
      </motion.div>
    );
  };
  const liveCard = inlineCard();
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
        onShowBrowser={() => {
          setWanted(true);
          document
            .querySelector('[data-slot="driving-ring"]')
            ?.scrollIntoView({ behavior: "smooth", block: "center" });
        }}
        wallet={app.wallet}
      />
      <div className="flex min-h-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {popOut.mode === "inline" && showLive && !liveVisible && busy ? (
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
      <DetailsDrawer
        mandate={app.mandate}
        modes={app.modes}
        webMcp={webMcp}
        onDeleteData={() => {
          void (async () => {
            const token = await getToken();
            await fetch("/api/me", {
              headers:
                token === null ? {} : { authorization: `Bearer ${token}` },
              method: "DELETE",
            });
            globalThis.location.reload();
          })();
        }}
        onOpenChange={setDetailsOpen}
        onSaveMandate={(mandate) => {
          app.send({ mandate, type: "mandate.update", v: 1 });
        }}
        open={detailsOpen}
        receipts={app.receipts}
        sessionId={app.sessionId}
        wallet={app.wallet}
      />
    </div>
  );
};
