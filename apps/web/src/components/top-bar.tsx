/** Wallet navigation, spending status and who owns browser input. */

import type { Mandate } from "@froggy/domain";
import type { ServiceModes, WalletSummary } from "@froggy/protocol";
import { Badge } from "@froggy/ui/components/badge";
import { Button } from "@froggy/ui/components/button";
import { DRIVE_LABEL, DrivingDot } from "@froggy/ui/components/driving-ring";
import type { DriveMode } from "@froggy/ui/components/driving-ring";
import { FrogMark } from "@froggy/ui/components/frog-mark";
import { GlobeIcon, SlidersHorizontalIcon, WalletIcon } from "lucide-react";

import { bindingWindowCap } from "../lib/app-state";
import { useIdentity } from "../lib/privy";
import { LeashMeter } from "./leash-meter";

interface TopBarProps {
  readonly connected: boolean;
  readonly drive: DriveMode;
  readonly mandate: Mandate | null;
  readonly modes: ServiceModes | null;
  readonly onOpenDetails: () => void;
  readonly onOpenWallet: () => void;
  readonly onShowBrowser: () => void;
  readonly wallet: WalletSummary | null;
}

const stubsOf = (modes: ServiceModes | null): readonly string[] =>
  modes === null
    ? []
    : Object.entries(modes)
        .filter(([, mode]) => mode === "stub")
        .map(([name]) => name);

const Driving = ({
  drive,
}: {
  readonly drive: DriveMode;
}): React.ReactElement => (
  <span
    aria-live="polite"
    className="flex items-center gap-1.5 text-xs whitespace-nowrap"
  >
    <DrivingDot mode={drive} />
    {DRIVE_LABEL[drive]}
  </span>
);

/** The small print: reconnecting, a local identity, how much is stubbed. */
const Flags = ({
  connected,
  stubbed,
  stubs,
}: {
  readonly connected: boolean;
  readonly stubbed: boolean;
  readonly stubs: readonly string[];
}): React.ReactElement => (
  <>
    {connected ? null : (
      <Badge className="text-[10px]" variant="secondary">
        reconnecting…
      </Badge>
    )}
    {stubbed ? (
      <Badge
        className="border-drive-agent text-[10px] uppercase"
        variant="outline"
      >
        local identity
      </Badge>
    ) : null}
    {stubs.length > 0 ? (
      <Badge
        className="border-drive-agent/60 text-drive-agent shrink-0 text-[10px] whitespace-nowrap"
        title={`Stubbed: ${stubs.join(", ")}. Nothing here is a real settlement.`}
        variant="outline"
      >
        {stubs.length} stub{stubs.length === 1 ? "" : "s"}
      </Badge>
    ) : null}
  </>
);

export const TopBar = ({
  connected,
  drive,
  mandate,
  modes,
  onOpenDetails,
  onOpenWallet,
  onShowBrowser,
  wallet,
}: TopBarProps): React.ReactElement => {
  const identity = useIdentity();
  return (
    <header className="bg-background sticky top-0 z-30 border-b">
      <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 py-2 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="bg-brand-soft grid size-9 place-items-center rounded-xl">
              <FrogMark className="size-7" />
            </span>
            <span className="font-display font-semibold">Froggy</span>
          </div>
          <div className="hidden sm:block">
            <Driving drive={drive} />
          </div>
          <div className="flex items-center gap-1">
            <Button
              aria-label="Open wallet"
              className="min-h-11 min-w-11"
              onClick={onOpenWallet}
              variant="ghost"
            >
              <WalletIcon />
              <span className="hidden sm:inline">Wallet</span>
            </Button>
            <Button
              aria-label="Show the browser"
              className="size-11"
              onClick={onShowBrowser}
              size="icon"
              variant="ghost"
            >
              <GlobeIcon />
            </Button>
            <Button
              aria-label="Details"
              className="size-11"
              onClick={onOpenDetails}
              size="icon"
              variant="ghost"
            >
              <SlidersHorizontalIcon />
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="w-full min-w-0 sm:w-auto sm:max-w-xs sm:flex-1">
            <LeashMeter
              cap={bindingWindowCap(mandate)}
              ledgerNote={wallet?.ledgerNote ?? null}
              spentUsdMicros={wallet?.windowSpentUsdMicros ?? null}
            />
          </div>
          <div className="sm:hidden">
            <Driving drive={drive} />
          </div>
          <div className="flex flex-wrap gap-1">
            <Flags
              connected={connected}
              stubbed={identity.stubbed}
              stubs={stubsOf(modes)}
            />
          </div>
        </div>
      </div>
    </header>
  );
};
