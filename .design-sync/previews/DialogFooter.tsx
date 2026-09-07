import { Button, DialogFooter } from "@froggy/ui";

export const Default = () => (
  <div className="bg-popover ring-foreground/10 w-80 rounded-xl p-4 ring-1">
    <p className="mb-4 text-sm">Approve $12.40 for a Graph query?</p>
    <DialogFooter>
      <Button variant="outline">Deny</Button>
      <Button>Allow once</Button>
    </DialogFooter>
  </div>
);
