import { formatUsd } from "@froggy/domain";
import type { Mandate } from "@froggy/domain";
import type { WalletSummary } from "@froggy/protocol";
import { Button } from "@froggy/ui/components/button";
import { Input } from "@froggy/ui/components/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@froggy/ui/components/sheet";
import { useRef, useState } from "react";
import type { ReactElement } from "react";

import { capsLine, networkWords } from "../../lib/mandate-words";
import { useIdentity } from "../../lib/privy";
import type { FundOutcome } from "../../lib/privy";
import { walletAmounts } from "../../lib/wallet-view";

interface FundingPanelProps {
  readonly busy: boolean;
  readonly connected: boolean;
  readonly mandate: Mandate | null;
  readonly onOpenChange: (open: boolean) => void;
  readonly onTopUp: (amountUsd: number) => void;
  readonly open: boolean;
  readonly wallet: WalletSummary | null;
}

type FundingOutcome = FundOutcome | "opening" | null;

const outcomeWords = (outcome: FundingOutcome): string => {
  if (outcome === "opening") {
    return "Opening funding options…";
  }
  if (outcome === null) {
    return "Card or Apple Pay through Privy, where available. Funds arrive as USDC on Base.";
  }
  if (outcome.kind === "refused") {
    return `Funding could not finish: ${outcome.reason}`;
  }
  return "Submitted to the provider. Check your wallet balance before adding task credit; funds may still be on their way.";
};

const unavailableWords = (
  stubbed: boolean,
  wallet: WalletSummary | null
): string => {
  if (stubbed) {
    return "This is a local identity. Adding real funds needs a Privy sign-in.";
  }
  if (wallet?.balances.evmNetwork !== "eip155:8453") {
    return "Card funding deposits USDC on Base mainnet. It cannot fund this wallet's configured network.";
  }
  return "A wallet is needed before you can add funds.";
};

