/**
 * The chat before anything has been said: what the wallet holds, in one
 * line, and the three things worth doing first.
 */

import { formatUsd } from "@froggy/domain";
import type { ServiceModes, WalletSummary } from "@froggy/protocol";
import { Button, buttonVariants } from "@froggy/ui/components/button";
import { FrogMark } from "@froggy/ui/components/frog-mark";
import { cn } from "@froggy/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import {
  ArrowUpRightIcon,
  BotIcon,
  ChartNoAxesCombinedIcon,
  SparklesIcon,
} from "lucide-react";
import type { ReactElement } from "react";

import { walletAmounts } from "../../lib/wallet-view";
import { MorphText } from "../morph-text";

interface EmptyStateProps {
  readonly disabled: boolean;
  readonly modes: ServiceModes | null;
  readonly onSend: (text: string) => void;
  readonly wallet: WalletSummary | null;
}

const ACTION =
  "h-auto min-h-11 min-w-0 flex-row items-start justify-start gap-3 p-4 text-left whitespace-normal has-data-[icon=inline-start]:pl-4 sm:min-h-40 sm:flex-col sm:p-5 sm:has-data-[icon=inline-start]:pl-5";

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
      <MorphText className="text-money text-foreground text-sm tabular-nums">
        {totalUsdMicros === null
          ? "balance unavailable"
          : formatUsd(totalUsdMicros)}
      </MorphText>
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
    className="flex flex-col gap-6 px-1 py-2 sm:gap-8"
  >
    <div>
      <div className="mb-4 flex items-center gap-3 sm:mb-5 sm:flex-col sm:items-start sm:gap-5">
        <span className="bg-brand-soft grid size-10 shrink-0 place-items-center rounded-xl sm:size-16 sm:rounded-2xl">
          <FrogMark className="size-8 sm:size-12" />
        </span>
        <p className="text-brand text-[10px] font-medium tracking-[0.14em] uppercase sm:text-xs">
          A little help goes a long way
        </p>
      </div>
      <h1 className="text-title max-w-lg text-balance">
        What would you like to do?
      </h1>
      <p className="text-muted-foreground mt-3 max-w-lg text-sm leading-relaxed">
        Research an idea, make something, or put your agent to work.
      </p>
    </div>
    <div className="grid gap-3 sm:grid-cols-3">
      <Button
        aria-label="Buy the lending snapshot"
        className={ACTION}
        disabled={disabled}
        onClick={() => {
          onSend("Buy the lending snapshot and tell me what it says.");
        }}
        variant="outline"
      >
        <ChartNoAxesCombinedIcon aria-hidden data-icon="inline-start" />
        <span className="flex flex-col gap-1">
          <span>Buy the lending snapshot</span>
          <span className="text-muted-foreground text-xs leading-relaxed font-normal">
            A fresh look at the lending market.
          </span>
        </span>
      </Button>
      <Link
        aria-label="Browse services"
        className={cn(buttonVariants({ variant: "outline" }), ACTION)}
        to="/services"
      >
        <SparklesIcon aria-hidden data-icon="inline-start" />
        <span className="flex flex-col gap-1">
          <span>Browse services</span>
          <span className="text-muted-foreground text-xs leading-relaxed font-normal">
            Search, images, audio, and more.
          </span>
        </span>
      </Link>
      <Link
        aria-label="Connect an agent"
        className={cn(buttonVariants({ variant: "outline" }), ACTION)}
        to="/agents"
      >
        <BotIcon aria-hidden data-icon="inline-start" />
        <span className="flex flex-col gap-1">
          <span>Connect an agent</span>
          <span className="text-muted-foreground text-xs leading-relaxed font-normal">
            Bring your own. Set it to work.
          </span>
        </span>
      </Link>
    </div>
    <div className="flex flex-col gap-1 border-t pt-3">
      <WalletPeek wallet={wallet} />
      <p className="text-muted-foreground text-xs leading-relaxed">
        Paid tasks are paid from your wallet. Every payment leaves a receipt.
        {modes?.model === "stub"
          ? " This build uses a simulated agent and marks its receipts."
          : ""}
      </p>
    </div>
  </section>
);
