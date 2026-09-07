import { Kbd } from "@froggy/ui";

export const Keys = () => (
  <div className="flex flex-wrap items-center gap-2">
    <Kbd>⌘</Kbd>
    <Kbd>K</Kbd>
    <Kbd>Esc</Kbd>
    <Kbd>Enter</Kbd>
  </div>
);

export const InSentence = () => (
  <p className="text-muted-foreground text-sm">
    Press <Kbd>⌘</Kbd> <Kbd>K</Kbd> to jump to a receipt, or <Kbd>Esc</Kbd> to
    close.
  </p>
);
