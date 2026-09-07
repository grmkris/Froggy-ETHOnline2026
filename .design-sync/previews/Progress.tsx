import {
  Progress,
  ProgressIndicator,
  ProgressLabel,
  ProgressTrack,
  ProgressValue,
} from "@froggy/ui";

export const Default = () => (
  <div className="w-80">
    <Progress value={62} />
  </div>
);

export const WithLabel = () => (
  <div className="w-80">
    <Progress value={19}>
      <ProgressLabel>Daily cap used</ProgressLabel>
      <ProgressValue />
      <ProgressTrack>
        <ProgressIndicator />
      </ProgressTrack>
    </Progress>
  </div>
);

export const Steps = () => (
  <div className="flex w-80 flex-col gap-5">
    <Progress value={12}>
      <ProgressLabel>Just started</ProgressLabel>
      <ProgressValue />
      <ProgressTrack>
        <ProgressIndicator />
      </ProgressTrack>
    </Progress>
    <Progress value={56}>
      <ProgressLabel>Halfway</ProgressLabel>
      <ProgressValue />
      <ProgressTrack>
        <ProgressIndicator />
      </ProgressTrack>
    </Progress>
    <Progress value={100}>
      <ProgressLabel>Cap reached</ProgressLabel>
      <ProgressValue />
      <ProgressTrack>
        <ProgressIndicator />
      </ProgressTrack>
    </Progress>
  </div>
);
