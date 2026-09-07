import { Textarea } from "@froggy/ui";

export const Default = () => (
  <div className="w-80">
    <Textarea defaultValue="Buy the cheapest RPC credits that cover this week, but never spend more than $25 without asking me first." />
  </div>
);

export const States = () => (
  <div className="flex w-80 flex-col gap-3">
    <Textarea placeholder="Tell the agent what it may spend on…" />
    <Textarea
      disabled
      defaultValue="This policy is managed by your workspace."
    />
    <Textarea aria-invalid defaultValue="Missing a spending cap." />
  </div>
);
