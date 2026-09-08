import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@froggy/ui/components/card";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@froggy/ui/components/toggle-group";
import { useId } from "react";
import type { ReactElement } from "react";

import { useTheme } from "../../lib/theme";

export const AppearanceSettings = (): ReactElement => {
  const { theme, setTheme } = useTheme();
  const descriptionId = useId();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
        <CardDescription id={descriptionId}>
          Passbook is light. Lilypad is dark. System follows your device. Your
          choice is saved in this browser.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ToggleGroup
          aria-describedby={descriptionId}
          aria-label="Appearance"
          className="w-full flex-wrap"
          onValueChange={(values) => {
            setTheme(values[0]);
          }}
          value={[theme]}
          variant="outline"
        >
          <ToggleGroupItem className="flex-1" value="passbook">
            Passbook
          </ToggleGroupItem>
          <ToggleGroupItem className="flex-1" value="lilypad">
            Lilypad
          </ToggleGroupItem>
          <ToggleGroupItem className="flex-1" value="system">
            System
          </ToggleGroupItem>
        </ToggleGroup>
      </CardContent>
    </Card>
  );
};
