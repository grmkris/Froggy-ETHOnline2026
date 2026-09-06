/**
 * The wallet, first.
 *
 * What a person holds, before any conversation: one dollar total, then the
 * three places the money is — USDC in their wallet on Base, HBAR in their
 * own Hedera account, the service credit Froggy spends for them — each with
 * the address that names it and a Copy button, then the three things they
 * can do about it and the last few receipts. Balances are what the chains
 * said a moment ago; nothing here is spent on the strength of them.
 */

import { formatUsd } from "@froggy/domain";
import type { Receipt } from "@froggy/domain";
import type { WalletSummary } from "@froggy/protocol";
import { Button } from "@froggy/ui/components/button";
import { useState } from "react";
import type { ReactElement } from "react";

import {
  evmAddressUrl,
  explorerUrl,
  hederaAccountUrl,
  shortAddress,
} from "../../lib/format";
import { useIdentity } from "../../lib/privy";
import type { FundOutcome, Identity } from "../../lib/privy";

const USDC_DECIMALS = 1_000_000;
const TINYBARS = 100_000_000;

const dollars = (value: number | null): string =>
  value === null ? "—" : formatUsd(Math.round(value * USDC_DECIMALS));

/** One row of the wallet, as words and a link, computed once per render. */
interface RowView {
  readonly amount: string;
  readonly href: string | null;
  readonly label: string;
  readonly name: string | null;
  readonly note: string;
}

const usdcRow = (wallet: WalletSummary | null): RowView => {
  const address = wallet?.address ?? null;
  const balances = wallet?.balances ?? null;
  const units = balances?.usdcUnits ?? null;
  const onMainnet = balances?.evmNetwork === "eip155:8453";
  let note = "your Privy wallet";
  if (address === null) {
    note = "Sign in with Privy to get a wallet.";
  } else if (units === null) {
    note = "balance not read on this build";
  }
  return {
    amount: dollars(units === null ? null : Number(units) / USDC_DECIMALS),
    href:
      address === null || balances === null
        ? null
        : evmAddressUrl(address, balances.evmNetwork),
    label: `USDC on ${onMainnet ? "Base" : "Base Sepolia"}`,
    name: address,
    note,
  };
};

const hederaRow = (wallet: WalletSummary | null): RowView => {
  const accountId = wallet?.hederaAccountId ?? null;
  const balances = wallet?.balances ?? null;
  const tinybars = balances?.hbarTinybars ?? null;
  const hbar = tinybars === null ? null : Number(tinybars) / TINYBARS;
  const rate = balances?.usdMicrosPerHbar ?? null;
  let amount = "—";
  if (hbar !== null) {
    amount = `${hbar.toFixed(2)} HBAR`;
    if (rate !== null) {
      amount += ` · ${dollars((hbar * rate) / USDC_DECIMALS)}`;
    }
  }
  return {
    amount,
    href:
      accountId === null || balances === null
        ? null
        : hederaAccountUrl(accountId, balances.hederaNetwork),
    label: "Your Hedera account",
    name: accountId,
    note:
      accountId === null
        ? "Opens with your first top-up, funded from Froggy's float."
        : "pays every Hedera 402 in your name",
  };
};

const creditDollars = (wallet: WalletSummary | null): number | null =>
  wallet?.pocketUsdMicros === null || wallet?.pocketUsdMicros === undefined
    ? null
    : wallet.pocketUsdMicros / USDC_DECIMALS;

const creditRow = (wallet: WalletSummary | null): RowView => ({
  amount: dollars(creditDollars(wallet)),
  href: null,
  label: "Service credit",
  name: null,
  note: "What Froggy may spend on Hedera for you: the HBAR above, priced in dollars.",
});

const totalDollars = (wallet: WalletSummary | null): number | null => {
  const units = wallet?.balances.usdcUnits ?? null;
  const usdc = units === null ? null : Number(units) / USDC_DECIMALS;
  const credit = creditDollars(wallet);
  if (usdc === null && credit === null) {
    return null;
  }
  return (usdc ?? 0) + (credit ?? 0);
};

const fundingWords = (
  identity: Identity,
  outcome: FundOutcome | "opening" | null
): string => {
  if (outcome === "opening") {
    return "Privy is opening the onramp…";
  }
  if (outcome !== null) {
    switch (outcome.kind) {
      case "confirmed": {
        return "Confirmed: the funds are on their way to your wallet.";
      }
      case "submitted": {
        return "Submitted: the funds arrive in a few minutes.";
      }
      case "refused": {
        return `Privy could not open the onramp: ${outcome.reason}`;
      }
      default: {
        return "";
      }
    }
  }
  if (identity.addFunds !== null) {
    return "Add funds is card or Apple Pay through Privy, landing as USDC. Top up moves USDC into your Hedera account as credit, under your mandate.";
  }
  return identity.stubbed
    ? "Adding funds needs a Privy sign-in; this build runs a local identity."
    : "Adding funds needs a wallet; sign in first.";
};

