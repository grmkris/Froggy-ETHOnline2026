import { Kbd, KbdGroup } from "@froggy/ui";

export const Shortcuts = () => (
  <div className="flex flex-col gap-3">
    <div className="flex items-center justify-between gap-6 text-sm">
      <span>Command menu</span>
      <KbdGroup>
        <Kbd>⌘</Kbd>
        <Kbd>K</Kbd>
      </KbdGroup>
    </div>
    <div className="flex items-center justify-between gap-6 text-sm">
      <span>Stop the agent</span>
      <KbdGroup>
        <Kbd>⌘</Kbd>
        <Kbd>⇧</Kbd>
        <Kbd>.</Kbd>
      </KbdGroup>
    </div>
    <div className="flex items-center justify-between gap-6 text-sm">
      <span>Approve the pending spend</span>
      <KbdGroup>
        <Kbd>⌘</Kbd>
        <Kbd>Enter</Kbd>
      </KbdGroup>
    </div>
  </div>
);
