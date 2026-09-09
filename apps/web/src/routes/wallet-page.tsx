/** Where the money is: one total, where it sits, and everything it has done. */

import type { ReactElement } from "react";

import { MotionItem } from "../components/motion-item";
import { Page } from "../components/nav/page";
import { WalletActivity } from "../components/wallet/wallet-activity";
import { WalletHome } from "../components/wallet/wallet-home";
import { useWorkspace } from "../lib/workspace-context";

export const WalletPage = (): ReactElement => {
  const { app, receiptHistory } = useWorkspace();
  return (
    <Page slot="wallet-home-scroll" title="Wallet" titleHidden>
      <MotionItem>
        <WalletHome wallet={app.wallet} />
      </MotionItem>
      <MotionItem delay={0.07}>
        <WalletActivity history={receiptHistory} receipts={app.receipts} />
      </MotionItem>
    </Page>
  );
};
