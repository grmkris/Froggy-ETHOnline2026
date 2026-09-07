import {
  Badge,
  Ticket,
  TicketBody,
  TicketPerforation,
  TicketStub,
} from "@froggy/ui";

const Stub = ({ children }: { readonly children: React.ReactNode }) => (
  <TicketStub className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
    {children}
  </TicketStub>
);

const Line = ({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) => (
  <span className="inline-flex items-baseline gap-1.5">
    <span className="opacity-60">{label}</span>
    <span className="text-foreground/80">{value}</span>
  </span>
);

export const Allowed = () => (
  <Ticket className="w-96">
    <TicketBody>
      <div className="flex items-baseline gap-2">
        <span className="text-money text-2xl leading-none">$0.48</span>
        <span className="text-muted-foreground text-xs">USDC · 14:02</span>
      </div>
      <p className="text-muted-foreground mt-1.5 text-sm">
        RPC credits, so the agent could read the chain it was asked about.
      </p>
    </TicketBody>
    <TicketPerforation />
    <Stub>
      <Line label="rule" value="daily-cap" />
      <Line label="hedera" value="0.0.4821@1757" />
      <Line label="hcs" value="#1204" />
    </Stub>
  </Ticket>
);

export const Asking = () => (
  <Ticket className="w-96" tone="asking">
    <TicketBody>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-baseline gap-2">
            <span className="text-money text-2xl leading-none">$12.40</span>
            <span className="text-muted-foreground text-xs">USDC</span>
          </div>
          <p className="text-muted-foreground mt-1.5 text-sm">
            A Graph query subscription. Over your $10.00 ask-first line.
          </p>
        </div>
        <Badge variant="secondary">Waiting on you</Badge>
      </div>
    </TicketBody>
    <TicketPerforation />
    <Stub>
      <Line label="rule" value="ask-above" />
      <Line label="asked" value="14:06" />
    </Stub>
  </Ticket>
);

export const Refused = () => (
  <Ticket className="w-96" tone="refused">
    <TicketBody>
      <div className="flex items-baseline gap-2">
        <span className="text-money text-2xl leading-none">$32.10</span>
        <span className="text-muted-foreground text-xs">USDC · 15:41</span>
      </div>
      <p className="text-muted-foreground mt-1.5 text-sm">
        A bulk index backfill. It would have taken today past the $25.00 cap, so
        nothing was signed.
      </p>
    </TicketBody>
    <TicketPerforation />
    <Stub>
      <Line label="code" value="over_daily_cap" />
      <Line label="rule" value="daily-cap" />
      <Line label="hcs" value="#1207" />
    </Stub>
  </Ticket>
);

export const Muted = () => (
  <Ticket className="w-96" tone="muted">
    <TicketBody>
      <div className="flex items-baseline gap-2">
        <span className="text-money text-2xl leading-none">$1.20</span>
        <span className="text-muted-foreground text-xs">USDC · yesterday</span>
      </div>
      <p className="text-muted-foreground mt-1.5 text-sm">IPFS pinning.</p>
    </TicketBody>
    <TicketPerforation />
    <Stub>
      <Line label="rule" value="daily-cap" />
    </Stub>
  </Ticket>
);
