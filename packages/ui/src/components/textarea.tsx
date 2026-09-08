import { cn } from "cn";
import * as React from "react";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 disabled:bg-input/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 bg-muted shadow-inset ring-border/50 flex field-sizing-content min-h-16 w-full rounded-lg px-2.5 py-2 text-[16px] ring-1 transition-colors outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-3 motion-reduce:transition-none md:text-sm",
        className
      )}
      {...props}
    />
  );
}

export { Textarea };
