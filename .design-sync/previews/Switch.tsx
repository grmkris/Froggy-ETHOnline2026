import { Label, Switch } from "@froggy/ui";

export const Sizes = () => (
  <div className="flex items-center gap-4">
    <Switch defaultChecked size="sm" />
    <Switch defaultChecked size="default" />
  </div>
);

export const States = () => (
  <div className="flex flex-col gap-3">
    <div className="flex items-center gap-2">
      <Switch defaultChecked />
      <span className="text-sm">On</span>
    </div>
    <div className="flex items-center gap-2">
      <Switch />
      <span className="text-sm">Off</span>
    </div>
    <div className="flex items-center gap-2">
      <Switch defaultChecked disabled />
      <span className="text-muted-foreground text-sm">
        On, locked by policy
      </span>
    </div>
  </div>
);

export const InSettingsRow = () => (
  <div className="flex w-80 flex-col gap-4">
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <Label htmlFor="s1">Pause the agent overnight</Label>
        <p className="text-muted-foreground mt-0.5 text-sm">
          No spends between 22:00 and 07:00.
        </p>
      </div>
      <Switch defaultChecked id="s1" />
    </div>
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <Label htmlFor="s2">Notify me on every receipt</Label>
        <p className="text-muted-foreground mt-0.5 text-sm">
          Otherwise only refusals reach you.
        </p>
      </div>
      <Switch id="s2" />
    </div>
  </div>
);
