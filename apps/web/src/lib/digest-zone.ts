import type { DigestSchedule } from "@froggy/domain";

export interface DigestZone {
  readonly display: string;
  readonly save: string;
  readonly saved: boolean;
}

/**
 * The zone the digest already fires in, or this browser's zone as the
 * suggestion to save when none is on yet.
 */
export const digestZone = (
  schedule: DigestSchedule | undefined,
  browserZone: string
): DigestZone => {
  if (schedule !== undefined && schedule.hour !== null) {
    return {
      display: schedule.timezone,
      save: schedule.timezone,
      saved: true,
    };
  }
  return { display: browserZone, save: browserZone, saved: false };
};