const CopyButton = ({ text }: { readonly text: string }): ReactElement => {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      onClick={() => {
        void (async () => {
          await navigator.clipboard.writeText(text);
          setCopied(true);
        })();
      }}
      size="xs"
      variant="outline"
    >
      {copied ? "Copied" : "Copy"}
    </Button>
  );
};

const Name = ({
  href,
  name,
}: {
  readonly href: string | null;
  readonly name: string;
}): ReactElement =>
  href === null ? (
    <span>{shortAddress(name)}</span>
  ) : (
    <a
      className="underline decoration-dotted underline-offset-2 hover:decoration-solid"
      href={href}
      rel="noreferrer"
      target="_blank"
    >
      {shortAddress(name)}
    </a>
  );

const Row = ({ row }: { readonly row: RowView }): ReactElement => (
  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t py-2.5 first:border-t-0">
    <div className="min-w-0">
      <div className="text-sm font-medium">{row.label}</div>
      <div className="text-machine text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
        {row.name === null ? null : (
          <>
            <Name href={row.href} name={row.name} />
            <CopyButton text={row.name} />
          </>
        )}
        <span>{row.note}</span>
      </div>
    </div>
    <div className="text-money text-lg">{row.amount}</div>
  </div>
);

const verdictOf = (receipt: Receipt): string => {
  if (receipt.decision._tag !== "allow") {
    return "refused";
  }
  return receipt.failure === undefined ? "paid" : "failed";
};

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
    <li className="flex items-baseline justify-between gap-3 text-xs">
      <span className="text-muted-foreground min-w-0 truncate">
        {receipt.intent.payee.label}
        <span className="opacity-60"> · {verdictOf(receipt)}</span>
      </span>
      <span className="text-machine flex shrink-0 items-baseline gap-2">
        <span className="text-money">
          {formatUsd(receipt.intent.usdMicros)}
        </span>
        {link === null ? null : (
          <a
            className="underline decoration-dotted underline-offset-2 hover:decoration-solid"
            href={link}
            rel="noreferrer"
            target="_blank"
          >
            tx
          </a>
        )}
      </span>
    </li>
  );
};

const Actions = ({
  address,
  identity,
  onConnectAgent,
  onFunding,
  onTopUp,
  opening,
}: {
  readonly address: string | null;
  readonly identity: Identity;
  readonly onConnectAgent: () => void;
  readonly onFunding: (outcome: FundOutcome | "opening") => void;
  readonly onTopUp: (amountUsd: number) => void;
  readonly opening: boolean;
}): ReactElement => {
  const { addFunds } = identity;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {addFunds === null || address === null ? null : (
        <Button
          disabled={opening}
          onClick={() => {
            onFunding("opening");
            void (async () => {
              onFunding(await addFunds({ address }));
            })();
          }}
          size="sm"
        >
          Add funds
        </Button>
      )}
      <Button
        onClick={() => {
          onTopUp(1);
        }}
        size="sm"
        variant="outline"
      >
        Top up credit $1
      </Button>
      <Button onClick={onConnectAgent} size="sm" variant="outline">
        Connect an agent
      </Button>
    </div>
  );
};

export interface WalletHomeProps {
  readonly onConnectAgent: () => void;
  /** Asks the agent to move `amountUsd` of USDC into the service credit. */
  readonly onTopUp: (amountUsd: number) => void;
  readonly receipts: readonly Receipt[];
  readonly wallet: WalletSummary | null;
}

export const WalletHome = ({
  onConnectAgent,
  onTopUp,
  receipts,
  wallet,
}: WalletHomeProps): ReactElement => {
  const identity = useIdentity();
  const [funding, setFunding] = useState<FundOutcome | "opening" | null>(null);
  const rows = [usdcRow(wallet), hederaRow(wallet), creditRow(wallet)];
  const recent = receipts.slice(0, 3);
  return (
    <section
      aria-label="Wallet"
      className="bg-card shadow-card mx-3 rounded-2xl border p-4 sm:mx-0"
    >
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <div className="text-muted-foreground text-xs tracking-wide uppercase">
            Your wallet
          </div>
          <div className="text-money font-display text-4xl leading-tight">
            {dollars(totalDollars(wallet))}
          </div>
        </div>
        <div className="text-muted-foreground max-w-[14rem] text-right text-xs">
          USDC you hold plus the credit Froggy spends for you. The chains are
          read every few seconds.
        </div>
      </div>
      <div className="mt-3">
        {rows.map((row) => (
          <Row key={row.label} row={row} />
        ))}
      </div>
      <Actions
        address={wallet?.address ?? null}
        identity={identity}
        onConnectAgent={onConnectAgent}
        onFunding={setFunding}
        onTopUp={onTopUp}
        opening={funding === "opening"}
      />
      <p className="text-muted-foreground mt-2 text-xs">
        {fundingWords(identity, funding)}
      </p>
      {recent.length === 0 ? null : (
        <ul className="mt-3 space-y-1 border-t pt-3">
          {recent.map((receipt) => (
            <RecentReceipt key={receipt.id} receipt={receipt} />
          ))}
        </ul>
      )}
    </section>
  );
};
