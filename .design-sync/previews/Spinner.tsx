import { Button, Spinner } from "@froggy/ui";

export const Default = () => (
  <div className="flex items-center gap-3">
    <Spinner />
    <span className="text-muted-foreground text-sm">Asking the agent…</span>
  </div>
);

export const InButton = () => (
  <div className="flex flex-wrap items-center gap-2">
    <Button disabled>
      <Spinner label="Submitting" />
      Approving…
    </Button>
    <Button disabled variant="outline">
      <Spinner label="Loading receipts" />
      Loading receipts
    </Button>
  </div>
);

export const Sizes = () => (
  <div className="flex items-center gap-4">
    <Spinner className="[&_svg]:size-3" label="Small" />
    <Spinner label="Default" />
    <Spinner className="[&_svg]:size-6" label="Large" />
  </div>
);
