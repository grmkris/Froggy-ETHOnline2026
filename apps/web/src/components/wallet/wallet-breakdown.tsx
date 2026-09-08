/** Where the total sits, chain by chain, behind one disclosure. */

import { formatUsd } from "@froggy/domain";
import type { WalletSummary } from "@froggy/protocol";
import { ChevronDownIcon } from "lucide-react";
import { useState } from "react";
import type { ReactElement } from "react";

import {
  evmAddressUrl,
  hederaAccountUrl,
  shortAddress,
} from "../../lib/format";
import { networkWords } from "../../lib/mandate-words";
import { showsHeld } from "../../lib/wallet-view";
import type { WalletAmounts } from "../../lib/wallet-view";
import { CopyButton } from "../copy-button";
import { MorphText } from "../morph-text";
import { MotionItem } from "../motion-item";

const TINYBARS_PER_HBAR = 100_000_000;

const money = (micros: number | null): string =>
  micros === null ? "Unavailable" : formatUsd(micros);

const Row = ({
  children,
  delay = 0,
  label,
  value,
}: {
  readonly children?: ReactElement | null;
  readonly delay?: number;
  readonly label: string;
  readonly value: string;
}): ReactElement => (
  <MotionItem className="flex flex-col gap-1.5" delay={delay}>
    <div className="flex items-baseline justify-between gap-3">
      <dt className="font-medium">{label}</dt>
      <MorphText as="dd" className="text-money text-sm tabular-nums">
        {value}
      </MorphText>
    </div>
    {children}
  </MotionItem>
);

export const WalletBreakdown = ({
  amounts,
  wallet,
}: {
  readonly amounts: WalletAmounts;
  readonly wallet: WalletSummary;
}): ReactElement => {
  const [open, setOpen] = useState(false);
  const evm = networkWords(wallet.balances.evmNetwork);
  const hedera = networkWords(wallet.balances.hederaNetwork);
  return (
    <details
      className="group border-t pt-4"
      onToggle={(event) => {
        setOpen(event.currentTarget.open);
      }}
    >
      <summary className="focus-visible:ring-ring flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-lg text-sm font-medium outline-none focus-visible:ring-2">
        Where it is
        <ChevronDownIcon aria-hidden className="size-4 group-open:rotate-180" />
      </summary>
      {open ? (
        <dl className="flex flex-col gap-5 pt-3 text-sm">
          <Row label={`USDC on ${evm}`} value={money(amounts.usdcUsdMicros)}>
            {wallet.address === null ? (
              <dd className="text-muted-foreground text-xs">
                A wallet address is available after signing in with Privy.
              </dd>
            ) : (
              <dd className="flex flex-wrap items-center gap-1">
                <a
                  className="text-machine text-xs underline underline-offset-4"
                  href={evmAddressUrl(
                    wallet.address,
                    wallet.balances.evmNetwork
                  )}
                  rel="noreferrer"
                  target="_blank"
                  title={wallet.address}
                >
                  {shortAddress(wallet.address)}
                </a>
                <CopyButton
                  label={`Copy ${evm} wallet address`}
                  text={wallet.address}
                />
              </dd>
            )}
          </Row>
          <Row
            delay={0.035}
            label={`HBAR on ${hedera}`}
            value={
              wallet.hederaAccountId === null
                ? formatUsd(0)
                : money(amounts.hbarUsdMicros)
            }
          >
            {wallet.hederaAccountId === null ? (
              <dd className="text-muted-foreground text-xs">
                No Hedera account yet. It opens with your first Hedera payment,
                funded from your USDC.
              </dd>
            ) : (
              <dd className="flex flex-wrap items-center gap-x-3 gap-y-1">
                {amounts.hbarTinybars === null ? null : (
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {(amounts.hbarTinybars / TINYBARS_PER_HBAR).toFixed(2)} HBAR
                    at the mirror rate
                  </span>
                )}
                <a
                  className="text-machine text-xs underline underline-offset-4"
                  href={hederaAccountUrl(
                    wallet.hederaAccountId,
                    wallet.balances.hederaNetwork
                  )}
                  rel="noreferrer"
                  target="_blank"
                >
                  {wallet.hederaAccountId}
                </a>
                <CopyButton
                  label="Copy Hedera account"
                  text={wallet.hederaAccountId}
                />
              </dd>
            )}
          </Row>
          {showsHeld(wallet) ? (
            <Row
              delay={0.07}
              label="Held for Hedera payments"
              value={money(amounts.heldUsdMicros)}
            >
              <dd className="text-muted-foreground text-xs">
                Kept by Froggy until your own Hedera account opens.
              </dd>
            </Row>
          ) : null}
        </dl>
      ) : null}
    </details>
  );
};
