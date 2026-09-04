/**
 * The workspace: chat, the shared page, and the leash, side by side.
 *
 * They are one screen on purpose. The demo's claim is that you can watch the
 * agent spend and stop it — which only reads as true if the refusal appears in
 * the wallet pane while the page it was refusing to pay for is still on screen.
 */

import { useRef } from "react";

import { BrowserPane } from "../components/browser-pane";
import { ChatPane } from "../components/chat-pane";
import { WalletPane } from "../components/wallet-pane";
import { useAppSocket } from "../hooks/use-app-socket";
import { useBrowserSocket } from "../hooks/use-browser-socket";

export const WorkspacePage = (): React.ReactElement => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const browser = useBrowserSocket(canvasRef);
  const app = useAppSocket();
  const handleBrowserInput = browser.send;
  const handleFreeze = (frozen: boolean): void => {
    app.send({ frozen, type: "mandate.freeze", v: 1 });
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 lg:flex-row">
      <ChatPane />
      <BrowserPane
        canvasRef={canvasRef}
        connected={browser.connected}
        onSend={handleBrowserInput}
        state={browser.state}
      />
      <WalletPane
        lastDecision={app.lastDecision}
        mandate={app.mandate}
        modes={app.modes}
        onFreeze={handleFreeze}
        receipts={app.receipts}
        wallet={app.wallet}
      />
    </div>
  );
};
