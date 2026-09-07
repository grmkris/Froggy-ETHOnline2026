/** One chip per integration: live or stubbed, said out loud. */

import type { ServiceModes } from "@froggy/protocol";
import { Badge } from "@froggy/ui/components/badge";
import type { ReactElement } from "react";

export const IntegrationBadges = ({
  modes,
  stubbed,
}: {
  readonly modes: ServiceModes | null;
  readonly stubbed: boolean;
}): ReactElement => (
  <div className="flex flex-wrap gap-1">
    {stubbed ? (
      <Badge className="border-drive-agent uppercase" variant="outline">
        local identity
      </Badge>
    ) : null}
    {Object.entries(modes ?? {}).map(([name, mode]) => (
      <Badge
        className={
          mode === "stub"
            ? "border-drive-agent/60 text-drive-agent"
            : "border-brand/40 text-brand"
        }
        key={name}
        variant="outline"
      >
        {name}: {mode}
      </Badge>
    ))}
  </div>
);
