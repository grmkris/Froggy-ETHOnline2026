/**
 * The Graph's answer, laid out.
 *
 * The winner in the display face — the rate is the answer, so it is set like
 * money — then who came next, then every index that was asked and whether it
 * answered. "3 of 4 fresh" is the fact a person deciding whether to trust the
 * number needs, and a fixture says so where the number is.
 */

import type { GraphQueryOutput } from "@froggy/protocol";
import { cn } from "@froggy/ui/lib/utils";
import type { ReactElement } from "react";

import { compactUsd } from "../../lib/format";
import { MorphText } from "../morph-text";

const STATUS_TONE: Record<
  GraphQueryOutput["deployments"][number]["status"],
  string
> = {
  fresh: "text-brand",
  stale: "text-drive-agent-foreground",
  unavailable: "text-muted-foreground",
};

export const GraphSummary = ({
  graph,
}: {
  readonly graph: GraphQueryOutput;
}): ReactElement => {
  const [best, ...rest] = graph.markets;
  return (
    <div className="space-y-2 px-3 pb-3 pl-9">
      {best === undefined ? (
        <p className="text-sm font-medium">No usable markets.</p>
      ) : (
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <MorphText className="text-money text-xl leading-none">
            {best.borrowApr.toFixed(2)}%
          </MorphText>
          <span className="text-sm font-medium">
            {best.name} on {best.chain}
          </span>
          <span className="text-muted-foreground text-xs">
            {compactUsd(best.totalBorrowUsd)} borrowed · block{" "}
            {best.blockNumber}
          </span>
        </div>
      )}
      {rest.length === 0 ? null : (
        <p className="text-muted-foreground text-xs">
          Next:{" "}
          {rest
            .map(
              (market) =>
                `${market.name} on ${market.chain} ${market.borrowApr.toFixed(2)}%`
            )
            .join(", ")}
        </p>
      )}
      <p className="text-muted-foreground text-xs">
        {graph.fresh} of {graph.total} indexes fresh
        {graph.stubbed ? (
          <span className="text-drive-agent-foreground">
            {" "}
            · recorded fixture, not a live index
          </span>
        ) : null}
      </p>
      <table className="text-machine w-full">
        <tbody>
          {graph.deployments.map((deployment) => (
            <tr className="[&>td]:py-2.5 [&>td]:pr-3" key={deployment.id}>
              <td className="text-foreground/80">{deployment.label}</td>
              <td className="text-muted-foreground">{deployment.chain}</td>
              <td className="text-muted-foreground tabular-nums">
                {deployment.blockNumber ?? "—"}
              </td>
              <td className={cn(STATUS_TONE[deployment.status])}>
                {deployment.status}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
