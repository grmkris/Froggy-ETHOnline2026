import { TicketBody } from "@froggy/ui";

export const Default = () => (
  <div className="ticket bg-card w-96">
    <TicketBody>
      <div className="flex items-baseline gap-2">
        <span className="text-money text-2xl leading-none">$0.48</span>
        <span className="text-muted-foreground text-xs">USDC · 14:02</span>
      </div>
      <p className="text-muted-foreground mt-1.5 text-sm">
        RPC credits, so the agent could read the chain it was asked about.
      </p>
    </TicketBody>
  </div>
);
