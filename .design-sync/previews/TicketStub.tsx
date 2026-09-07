import { TicketStub } from "@froggy/ui";

export const Default = () => (
  <div className="ticket bg-card w-96">
    <TicketStub className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
      <span className="inline-flex items-baseline gap-1.5">
        <span className="opacity-60">rule</span>
        <span className="text-foreground/80">daily-cap</span>
      </span>
      <span className="inline-flex items-baseline gap-1.5">
        <span className="opacity-60">hedera</span>
        <span className="text-foreground/80">0.0.4821@1757</span>
      </span>
      <span className="inline-flex items-baseline gap-1.5">
        <span className="opacity-60">hcs</span>
        <span className="text-foreground/80">#1204</span>
      </span>
    </TicketStub>
  </div>
);
