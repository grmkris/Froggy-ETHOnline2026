import { SheetHeader } from "@froggy/ui";

export const Default = () => (
  <div className="bg-popover ring-foreground/10 w-80 rounded-xl ring-1">
    <SheetHeader>
      <div className="text-foreground text-base font-medium">Receipt #4821</div>
      <div className="text-muted-foreground text-sm">
        $0.48 in USDC for RPC credits, allowed by daily-cap.
      </div>
    </SheetHeader>
  </div>
);
