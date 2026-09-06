import type { ServiceModes } from "@froggy/protocol";
import { Button } from "@froggy/ui/components/button";
import { ArrowUpRightIcon } from "lucide-react";
import type { ReactElement } from "react";

interface EmptyStateProps {
  readonly disabled: boolean;
  readonly modes: ServiceModes | null;
  readonly onSend: (text: string) => void;
}

export const EmptyState = ({
  disabled,
  modes,
  onSend,
}: EmptyStateProps): ReactElement => (
  <section
    aria-label="Use Froggy here"
    className="flex flex-col gap-3 px-1 py-2"
  >
    <div>
      <h2 className="font-display text-xl font-semibold">
        Or, try a task here
      </h2>
      <p className="text-muted-foreground mt-1 text-sm">
        Follow the work in a shared browser. Every payment leaves a receipt.
      </p>
    </div>
    <Button
      className="h-auto min-h-11 justify-between gap-3 px-4 py-3 text-left whitespace-normal"
      disabled={disabled}
      onClick={() => {
        onSend("Buy the lending snapshot and tell me what it says.");
      }}
      variant="outline"
    >
      Buy the lending snapshot{" "}
      <ArrowUpRightIcon className="shrink-0" data-icon="inline-end" />
    </Button>
    <p className="text-muted-foreground text-xs">
      Paid tasks use your task credit and spending limits.
      {modes?.model === "stub"
        ? " This build uses a simulated agent and marks its receipts."
        : ""}
    </p>
  </section>
);
