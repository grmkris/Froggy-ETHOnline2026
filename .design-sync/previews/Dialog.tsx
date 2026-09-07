import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@froggy/ui";

export const Open = () => (
  <Dialog open>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Approve this spend?</DialogTitle>
        <DialogDescription>
          The research agent wants $12.40 in USDC for a Graph query
          subscription. That is over your $10.00 ask-first line.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>Deny</DialogClose>
        <Button>Allow once</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

export const WithoutFooter = () => (
  <Dialog open>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Receipt #4821</DialogTitle>
        <DialogDescription>
          $0.48 for RPC credits, allowed by <code>daily-cap</code> at 14:02.
        </DialogDescription>
      </DialogHeader>
      <p className="text-machine text-muted-foreground text-xs">
        hedera 0.0.4821@1757 · hcs #1204 · snapshot 9f2c41ab
      </p>
    </DialogContent>
  </Dialog>
);
