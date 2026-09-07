import { Separator } from "@froggy/ui";

export const Horizontal = () => (
  <div className="w-80">
    <div className="text-sm font-medium">Spending rules</div>
    <p className="text-muted-foreground text-sm">Three active, one paused.</p>
    <Separator className="my-3" />
    <p className="text-muted-foreground text-sm">
      Last changed 2 days ago by you.
    </p>
  </div>
);

export const Vertical = () => (
  <div className="flex h-6 items-center gap-3 text-sm">
    <span>hedera-testnet</span>
    <Separator orientation="vertical" />
    <span>USDC</span>
    <Separator orientation="vertical" />
    <span className="text-muted-foreground">4 receipts</span>
  </div>
);
