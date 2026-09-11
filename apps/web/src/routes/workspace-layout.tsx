import { Outlet, useLocation } from "@tanstack/react-router";
/**
 * The workspace: everything that must outlive a page change.
 *
 * The sockets, the conversation, the painter and the pop-out live here and
 * are handed down through two contexts. The pages are the routes beneath;
 * a person can leave the chat mid-turn for their wallet and come back to a
 * turn that never stopped.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";

import { Announcer } from "../components/announcer";
import { useSplitWidth } from "../components/browser/browser-split-pane";
import { AppFrame } from "../components/nav/app-frame";
import { PurchaseApprovals } from "../components/purchases/purchase-approvals";
import { useStopRun } from "../components/stop-feedback";
import { TradeNotice } from "../components/trading/trade-panel";
import { useAppSocket } from "../hooks/use-app-socket";
import { useBrowserSocket } from "../hooks/use-browser-socket";
import { useMediaQuery } from "../hooks/use-media-query";
import { usePersistentChat } from "../hooks/use-persistent-chat";
import { usePopOut } from "../hooks/use-pop-out";
import { usePurchases } from "../hooks/use-purchases";
import { useReceipts } from "../hooks/use-receipts";
import { useTrades } from "../hooks/use-trades";
import { useWalletArrival } from "../hooks/use-wallet-arrival";
import { useWebMcp } from "../hooks/use-webmcp";
import type { Notice } from "../lib/app-state";
import { createBrowserPainter } from "../lib/browser-painter";
import { ChatContext } from "../lib/chat-context";
import type { ChatSurface } from "../lib/chat-context";
import { CHAT_ERROR_ID, chatErrorText } from "../lib/chat-error";
import { HistoryContext, useWorkspaceHistory } from "../lib/history-client";
import { useIdentity } from "../lib/privy";
import { SessionIdsContext } from "../lib/session-ids";
import { useSessionToken } from "../lib/session-token";
import { WorkspaceContext } from "../lib/workspace-context";
import type { Workspace } from "../lib/workspace-context";

export const WorkspaceLayout = (): ReactElement => {
  const painter = useMemo(() => createBrowserPainter(), []);
  useEffect(
    () => () => {
      painter.dispose();
    },
    [painter]
  );

  const popOut = usePopOut();
  // The welcome has the workspace's sockets and none of its chrome: no rail,
  // no pill, no top bar, because every step has its own way out and a person
  // being welcomed should not be offered five other places to go.
  const welcome = useLocation({
    select: (location) => location.pathname === "/welcome",
  });
  const [browserRequested, setBrowserRequested] = useState(false);
  const showBrowser = useCallback(() => {
    setBrowserRequested(true);
  }, []);
  const phone = useMediaQuery("(max-width: 767px)");
  const split = useSplitWidth();
  const app = useAppSocket();
  const purchases = usePurchases(app.sessionId);
  const trades = useTrades(app.sessionId);
  const pendingPurchases =
    purchases.purchases.data?.purchases.filter(
      (purchase) => purchase.status === "awaiting_approval"
    ).length ?? 0;
  // While a window holds the page this tab has no screencast of its own.
  const browser = useBrowserSocket(painter, popOut.mode !== "window");
  const identity = useIdentity();
  const { getToken } = useSessionToken();
  // The browser hears about the wallet before the server can read it. Without
  // this, a person who signs in and sits still waits for a request nobody makes.
  useWalletArrival({
    getToken,
    privyAddress: identity.address,
    serverAddress: app.wallet?.address ?? null,
  });
  const receiptHistory = useReceipts(app.sessionId, app.dispatch);

  const history = useWorkspaceHistory(app);
  const persistent = usePersistentChat(history);
  const { chat } = persistent;
  const stopRun = useStopRun(chat.stop);
  const busy = chat.status === "streaming" || chat.status === "submitted";
  // A refused turn — the day's model budget spent, a malformed request — comes
  // back as the request's error, not as a message. It is shown beside the
  // socket's notices so a refusal never reads as a turn that silently did
  // nothing, and dismissing it clears the error the transport recorded.
  const chatNotices = useMemo(
    (): readonly Notice[] =>
      chat.error === undefined
        ? []
        : [
            {
              // Not ordered against the socket's notices; it is shown first.
              at: 0,
              id: CHAT_ERROR_ID,
              text: chatErrorText(chat.error.message),
              tone: "error",
            },
          ],
    [chat.error]
  );
  const { clear: clearStop } = stopRun;
  const { send: sendPersistent } = persistent;
  const send = useCallback(
    (text: string, includeOtherThreads?: boolean): void => {
      clearStop();
      sendPersistent(text, includeOtherThreads);
    },
    [clearStop, sendPersistent]
  );

  // The wallet as tools for this browser's own agent, through the same leash.
  const webMcp = useWebMcp({
    mandate: app.mandate,
    receipts: app.receipts,
    send,
    wallet: app.wallet,
  });

  const deleteMyData = useCallback(async (): Promise<void> => {
    const token = await getToken();
    const response = await fetch("/api/me", {
      headers: token === null ? {} : { authorization: `Bearer ${token}` },
      method: "DELETE",
    });
    if (!response.ok) {
      throw new Error(`delete account: ${response.status}`);
    }
    globalThis.location.reload();
  }, [getToken]);

  const sessionIds = useMemo(
    () => ({
      agentSignerId: app.agentSignerId,
      hcsTopicId: app.hcsTopicId,
      policyId: app.policyId,
    }),
    [app.agentSignerId, app.hcsTopicId, app.policyId]
  );
  const workspace = useMemo(
    (): Workspace => ({
      app,
      deleteMyData,
      pendingPurchases,
      receiptHistory,
      webMcp,
    }),
    [app, deleteMyData, pendingPurchases, receiptHistory, webMcp]
  );
  const surface = useMemo(
    (): ChatSurface => ({
      ...persistent,
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
    }),
    [
      persistent,
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
    ]
  );

  return (
    <SessionIdsContext.Provider value={sessionIds}>
      <WorkspaceContext.Provider value={workspace}>
        <HistoryContext.Provider value={history}>
          <ChatContext.Provider value={surface}>
            <Announcer
              approvals={app.approvals}
              mandate={app.mandate}
              receipts={app.receipts}
            />
            {welcome ? (
              <Outlet />
            ) : (
              <AppFrame
                connected={app.connected}
                modes={app.modes}
                waiting={app.approvals.length + pendingPurchases}
              >
                <PurchaseApprovals api={purchases} />
                <TradeNotice api={trades} />
                <Outlet />
              </AppFrame>
            )}
          </ChatContext.Provider>
        </HistoryContext.Provider>
      </WorkspaceContext.Provider>
    </SessionIdsContext.Provider>
  );
};
