import { Button } from "@froggy/ui";
import { ArrowRightIcon, CheckIcon, PlusIcon, TrashIcon } from "lucide-react";

export const Variants = () => (
  <div className="flex flex-wrap items-center gap-2">
    <Button>Approve spend</Button>
    <Button variant="secondary">Ask again</Button>
    <Button variant="outline">Review rule</Button>
    <Button variant="ghost">Dismiss</Button>
    <Button variant="destructive">Stop agent</Button>
    <Button variant="link">What is a receipt?</Button>
  </div>
);

export const Sizes = () => (
  <div className="flex flex-wrap items-center gap-2">
    <Button size="xs">Extra small</Button>
    <Button size="sm">Small</Button>
    <Button size="default">Default</Button>
    <Button size="lg">Large</Button>
  </div>
);

export const WithIcons = () => (
  <div className="flex flex-wrap items-center gap-2">
    <Button>
      <PlusIcon data-icon="inline-start" />
      Connect agent
    </Button>
    <Button variant="outline">
      Open receipt
      <ArrowRightIcon data-icon="inline-end" />
    </Button>
    <Button variant="secondary">
      <CheckIcon data-icon="inline-start" />
      Allowed once
    </Button>
  </div>
);

export const IconOnly = () => (
  <div className="flex flex-wrap items-center gap-2">
    <Button aria-label="Add" size="icon-xs" variant="outline">
      <PlusIcon />
    </Button>
    <Button aria-label="Add" size="icon-sm" variant="outline">
      <PlusIcon />
    </Button>
    <Button aria-label="Add" size="icon" variant="outline">
      <PlusIcon />
    </Button>
    <Button aria-label="Delete" size="icon-lg" variant="destructive">
      <TrashIcon />
    </Button>
  </div>
);

export const Disabled = () => (
  <div className="flex flex-wrap items-center gap-2">
    <Button disabled>Approve spend</Button>
    <Button disabled variant="outline">
      Review rule
    </Button>
    <Button disabled variant="destructive">
      Stop agent
    </Button>
  </div>
);
