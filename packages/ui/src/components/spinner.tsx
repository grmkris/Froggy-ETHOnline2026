import { cn } from "cn";
import { Loader2Icon } from "lucide-react";

/**
 * A spinner is a status, so it is an `<output>`: assistive tech announces it
 * as one without a `role`, and the label says what is being waited for.
 */
function Spinner({
  className,
  label = "Loading",
  ...props
}: React.ComponentProps<"output"> & { label?: string }) {
  return (
    <output
      data-slot="spinner"
      aria-label={label}
      className={cn("inline-flex", className)}
      {...props}
    >
      <Loader2Icon aria-hidden className="size-4 motion-safe:animate-spin" />
    </output>
  );
}

export { Spinner };
