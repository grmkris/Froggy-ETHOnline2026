import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";
import { cn } from "cn";
import type { ComponentProps } from "react";

/**
 * A ticket: the body says what and why, the stub carries the machine facts.
 *
 * The perforation between them is the point. A receipt that reads as one
 * block of text hides the difference between the sentence a person needs and
 * the identifiers an auditor needs; tearing them apart on the page keeps both
 * without making either shout.
 */
const ticketVariants = cva("ticket overflow-hidden", {
  defaultVariants: { tone: "default" },
  variants: {
    tone: {
      asking:
        "shadow-float bg-[color-mix(in_oklch,var(--card),var(--drive-agent-soft)_70%)]",
      default: "",
      muted: "opacity-80",
      refused: "bg-[color-mix(in_oklch,var(--card),var(--refused-soft)_55%)]",
    },
  },
});

function Ticket({
  className,
  tone,
  ...props
}: ComponentProps<"article"> & VariantProps<typeof ticketVariants>) {
  return (
    <article
      className={cn(ticketVariants({ tone }), className)}
      data-slot="ticket"
      {...props}
    />
  );
}

function TicketBody({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("px-4 pt-3.5 pb-3", className)}
      data-slot="ticket-body"
      {...props}
    />
  );
}

function TicketPerforation({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      aria-hidden="true"
      className={cn("ticket-perforation", className)}
      data-slot="ticket-perforation"
      {...props}
    />
  );
}

function TicketStub({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "text-machine bg-paper-deep/70 text-muted-foreground px-4 py-2.5",
        className
      )}
      data-slot="ticket-stub"
      {...props}
    />
  );
}

export { Ticket, TicketBody, TicketPerforation, TicketStub, ticketVariants };
