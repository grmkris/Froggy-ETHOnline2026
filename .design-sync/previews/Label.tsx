import { Input, Label, Switch } from "@froggy/ui";

export const WithInput = () => (
  <div className="flex w-80 flex-col gap-2">
    <Label htmlFor="cap">Daily spending cap</Label>
    <Input defaultValue="$25.00" id="cap" />
  </div>
);

export const WithControl = () => (
  <div className="flex w-80 items-center gap-2">
    <Switch defaultChecked id="ask" />
    <Label htmlFor="ask">Ask before every spend over the cap</Label>
  </div>
);
