/**
 * The chat before anything has been said: what the wallet holds, in one
 * line, and the three things worth doing first.
 */

import { formatUsd } from "@froggy/domain";
import type { ServiceModes, WalletSummary } from "@froggy/protocol";
import { Button, buttonVariants } from "@froggy/ui/components/button";
import { Link } from "@tanstack/react-router";
import { ArrowUpRightIcon } from "lucide-react";
import type { ReactElement } from "react";

import { walletAmounts } from "../../lib/wallet-view";

interface EmptyStateProps {
  readonly disabled: boolean;
  readonly modes: ServiceModes | null;
  readonly onSend: (text: string) => void;
  readonly wallet: WalletSummary | null;
}

const ACTION =
  "h-auto min-h-11 justify-between gap-3 px-4 py-3 text-left whitespace-normal";

/** The balance as one line that leads to the wallet. */
const WalletPeek = ({
  wallet,
}: {
  readonly wallet: WalletSummary | null;
}): ReactElement => {
  const { totalUsdMicros } = walletAmounts(wallet);
  return (
    <Link
      className="text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex min-h-11 items-center gap-2 rounded-lg text-sm outline-none focus-visible:ring-2"
      to="/wallet"
    >
      Wallet:{" "}
      <span className="text-money text-foreground tabular-nums">
        {totalUsdMicros === null
          ? "balance unavailable"
          : formatUsd(totalUsdMicros)}
      </span>
      <ArrowUpRightIcon aria-hidden className="size-4" />
    </Link>
  );
};

export const EmptyState = ({
  disabled,
  modes,
  onSend,
  wallet,
}: EmptyStateProps): ReactElement => (
  <section
    aria-label="Use Froggy here"
    className="flex flex-col gap-4 px-1 py-2"
  >
    <div>
      <h2 className="font-display text-2xl font-semibold tracking-tight text-balance">
        What would you like to do?
      </h2>
      <WalletPeek wallet={wallet} />
    </div>
    <div className="flex flex-col gap-2">
      <Button
        className={ACTION}
        disabled={disabled}
        onClick={() => {
          onSend("Buy the lending snapshot and tell me what it says.");
        }}
        variant="outline"
      >
        Buy the lending snapshot{" "}
        <ArrowUpRightIcon className="shrink-0" data-icon="inline-end" />
      </Button>
      <Link
        className={`${buttonVariants({ variant: "outline" })} ${ACTION}`}
        to="/services"
      >
        Browse services
        <ArrowUpRightIcon className="shrink-0" data-icon="inline-end" />
      </Link>
      <Link
        className={`${buttonVariants({ variant: "outline" })} ${ACTION}`}
        to="/agents"
      >
        Connect an agent
        <ArrowUpRightIcon className="shrink-0" data-icon="inline-end" />
      </Link>
    </div>
    <p className="text-muted-foreground text-xs">
      Paid tasks are paid from your wallet. Every payment leaves a receipt.
      {modes?.model === "stub"
        ? " This build uses a simulated agent and marks its receipts."
        : ""}
    </p>
  </section>
);
