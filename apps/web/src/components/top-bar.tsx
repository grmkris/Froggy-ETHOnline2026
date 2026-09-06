/**
 * The header strip: the wallet, the leash, who is driving, the kill switch.
 *
 * Everything a nervous person glances at lives on one line so it is never
 * scrolled away. When the wallet is frozen the whole strip greys, because a
 * frozen wallet that still looks lively is the kind of half-signal that gets
 * a second click.
 */

import { formatUsd } from "@froggy/domain";
import type { Mandate } from "@froggy/domain";
import type { ServiceModes, WalletSummary } from "@froggy/protocol";
import { Badge } from "@froggy/ui/components/badge";
import { Button } from "@froggy/ui/components/button";
import { DRIVE_LABEL, DrivingDot } from "@froggy/ui/components/driving-ring";
import type { DriveMode } from "@froggy/ui/components/driving-ring";
import { FrogMark } from "@froggy/ui/components/frog-mark";
import { cn } from "@froggy/ui/lib/utils";
import { GlobeIcon, SlidersHorizontalIcon } from "lucide-react";

import { bindingWindowCap } from "../lib/app-state";
import { shortAddress } from "../lib/format";
import { useIdentity } from "../lib/privy";
import { FreezeButton } from "./freeze-button";
import { LeashMeter } from "./leash-meter";

interface TopBarProps {
  readonly connected: boolean;
  readonly drive: DriveMode;
  readonly mandate: Mandate | null;
  readonly modes: ServiceModes | null;
  readonly onFreeze: (frozen: boolean) => void;
  readonly onOpenDetails: () => void;
  readonly onShowBrowser: () => void;
  readonly wallet: WalletSummary | null;
}

const stubsOf = (modes: ServiceModes | null): readonly string[] =>
  modes === null
    ? []
    : Object.entries(modes)
        .filter(([, mode]) => mode === "stub")
        .map(([name]) => name);

export const TopBar = ({
  connected,
  drive,
  mandate,
  modes,
  onFreeze,
  onOpenDetails,
  onShowBrowser,
  wallet,
}: TopBarProps): React.ReactElement => {
  const identity = useIdentity();
  const frozen = mandate?.frozen ?? false;
  const stubs = stubsOf(modes);
  return (
    <header
      className={cn(
        "bg-background/80 sticky top-0 z-30 border-b backdrop-blur-md transition-colors",
        frozen && "bg-drive-frozen-soft/80 saturate-50"
      )}
    >
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="bg-primary shadow-card grid size-8 place-items-center rounded-xl">
            <FrogMark className="size-6" />
          </span>
          <span className="font-display hidden text-base font-semibold sm:inline">
            Froggy
          </span>
        </div>

        <div className="hidden min-w-0 flex-1 items-center gap-4 overflow-hidden md:flex">
          <div className="max-w-xs min-w-[11rem] flex-1">
            <LeashMeter
              cap={bindingWindowCap(mandate)}
              frozen={frozen}
              ledgerNote={wallet?.ledgerNote ?? null}
              spentUsdMicros={wallet?.windowSpentUsdMicros ?? null}
            />
          </div>
          <span
            className="text-machine text-muted-foreground hidden whitespace-nowrap lg:inline"
            title={wallet?.address ?? undefined}
          >
            {shortAddress(wallet?.address ?? null)}
          </span>
          {wallet?.pocketUsdMicros === null ||
          wallet?.pocketUsdMicros === undefined ? null : (
            <span
              className="flex items-baseline gap-1 text-xs whitespace-nowrap"
              title="What is left in the Hedera pocket the paid requests are drawn from. A top-up adds to it; a freeze zeroes it."
            >
              <span className="text-muted-foreground">pocket</span>
              <span className="text-money text-sm leading-none">
                {formatUsd(wallet.pocketUsdMicros)}
              </span>
            </span>
          )}
          <span
            aria-live="polite"
            className="flex items-center gap-1.5 text-xs whitespace-nowrap"
          >
            <DrivingDot mode={drive} />
            {DRIVE_LABEL[drive]}
          </span>
          {connected ? null : (
            <Badge className="text-[10px]" variant="secondary">
              reconnecting…
            </Badge>
          )}
          {identity.stubbed ? (
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
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <FreezeButton frozen={frozen} onFreeze={onFreeze} />
          <Button
            aria-label="Show the browser"
            onClick={onShowBrowser}
            size="icon-sm"
            title="Show the browser"
            variant="ghost"
          >
            <GlobeIcon />
          </Button>
          <Button
            aria-label="Details"
            onClick={onOpenDetails}
            size="icon-sm"
            variant="ghost"
          >
            <SlidersHorizontalIcon />
          </Button>
        </div>
      </div>
    </header>
  );
};
