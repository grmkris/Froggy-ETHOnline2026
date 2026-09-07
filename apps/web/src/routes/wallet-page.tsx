/** Where the money is: one total, where it sits, and everything it has done. */

import type { ReactElement } from "react";

import { Page } from "../components/nav/page";
import { WalletActivity } from "../components/wallet/wallet-activity";
import { WalletHome } from "../components/wallet/wallet-home";
import { useWorkspace } from "../lib/workspace-context";

export const WalletPage = (): ReactElement => {
  const { app } = useWorkspace();
  return (
    <Page slot="wallet-home-scroll" title="Wallet" titleHidden>
      <WalletHome wallet={app.wallet} />
      <WalletActivity receipts={app.receipts} />
    </Page>
  );
};
