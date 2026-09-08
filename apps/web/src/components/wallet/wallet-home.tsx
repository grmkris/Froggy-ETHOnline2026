/**
 * The wallet as one number.
 *
 * USDC on Base and HBAR on Hedera, added up in dollars, with the breakdown a
 * disclosure away. Money the chain has not answered for is "unavailable",
 * never zero, and never quietly left out of the total.
 */

import { formatUsd } from "@froggy/domain";
import type { WalletSummary } from "@froggy/protocol";
import { WalletIcon } from "lucide-react";
import { useEffect } from "react";
import type { ReactElement } from "react";
import { useTextMorph } from "torph/react";

import { walletAmounts } from "../../lib/wallet-view";
import { AgentOnboarding } from "../agents/copy-agent-prompt";
import { AddFunds } from "./add-funds";
import { WalletBreakdown } from "./wallet-breakdown";

/** Start known totals at zero; Torph keeps the target accessible while digits roll. */
const WalletTotal = ({ value }: { readonly value: number }): ReactElement => {
  const { ref, update } = useTextMorph({
    duration: 600,
    ease: "cubic-bezier(0.23, 1, 0.32, 1)",
    numbers: true,
    respectReducedMotion: true,
  });
  useEffect(() => {
    update(formatUsd(0));
  }, [update]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      update(formatUsd(value));
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [update, value]);
  return (
    <p
      className="text-money mt-2 tabular-nums"
      data-slot="wallet-total"
      ref={(element) => {
        ref.current = element;
      }}
    >
      {formatUsd(0)}
    </p>
  );
};

export const WalletHome = ({
  wallet,
}: {
  readonly wallet: WalletSummary | null;
}): ReactElement => {
  const amounts = walletAmounts(wallet);
  const { totalUsdMicros } = amounts;
  return (
    <section
      aria-label="Wallet"
      className="bg-card shadow-card relative flex flex-col gap-[18px] rounded-2xl p-[18px]"
    >
      <div>
        <div className="mb-4 flex items-center justify-between gap-3">
          <span className="bg-brand-soft text-brand grid size-10 place-items-center rounded-xl">
            <WalletIcon aria-hidden className="size-5" />
          </span>
          <span className="text-machine text-muted-foreground">
            USDC + HBAR
          </span>
        </div>
        <h2 className="text-muted-foreground text-sm font-medium">
          Your wallet
        </h2>
        {totalUsdMicros === null ? (
          <p className="text-money mt-2 tabular-nums">Total unavailable</p>
        ) : (
          <WalletTotal value={totalUsdMicros} />
        )}
        <p className="text-muted-foreground mt-2 text-xs">
          {totalUsdMicros === null
            ? "Known balances are shown below. An unavailable balance is not zero."
            : "USDC on Base and HBAR on Hedera, in dollars."}
        </p>
      </div>
      <div className="flex flex-wrap items-start gap-2">
        <AddFunds wallet={wallet} />
        <AgentOnboarding />
      </div>
      {wallet === null ? null : (
        <WalletBreakdown amounts={amounts} wallet={wallet} />
      )}
    </section>
  );
};
