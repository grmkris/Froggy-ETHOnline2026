import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@froggy/ui";
import { ChevronDownIcon } from "lucide-react";

export const Open = () => (
  <Collapsible className="w-96" defaultOpen>
    <CollapsibleTrigger render={<Button size="sm" variant="ghost" />}>
      <ChevronDownIcon data-icon="inline-start" />
      Why was this refused?
    </CollapsibleTrigger>
    <CollapsibleContent>
      <p className="text-muted-foreground px-2.5 pt-2 text-sm">
        $32.10 would have taken today past the $25.00 daily cap. The rule
        <code className="text-machine mx-1">daily-cap</code>
        stopped it before the transaction was signed.
      </p>
    </CollapsibleContent>
  </Collapsible>
);

export const Closed = () => (
  <Collapsible className="w-96">
    <CollapsibleTrigger render={<Button size="sm" variant="ghost" />}>
      <ChevronDownIcon data-icon="inline-start" />
      Show the machine facts
    </CollapsibleTrigger>
    <CollapsibleContent>
      <p className="text-machine text-muted-foreground px-2.5 pt-2 text-xs">
        tx 0.0.4821@1757… · hcs #1204 · snapshot 9f2c41ab
      </p>
    </CollapsibleContent>
  </Collapsible>
);
