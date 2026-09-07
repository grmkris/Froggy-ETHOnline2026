import { AlertDialogFooter, Button } from "@froggy/ui";

export const Default = () => (
  <div className="bg-popover ring-foreground/10 w-80 rounded-xl p-4 ring-1">
    <p className="mb-4 text-sm">Stop the agent?</p>
    <AlertDialogFooter>
      <Button variant="outline">Keep going</Button>
      <Button variant="destructive">Stop it</Button>
    </AlertDialogFooter>
  </div>
);
