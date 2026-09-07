import {
  Button,
  Kbd,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@froggy/ui";
import { InfoIcon } from "lucide-react";

export const Open = () => (
  <TooltipProvider>
    <div className="grid h-32 place-items-center">
      <Tooltip open>
        <TooltipTrigger render={<Button variant="outline" />}>
          Daily cap
        </TooltipTrigger>
        <TooltipContent side="top">
          The most the agent may spend in a day without asking.
        </TooltipContent>
      </Tooltip>
    </div>
  </TooltipProvider>
);

export const WithShortcut = () => (
  <TooltipProvider>
    <div className="grid h-32 place-items-center">
      <Tooltip open>
        <TooltipTrigger
          render={<Button aria-label="About" size="icon-sm" variant="ghost" />}
        >
          <InfoIcon />
        </TooltipTrigger>
        <TooltipContent side="bottom">
          Stop the agent
          <Kbd>⌘</Kbd>
          <Kbd>⇧</Kbd>
          <Kbd>.</Kbd>
        </TooltipContent>
      </Tooltip>
    </div>
  </TooltipProvider>
);
