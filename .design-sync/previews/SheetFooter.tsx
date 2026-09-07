import { Button, SheetFooter } from "@froggy/ui";

export const Default = () => (
  <div className="bg-popover ring-foreground/10 flex h-40 w-80 flex-col rounded-xl ring-1">
    <div className="text-muted-foreground p-4 text-sm">
      The panel body sits above; the footer is pushed to the bottom.
    </div>
    <SheetFooter>
      <Button variant="outline">Close</Button>
    </SheetFooter>
  </div>
);
