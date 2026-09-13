import { Button } from "@froggy/ui/components/button";
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@froggy/ui/components/field";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@froggy/ui/components/popover";
import { Switch } from "@froggy/ui/components/switch";
import { GlobeIcon, SlidersHorizontalIcon } from "lucide-react";
import { useState } from "react";
import type { ReactElement } from "react";

import { useChatSurface } from "../../lib/chat-context";

export const ConversationOptions = (): ReactElement => {
  const [open, setOpen] = useState(false);
  const { crossThreadHistory, setCrossThreadHistory, showBrowser } =
    useChatSurface();
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            aria-label="Conversation options"
            className="min-h-11"
            variant="ghost"
            size="sm"
          />
        }
      >
        <SlidersHorizontalIcon aria-hidden />
        {crossThreadHistory ? "Other chats on" : "Options"}
      </PopoverTrigger>
      <PopoverContent align="start" className="flex flex-col gap-4">
        <Field orientation="horizontal">
          <Switch
            id="history-scope"
            checked={crossThreadHistory}
            onCheckedChange={setCrossThreadHistory}
          />
          <FieldLabel htmlFor="history-scope">Search my other chats</FieldLabel>
        </Field>
        <FieldDescription>
          Let Froggy use your other conversations for this request.
        </FieldDescription>
        <Button
          variant="outline"
          onClick={() => {
            showBrowser();
            setOpen(false);
          }}
        >
          <GlobeIcon aria-hidden />
          Show the browser
        </Button>
      </PopoverContent>
    </Popover>
  );
};
