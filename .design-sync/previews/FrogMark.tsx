import { FrogMark } from "@froggy/ui";

export const Sizes = () => (
  <div className="flex items-end gap-4">
    <FrogMark className="size-4" />
    <FrogMark className="size-6" />
    <FrogMark className="size-8" />
    <FrogMark className="size-12" />
  </div>
);

export const InLockup = () => (
  <div className="flex items-center gap-2">
    <FrogMark className="size-7" />
    <span className="font-display text-lg leading-none font-semibold">
      Froggy
    </span>
  </div>
);

export const OnPaper = () => (
  <div className="bg-paper-deep flex items-center gap-3 rounded-xl p-4">
    <FrogMark className="size-8" />
    <div>
      <div className="text-sm font-medium">A wallet your agent can use</div>
      <div className="text-muted-foreground text-sm">
        and you can still answer for.
      </div>
    </div>
  </div>
);
