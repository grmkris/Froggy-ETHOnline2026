/**
 * One button, one dialog, two ways in.
 *
 * Money reaches the wallet as USDC on Base either by sending it there from
 * any wallet or exchange, which needs nothing but the address, or by card
 * through Privy's onramp, which needs a Privy sign-in and a provider that
 * serves the person's region. The address comes first because it always
 * works; the card is the convenience. Without a sign-in the dialog says what
 * is missing instead of pretending.
 */

import type { WalletSummary } from "@froggy/protocol";
import { Button } from "@froggy/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@froggy/ui/components/dialog";
import { CreditCardIcon, PlusIcon } from "lucide-react";
import { useRef, useState } from "react";
import type { ReactElement } from "react";

import { networkWords } from "../../lib/mandate-words";
import { useIdentity } from "../../lib/privy";
import type { FundOutcome } from "../../lib/privy";
import { CopyButton } from "../copy-button";

type FundingOutcome = FundOutcome | "opening" | null;

const outcomeWords = (outcome: FundingOutcome): string => {
  if (outcome === "opening") {
    return "Opening the card checkout…";
  }
  if (outcome === null) {
    return "Card or Apple Pay through Privy, where available.";
  }
  if (outcome.kind === "refused") {
    return `The card checkout could not finish: ${outcome.reason}`;
  }
  return "Submitted to the provider. The balance updates when the funds land; they may still be on their way.";
};

/** Why the card path is closed, when it is. */
const unavailableWords = (
  stubbed: boolean,
  wallet: WalletSummary | null
): string => {
  if (stubbed) {
    return "This is a local identity. Adding real funds needs a Privy sign-in.";
  }
  if (wallet?.balances.evmNetwork !== "eip155:8453") {
    return `Card funding deposits USDC on Base mainnet. This wallet is on ${wallet === null ? "another network" : networkWords(wallet.balances.evmNetwork)}.`;
  }
  return "A wallet is needed before you can add funds.";
};

/** The address, and the one sentence that says what to send to it. */
const SendToAddress = ({
  address,
  wallet,
}: {
  readonly address: string;
  readonly wallet: WalletSummary | null;
}): ReactElement => (
  <section className="flex flex-col gap-2 text-sm">
    <h3 className="font-medium">
      Send USDC on{" "}
      {wallet === null ? "Base" : networkWords(wallet.balances.evmNetwork)} to
    </h3>
    <p className="text-machine break-all">{address}</p>
    <CopyButton label="Copy wallet address" text={address} />
    <p className="text-muted-foreground text-xs">
      From a wallet that supports{" "}
      {wallet === null
        ? "this network"
        : networkWords(wallet.balances.evmNetwork)}
      . The balance updates about a minute after the transfer confirms.
    </p>
  </section>
);

/** The card path: a button while Privy can open it, a sentence when it cannot. */
const PayByCard = ({
  address,
  wallet,
}: {
  readonly address: string | null;
  readonly wallet: WalletSummary | null;
}): ReactElement => {
  const identity = useIdentity();
  const [outcome, setOutcome] = useState<FundingOutcome>(null);
  const submitting = useRef(false);
  const canFund =
    identity.addFunds !== null &&
    address !== null &&
    wallet?.balances.evmNetwork === "eip155:8453";
  const failed =
    outcome !== null && outcome !== "opening" && outcome.kind === "refused";

  const open = async (): Promise<void> => {
    if (
      submitting.current ||
      !canFund ||
      identity.addFunds === null ||
      address === null
    ) {
      return;
    }
    submitting.current = true;
    setOutcome("opening");
    try {
      setOutcome(await identity.addFunds({ address }));
    } catch {
      setOutcome({ kind: "refused", reason: "Please try again." });
    }
    submitting.current = false;
  };

  return (
    <section className="flex flex-col gap-2 border-t pt-4 text-sm">
      <h3 className="font-medium">Or pay by card</h3>
      {canFund ? (
        <Button
          className="min-h-11 self-start px-4"
          disabled={outcome === "opening"}
          onClick={() => {
            void open();
          }}
          variant="outline"
        >
          <CreditCardIcon data-icon="inline-start" />
          {outcome === "opening" ? "Opening…" : "Pay by card"}
        </Button>
      ) : null}
      <output
        className="text-muted-foreground text-xs"
        role={failed ? "alert" : undefined}
      >
        {canFund
          ? outcomeWords(outcome)
          : unavailableWords(identity.stubbed, wallet)}
      </output>
    </section>
  );
};

export const AddFunds = ({
  wallet,
}: {
  readonly wallet: WalletSummary | null;
}): ReactElement => {
  const [open, setOpen] = useState(false);
  const address = wallet?.address ?? null;
  return (
    <>
      <Button
        className="min-h-11 self-start px-4"
        onClick={() => {
          setOpen(true);
        }}
      >
        <PlusIcon data-icon="inline-start" />
        Add funds
      </Button>
      <Dialog onOpenChange={setOpen} open={open}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add funds</DialogTitle>
            <DialogDescription>
              Add USDC on{" "}
              {wallet === null
                ? "your wallet’s network"
                : networkWords(wallet.balances.evmNetwork)}{" "}
              to pay for services.
            </DialogDescription>
          </DialogHeader>
          {address === null ? null : (
            <SendToAddress address={address} wallet={wallet} />
          )}
          <PayByCard address={address} wallet={wallet} />
        </DialogContent>
      </Dialog>
    </>
  );
};
