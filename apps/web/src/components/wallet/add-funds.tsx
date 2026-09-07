/**
 * One button. With a Privy sign-in on Base it opens the card onramp; without
 * one it opens a sentence that says what is missing and, when there is an
 * address, the way to send USDC to it by hand.
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
import { PlusIcon } from "lucide-react";
import { useRef, useState } from "react";
import type { ReactElement } from "react";

import { networkWords } from "../../lib/mandate-words";
import { useIdentity } from "../../lib/privy";
import type { FundOutcome } from "../../lib/privy";
import { CopyButton } from "../copy-button";

type FundingOutcome = FundOutcome | "opening" | null;

const outcomeWords = (outcome: FundingOutcome): string => {
  if (outcome === "opening") {
    return "Opening funding options…";
  }
  if (outcome === null) {
    return "Card or Apple Pay through Privy, where available. Funds arrive as USDC on Base and pay for everything, on every chain.";
  }
  if (outcome.kind === "refused") {
    return `Funding could not finish: ${outcome.reason}`;
  }
  return "Submitted to the provider. The balance updates when the funds land; they may still be on their way.";
};

const unavailableWords = (
  stubbed: boolean,
  wallet: WalletSummary | null
): string => {
  if (stubbed) {
    return "This is a local identity. Adding real funds needs a Privy sign-in.";
  }
  if (wallet?.balances.evmNetwork !== "eip155:8453") {
    return `Card funding deposits USDC on Base mainnet. This wallet is on ${wallet === null ? "another network" : networkWords(wallet.balances.evmNetwork)}, so send USDC there by hand.`;
  }
  return "A wallet is needed before you can add funds.";
};

/** The sentence and the manual path, for when the onramp cannot be opened. */
const AddFundsExplained = ({
  onOpenChange,
  open,
  wallet,
}: {
  readonly onOpenChange: (open: boolean) => void;
  readonly open: boolean;
  readonly wallet: WalletSummary | null;
}): ReactElement => {
  const identity = useIdentity();
  const address = wallet?.address ?? null;
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add funds</DialogTitle>
          <DialogDescription>
            {unavailableWords(identity.stubbed, wallet)}
          </DialogDescription>
        </DialogHeader>
        {address === null ? null : (
          <div className="flex flex-col gap-2 text-sm">
            <p className="font-medium">
              Send USDC on{" "}
              {wallet === null
                ? "Base"
                : networkWords(wallet.balances.evmNetwork)}{" "}
              to
            </p>
            <p className="text-machine break-all">{address}</p>
            <CopyButton label="Copy wallet address" text={address} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export const AddFunds = ({
  wallet,
}: {
  readonly wallet: WalletSummary | null;
}): ReactElement => {
  const identity = useIdentity();
  const [outcome, setOutcome] = useState<FundingOutcome>(null);
  const [explained, setExplained] = useState(false);
  const submitting = useRef(false);
  const address = wallet?.address ?? null;
  const canFund =
    identity.addFunds !== null &&
    address !== null &&
    wallet?.balances.evmNetwork === "eip155:8453";
  const failed =
    outcome !== null && outcome !== "opening" && outcome.kind === "refused";

  const addFunds = async (): Promise<void> => {
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
    <div className="flex flex-col gap-2">
      <Button
        className="min-h-11 self-start px-4"
        disabled={outcome === "opening"}
        onClick={() => {
          if (canFund) {
            void addFunds();
          } else {
            setExplained(true);
          }
        }}
      >
        <PlusIcon data-icon="inline-start" />
        {outcome === "opening" ? "Opening…" : "Add funds"}
      </Button>
      {canFund ? (
        <output
          className="text-muted-foreground text-xs"
          role={failed ? "alert" : undefined}
        >
          {outcomeWords(outcome)}
        </output>
      ) : null}
      <AddFundsExplained
        onOpenChange={setExplained}
        open={explained}
        wallet={wallet}
      />
    </div>
  );
};
