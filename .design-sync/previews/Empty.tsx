import {
  Button,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@froggy/ui";
import { InboxIcon, PlugIcon } from "lucide-react";

export const Default = () => (
  <Empty className="w-96 border">
    <EmptyHeader>
      <EmptyMedia variant="icon">
        <InboxIcon />
      </EmptyMedia>
      <EmptyTitle>No receipts yet</EmptyTitle>
      <EmptyDescription>
        Every spend the agent makes will show up here, with the rule that
        allowed it.
      </EmptyDescription>
    </EmptyHeader>
  </Empty>
);

export const WithAction = () => (
  <Empty className="w-96 border">
    <EmptyHeader>
      <EmptyMedia variant="icon">
        <PlugIcon />
      </EmptyMedia>
      <EmptyTitle>No agents connected</EmptyTitle>
      <EmptyDescription>
        Connect an agent to give it a wallet it can spend from, under rules you
        set.
      </EmptyDescription>
    </EmptyHeader>
    <EmptyContent>
      <Button size="sm">Connect an agent</Button>
      <Button size="sm" variant="ghost">
        How does this work?
      </Button>
    </EmptyContent>
  </Empty>
);

export const Plain = () => (
  <Empty className="w-96 border">
    <EmptyHeader>
      <EmptyTitle>Nothing refused today</EmptyTitle>
      <EmptyDescription>A quiet day is the product working.</EmptyDescription>
    </EmptyHeader>
  </Empty>
);
