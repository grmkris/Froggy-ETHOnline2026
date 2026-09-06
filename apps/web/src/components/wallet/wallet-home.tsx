import { formatUsd } from "@froggy/domain";
import type { Mandate, Receipt } from "@froggy/domain";
import type { WalletSummary } from "@froggy/protocol";
import { Button } from "@froggy/ui/components/button";
import { ArrowUpRightIcon, ChevronDownIcon, PlusIcon } from "lucide-react";
import type { ReactElement } from "react";

import { evmAddressUrl, explorerUrl, hederaAccountUrl } from "../../lib/format";
import { capsLine, networkWords } from "../../lib/mandate-words";
import { receiptStatus } from "../../lib/receipt-status";
import { walletAmounts } from "../../lib/wallet-view";
import { CopyButton } from "../copy-button";

const amount = (micros: number | null): string =>
  micros === null ? "Unavailable" : formatUsd(micros);

const AccountDetails = ({
  wallet,
}: {
  readonly wallet: WalletSummary | null;
}): ReactElement => (
  <details className="group border-t pt-4">
    <summary className="focus-visible:ring-ring flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-lg text-sm font-medium outline-none focus-visible:ring-2">
      Account details
      <ChevronDownIcon aria-hidden className="size-4 group-open:rotate-180" />
    </summary>
    <div className="flex flex-col gap-5 pt-3 text-sm">
      <div className="flex flex-col gap-2">
        <p className="font-medium">
          USDC on{" "}
          {wallet === null ? "Base" : networkWords(wallet.balances.evmNetwork)}
        </p>
        {wallet !== null && wallet.address !== null ? (
          <>
            <a
              className="text-machine break-all underline underline-offset-4"
              href={evmAddressUrl(wallet.address, wallet.balances.evmNetwork)}
              target="_blank"
              rel="noreferrer"
            >
              {wallet.address}
            </a>
            <CopyButton
              label="Copy Base wallet address"
              text={wallet.address}
            />
          </>
        ) : (
          <p className="text-muted-foreground text-xs">
            A wallet address is available after signing in with Privy.
          </p>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <p className="font-medium">Your Hedera account</p>
        {wallet !== null && wallet.hederaAccountId !== null ? (
          <>
            <a
              className="text-machine underline underline-offset-4"
              href={hederaAccountUrl(
                wallet.hederaAccountId,
                wallet.balances.hederaNetwork
              )}
              target="_blank"
              rel="noreferrer"
            >
              {wallet.hederaAccountId}
            </a>
            <CopyButton
              label="Copy Hedera account"
              text={wallet.hederaAccountId}
            />
          </>
        ) : (
          <p className="text-muted-foreground text-xs">
            Opens with your first top-up.
          </p>
        )}
        {wallet?.balances.hbarTinybars === null ||
        wallet?.balances.hbarTinybars === undefined ? null : (
          <p className="text-money">
            {(Number(wallet.balances.hbarTinybars) / 100_000_000).toFixed(2)}{" "}
            HBAR
          </p>
        )}
        <p className="text-muted-foreground text-xs">
          The onchain HBAR balance is separate from your task credit. Its dollar
          value can change.
        </p>
      </div>
    </div>
  </details>
);

const RecentReceipt = ({
  receipt,
}: {
  readonly receipt: Receipt;
}): ReactElement => {
  const link =
    receipt.settlement === undefined
      ? null
      : explorerUrl(
          receipt.settlement.network,
          receipt.settlement.transactionId
        );
  return (
    <li className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">
          {receipt.intent.payee.label}
        </p>
        <p className="text-muted-foreground text-xs">
          {receiptStatus(receipt)}
          {receipt.stubbed ? " · Simulated" : ""}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="text-money text-sm">
          {formatUsd(receipt.intent.usdMicros)}
        </span>
        {link === null ? null : (
          <a
            aria-label={`View transaction for ${receipt.intent.payee.label}`}
            className="focus-visible:ring-ring hover:bg-muted grid size-11 place-items-center rounded-lg outline-none focus-visible:ring-2"
            href={link}
            target="_blank"
            rel="noreferrer"
          >
            <ArrowUpRightIcon className="size-4" />
          </a>
        )}
      </div>
    </li>
  );
};

export interface WalletHomeProps {
  readonly mandate: Mandate | null;
  readonly onConnectAgent: () => void;
  readonly onFunding: () => void;
  readonly onOpenLimits: () => void;
  readonly receipts: readonly Receipt[];
  readonly wallet: WalletSummary | null;
}

export const WalletHome = ({
  mandate,
  onConnectAgent,
  onFunding,
  onOpenLimits,
  receipts,
  wallet,
}: WalletHomeProps): ReactElement => {
  const { credit, funds, total } = walletAmounts(wallet);
  const hasCredit = credit !== null && credit > 0;
  const fundingLabel =
    funds !== null && funds > 0 ? "Add task credit" : "Add funds";
  return (
    <section
      aria-label="Wallet"
      className="bg-card shadow-card flex flex-col gap-5 rounded-2xl border p-4 sm:gap-6 sm:p-6"
    >
      <div>
        <h2 className="text-muted-foreground text-sm font-medium">
          Your wallet
        </h2>
        <p className="text-money mt-2 text-[2rem] leading-9 sm:text-[2.5rem] sm:leading-11">
          {total === null ? "Total unavailable" : formatUsd(total)}
        </p>
        <p className="text-muted-foreground mt-2 text-xs">
          {total === null
            ? "Known balances are shown below. An unavailable balance is not zero."
            : "Wallet funds and task credit, together."}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          className="min-h-11 px-4"
          onClick={onFunding}
          variant={hasCredit ? "outline" : "default"}
        >
          <PlusIcon data-icon="inline-start" />
          {fundingLabel}
        </Button>
        <Button
          className="min-h-11 px-4"
          onClick={onConnectAgent}
          variant={hasCredit ? "default" : "outline"}
        >
          Connect an agent
        </Button>
      </div>
      <dl className="grid grid-cols-2 gap-4 border-y py-4">
        <div>
          <dt className="text-muted-foreground text-xs">Wallet funds</dt>
          <dd className="text-money mt-1 text-xl">{amount(funds)}</dd>
          <dd className="text-muted-foreground mt-1 text-xs">
            USDC on{" "}
            {wallet === null
              ? "Base"
              : networkWords(wallet.balances.evmNetwork)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Task credit</dt>
          <dd className="text-money mt-1 text-xl">{amount(credit)}</dd>
          <dd className="text-muted-foreground mt-1 text-xs">
            Available for Froggy tasks
          </dd>
        </div>
      </dl>
      <div className="bg-muted/50 flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2">
        <div className="min-w-0">
          <p className="text-xs font-medium">Spending limits</p>
          <p className="text-muted-foreground mt-1 text-xs">
            {mandate === null
              ? "Loading your limits…"
              : (capsLine(mandate) ?? "No spending limits configured.")}
          </p>
        </div>
        <Button className="min-h-11" onClick={onOpenLimits} variant="ghost">
          Edit limits
        </Button>
      </div>
      <AccountDetails wallet={wallet} />
      {receipts.length === 0 ? null : (
        <div className="border-t pt-4">
          <h3 className="text-sm font-medium">Recent activity</h3>
          <ul className="divide-y">
            {receipts.slice(0, 3).map((receipt) => (
              <RecentReceipt key={receipt.id} receipt={receipt} />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
};
