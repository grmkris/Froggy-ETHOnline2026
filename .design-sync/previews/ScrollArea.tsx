import { ScrollArea, Separator } from "@froggy/ui";

const RECEIPTS = [
  ["$0.48", "RPC credits", "allowed"],
  ["$12.40", "Graph query subscription", "asked"],
  ["$32.10", "Bulk index backfill", "refused"],
  ["$1.20", "IPFS pinning", "allowed"],
  ["$4.00", "Price oracle poll", "allowed"],
  ["$0.90", "RPC credits", "allowed"],
  ["$18.75", "Archive node hour", "asked"],
  ["$2.30", "Gas top-up", "allowed"],
];

export const Vertical = () => (
  <ScrollArea className="ring-foreground/10 h-48 w-80 rounded-xl ring-1">
    <div className="p-3">
      {RECEIPTS.map(([amount, what, state], i) => (
        <div key={what + String(i)}>
          {i > 0 && <Separator className="my-2" />}
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-money">{amount}</span>
            <span className="text-muted-foreground min-w-0 flex-1 truncate">
              {what}
            </span>
            <span className="text-muted-foreground text-xs">{state}</span>
          </div>
        </div>
      ))}
    </div>
  </ScrollArea>
);

export const ShortContent = () => (
  <ScrollArea className="ring-foreground/10 h-32 w-80 rounded-xl ring-1">
    <div className="p-3 text-sm">
      <p className="font-medium">Nothing to scroll</p>
      <p className="text-muted-foreground mt-1">
        The scrollbar only appears when the content overflows.
      </p>
    </div>
  </ScrollArea>
);
