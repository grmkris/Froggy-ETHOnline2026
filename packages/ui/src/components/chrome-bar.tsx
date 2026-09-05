import { cn } from "cn";
import type { ComponentProps, ReactNode } from "react";

/**
 * The strip above a live page: who is driving, where it is, what you can do.
 *
 * Layout only. The product decides what goes in the three slots; this keeps
 * them in the same places on every surface that shows a page.
 */
function ChromeBar({
  address,
  className,
  leading,
  trailing,
  ...props
}: Omit<ComponentProps<"div">, "children"> & {
  readonly address: ReactNode;
  readonly leading?: ReactNode;
  readonly trailing?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "bg-card/80 flex items-center gap-2 border-b px-2.5 py-2 backdrop-blur-sm",
        className
      )}
      data-slot="chrome-bar"
      {...props}
    >
      <div className="flex shrink-0 items-center gap-1.5">{leading}</div>
      <div className="min-w-0 flex-1">{address}</div>
      <div className="flex shrink-0 items-center gap-1">{trailing}</div>
    </div>
  );
}

export { ChromeBar };
