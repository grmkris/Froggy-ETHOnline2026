import {
  Button,
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@froggy/ui";

export const FromRight = () => (
  <Sheet open>
    <SheetContent side="right">
      <SheetHeader>
        <SheetTitle>Receipt #4821</SheetTitle>
        <SheetDescription>
          $0.48 in USDC for RPC credits, allowed by daily-cap.
        </SheetDescription>
      </SheetHeader>
      <div className="px-4 text-sm">
        <p className="text-muted-foreground">
          The agent needed to read the pool you asked about. The spend was under
          your daily cap, so it went through and filed itself here.
        </p>
        <p className="text-machine text-muted-foreground mt-3 text-xs">
          hedera 0.0.4821@1757 · hcs #1204
        </p>
      </div>
      <SheetFooter>
        <SheetClose render={<Button variant="outline" />}>Close</SheetClose>
      </SheetFooter>
    </SheetContent>
  </Sheet>
);

export const FromBottom = () => (
  <Sheet open>
    <SheetContent side="bottom">
      <SheetHeader>
        <SheetTitle>Spending rules</SheetTitle>
        <SheetDescription>
          Three active. These decide what happens without you.
        </SheetDescription>
      </SheetHeader>
      <SheetFooter>
        <Button size="sm">Add a rule</Button>
      </SheetFooter>
    </SheetContent>
  </Sheet>
);
