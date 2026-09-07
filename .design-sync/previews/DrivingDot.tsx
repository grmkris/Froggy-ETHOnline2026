import { DrivingDot } from "@froggy/ui";

export const Modes = () => (
  <div className="flex flex-col gap-2 text-sm">
    <div className="flex items-center gap-2">
      <DrivingDot mode="agent" />
      <span>Agent is driving</span>
    </div>
    <div className="flex items-center gap-2">
      <DrivingDot mode="human" />
      <span>You have the page</span>
    </div>
    <div className="flex items-center gap-2">
      <DrivingDot mode="idle" />
      <span className="text-muted-foreground">Nobody driving</span>
    </div>
  </div>
);
