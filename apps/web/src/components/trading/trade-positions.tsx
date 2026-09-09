import type { TradePosition } from "@froggy/protocol";
import { Badge } from "@froggy/ui/components/badge";
import { Button } from "@froggy/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@froggy/ui/components/card";
import { FieldError } from "@froggy/ui/components/field";
import type { ReactElement } from "react";

import type { TradesApi } from "../../hooks/use-trades";

const quantity = (units: string | null, decimals: number): string => {
  if (units === null) {
    return "Unknown";
  }
  if (decimals === 0) {
    return units;
  }
  const padded = units.padStart(decimals + 1, "0");
  const fraction = padded.slice(-decimals).replace(/0+$/u, "");
  return fraction === ""
    ? padded.slice(0, -decimals)
    : `${padded.slice(0, -decimals)}.${fraction}`;
};

const PositionCard = ({
  position,
  onWithdraw,
}: {
  readonly position: TradePosition;
  readonly onWithdraw: (position: TradePosition) => void;
}): ReactElement => (
  <div className="border-border flex min-w-0 flex-col gap-3 rounded-lg border p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="font-medium">{position.symbol ?? "Unnamed asset"}</p>
      <Badge variant="outline">{position.kind}</Badge>
    </div>
    <p className="text-muted-foreground font-mono text-xs break-all">
      {position.asset}
    </p>
    <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
      <dt className="text-muted-foreground">Balance</dt>
      <dd className="text-right break-all">
        {quantity(position.units, position.decimals)}
      </dd>
      <dt className="text-muted-foreground">Reserved</dt>
      <dd className="text-right break-all">
        {quantity(position.reservedUnits, position.decimals)}
      </dd>
      <dt className="text-muted-foreground">Available</dt>
      <dd className="text-right break-all">
        {quantity(position.availableUnits, position.decimals)}
      </dd>
    </dl>
    {position.kind === "vault" ? (
      <>
        <p className="text-sm break-all">
          Redeemable shares:{" "}
          {quantity(position.withdrawableShares, position.decimals)}
        </p>
        <Button
          type="button"
          variant="outline"
          disabled={
            position.withdrawableShares === null ||
            position.withdrawableShares === "0"
          }
          onClick={() => {
            onWithdraw(position);
          }}
        >
          Prepare withdrawal
        </Button>
      </>
    ) : null}
    {position.limitation === null ? null : (
      <p className="text-muted-foreground text-xs">{position.limitation}</p>
    )}
  </div>
);

export const TradePositionsPanel = ({
  api,
  onWithdraw,
}: {
  readonly api: TradesApi;
  readonly onWithdraw: (position: TradePosition) => void;
}): ReactElement => (
  <Card>
    <CardHeader>
      <CardTitle>Balances & vault positions</CardTitle>
      <CardDescription>
        Ethereum inventory, reserved funds and withdrawal previews.
      </CardDescription>
    </CardHeader>
    <CardContent className="flex flex-col gap-4">
      <Button
        type="button"
        variant="outline"
        disabled={!api.enabled || api.positions.isPending}
        onClick={() => {
          api.positions.mutate();
        }}
      >
        {api.positions.isPending ? "Reading balances…" : "Refresh positions"}
      </Button>
      {api.positions.isError ? (
        <FieldError>{api.positions.error.message}</FieldError>
      ) : null}
      {api.positions.data === undefined ? null : (
        <>
          <p className="text-muted-foreground text-xs">
            {api.positions.data.stubbed
              ? "Simulated · no wallet funds"
              : `Observed at block ${api.positions.data.block}`}
          </p>
          <div className="grid min-w-0 gap-3 md:grid-cols-2">
            {api.positions.data.positions.map((position) => (
              <PositionCard
                key={position.asset}
                position={position}
                onWithdraw={onWithdraw}
              />
            ))}
          </div>
          {api.positions.data.truncated ? (
            <p className="text-muted-foreground text-xs">
              Showing a bounded inventory of up to 20 tokens. Additional assets
              may exist.
            </p>
          ) : null}
        </>
      )}
    </CardContent>
  </Card>
);