const AddWalletFunds = ({
  funds,
  wallet,
}: {
  readonly funds: number | null;
  readonly wallet: WalletSummary | null;
}): ReactElement => {
  const identity = useIdentity();
  const [outcome, setOutcome] = useState<FundingOutcome>(null);
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
    <section className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold">1. Add wallet funds</h3>
      <p className="text-money text-2xl">
        {funds === null ? "Balance unavailable" : formatUsd(funds)}
      </p>
      {canFund ? (
        <Button
          className="min-h-11 self-start"
          disabled={outcome === "opening"}
          onClick={() => {
            void addFunds();
          }}
        >
          {outcome === "opening" ? "Opening…" : "Add funds"}
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

const amountDetails = (
  draft: string,
  funds: number | null,
  wallet: WalletSummary | null
) => {
  const amountUsd = Number(draft);
  const valid =
    /^\d+(?:\.\d{1,6})?$/u.test(draft) &&
    Number.isFinite(amountUsd) &&
    amountUsd > 0 &&
    Number.isSafeInteger(Math.round(amountUsd * 1_000_000));
  const insufficient =
    valid && funds !== null && Math.round(amountUsd * 1_000_000) > funds;
  const network =
    wallet === null
      ? "your configured network"
      : networkWords(wallet.balances.evmNetwork);
  let help = `${draft} USDC on ${network} requests the same dollar amount in task credit.`;
  if (!valid) {
    help = "Enter a positive amount, with up to six decimal places.";
  } else if (insufficient) {
    help = "This amount is more than your known wallet funds.";
  }
  return { amountUsd, help, insufficient, valid };
};

const RequestedCredit = ({
  busy,
  onAcknowledge,
  onOpenChange,
}: {
  readonly busy: boolean;
  readonly onAcknowledge: () => void;
  readonly onOpenChange: (open: boolean) => void;
}): ReactElement => (
  <div className="bg-brand-soft flex flex-col gap-2 rounded-xl p-3">
    <output className="text-sm font-medium">Top-up requested</output>
    <p className="text-xs">
      Follow the task and its receipt to see the outcome. A request is not a
      confirmed transfer.
    </p>
    <Button
      className="min-h-11 self-start"
      onClick={() => {
        onOpenChange(false);
      }}
      type="button"
      variant="outline"
    >
      View task
    </Button>
    {busy ? null : (
      <Button
        className="min-h-11 self-start"
        onClick={onAcknowledge}
        type="button"
        variant="ghost"
      >
        I checked the outcome
      </Button>
    )}
  </div>
);

const TaskCreditForm = ({
  busy,
  connected,
  credit,
  funds,
  mandate,
  onOpenChange,
  onTopUp,
  wallet,
}: Omit<FundingPanelProps, "open"> & {
  readonly credit: number | null;
  readonly funds: number | null;
}): ReactElement => {
  const [draft, setDraft] = useState("1.00");
  const [requested, setRequested] = useState(false);
  const [failed, setFailed] = useState(false);
  const submitting = useRef(false);
  const { amountUsd, help, insufficient, valid } = amountDetails(
    draft,
    funds,
    wallet
  );
  const disabled =
    !valid || insufficient || busy || !connected || mandate === null;

  const requestCredit = (): void => {
    if (disabled || requested || submitting.current) {
      return;
    }
    submitting.current = true;
    setFailed(false);
    try {
      onTopUp(amountUsd);
      setRequested(true);
    } catch {
      submitting.current = false;
      setFailed(true);
    }
  };

  return (
    <section className="flex flex-col gap-3 border-t pt-5">
      <h3 className="text-sm font-semibold">2. Add task credit</h3>
      <p className="text-muted-foreground text-xs">
        Current task credit:{" "}
        {credit === null ? "unavailable" : formatUsd(credit)}. A top-up sends
        USDC from your wallet to fund tasks under your spending limits.
      </p>
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          requestCredit();
        }}
      >
        <label className="text-sm font-medium" htmlFor="task-credit-amount">
          Amount in USDC
        </label>
        <Input
          aria-describedby="task-credit-help"
          className="min-h-11"
          disabled={requested}
          id="task-credit-amount"
          inputMode="decimal"
          onChange={(event) => {
            setDraft(event.target.value);
          }}
          value={draft}
        />
        <p className="text-muted-foreground text-xs" id="task-credit-help">
          {help}
        </p>
        <p className="text-muted-foreground text-xs">
          {mandate === null
            ? "Loading spending limits…"
            : (capsLine(mandate) ?? "Your spending rules still apply.")}
        </p>
        {failed ? (
          <p className="text-refused text-xs" role="alert">
            Couldn’t request task credit. Check the task before trying again.
          </p>
        ) : null}
        {requested ? (
          <RequestedCredit
            busy={busy}
            onAcknowledge={() => {
              submitting.current = false;
              setRequested(false);
            }}
            onOpenChange={onOpenChange}
          />
        ) : (
          <Button className="min-h-11" disabled={disabled} type="submit">
            {busy ? "Wait for the current task" : "Request task credit"}
          </Button>
        )}
      </form>
    </section>
  );
};

export const FundingPanel = ({
  busy,
  connected,
  mandate,
  onOpenChange,
  onTopUp,
  open,
  wallet,
}: FundingPanelProps): ReactElement => {
  const { funds, credit } = walletAmounts(wallet);
  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent
        className="w-full overflow-y-auto sm:max-w-md"
        keepMounted
        side="right"
      >
        <SheetHeader className="pr-14">
          <SheetTitle className="font-display text-xl">
            Fund your next task
          </SheetTitle>
          <SheetDescription>
            Add funds to your wallet, then choose how much to make available as
            task credit.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-6 px-4 pb-6">
          <AddWalletFunds funds={funds} wallet={wallet} />
          <TaskCreditForm
            busy={busy}
            connected={connected}
            credit={credit}
            funds={funds}
            mandate={mandate}
            onOpenChange={onOpenChange}
            onTopUp={onTopUp}
            wallet={wallet}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
};
