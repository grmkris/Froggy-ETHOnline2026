/** Usage credits and onchain wallet funds keep separate balances and activity. */

import type { ReactElement } from "react";

import { Page } from "../components/nav/page";
import { CreditsPanel } from "../components/wallet/credits-panel";
import { WalletActivity } from "../components/wallet/wallet-activity";
import { WalletHome } from "../components/wallet/wallet-home";
import { useWorkspace } from "../lib/workspace-context";

export const WalletPage = (): ReactElement => {
  const { app, receiptHistory } = useWorkspace();
  return (
    <Page slot="wallet-home-scroll" title="Wallet" titleHidden>
      <CreditsPanel />
      <WalletHome modes={app.modes} wallet={app.wallet} />
      <WalletActivity history={receiptHistory} receipts={app.receipts} />
    </Page>
  );
};
