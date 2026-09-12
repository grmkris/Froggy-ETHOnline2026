/** Which integrations are running as stubs, for the loud-stub markers. */

import type { ServiceModes } from "@froggy/protocol";

export const stubsOf = (modes: ServiceModes | null): readonly string[] =>
  modes === null
    ? []
    : Object.entries(modes)
        .filter(([, mode]) => mode === "stub")
        .map(([name]) => name);
