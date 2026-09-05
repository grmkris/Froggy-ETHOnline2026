/**
 * The leash, as a number and a bar.
 *
 * "Spent so far" against the binding rolling cap, so the figure on screen is
 * the one the policy engine is actually using. A ledger that cannot be read
 * turns the bar amber and says so: a wallet reporting nothing spent because
 * the database is unreachable looks exactly like one with a full allowance.
 */

import { formatUsd } from "@froggy/domain";
import {
  Progress,
  ProgressIndicator,
  ProgressTrack,
} from "@froggy/ui/components/progress";

interface LeashMeterProps {
  readonly cap: {
    readonly maxUsdMicros: number;
    readonly windowMs: number;
  } | null;
  readonly frozen: boolean;
  readonly ledgerNote: string | null;
  readonly spentUsdMicros: number | null;
}

const HOUR_MS = 3_600_000;

const windowLabel = (windowMs: number): string => {
  const hours = Math.round(windowMs / HOUR_MS);
  return hours === 24 ? "today" : `per ${hours}h`;
};

const indicatorClass = (frozen: boolean, unreadable: boolean): string => {
  if (frozen) {
    return "bg-drive-frozen";
  }
  return unreadable ? "bg-drive-agent" : "bg-primary";
};

export const LeashMeter = ({
  cap,
  frozen,
  ledgerNote,
  spentUsdMicros,
}: LeashMeterProps): React.ReactElement => {
  const spent = spentUsdMicros ?? 0;
  const max = cap?.maxUsdMicros ?? 0;
  const value = max > 0 ? Math.min(100, (spent / max) * 100) : 0;
  const unreadable = ledgerNote !== null;
  return (
    <div
      aria-label="Spending against the rolling cap"
      className="flex min-w-0 flex-col gap-1"
      title={ledgerNote ?? undefined}
    >
      <div className="flex items-baseline gap-1.5 whitespace-nowrap">
        <span className="text-money text-base leading-none">
          {spentUsdMicros === null ? "—" : formatUsd(spent)}
        </span>
        <span className="text-muted-foreground text-xs">
          {cap === null
            ? "no cap"
            : `of ${formatUsd(cap.maxUsdMicros)} ${windowLabel(cap.windowMs)}`}
        </span>
        {unreadable ? (
          <span className="text-drive-agent text-xs font-medium">
            history unavailable
          </span>
        ) : null}
      </div>
      <Progress className="w-full" value={value}>
        <ProgressTrack className="bg-paper-deep h-1.5 w-full">
          <ProgressIndicator className={indicatorClass(frozen, unreadable)} />
        </ProgressTrack>
      </Progress>
    </div>
  );
};
