import { ChromeBar, DrivingDot, DrivingRing } from "@froggy/ui";

const Page = ({ label }: { readonly label: string }) => (
  <div className="text-muted-foreground grid h-24 place-items-center text-sm">
    {label}
  </div>
);

export const Modes = () => (
  <div className="flex flex-col gap-4">
    <DrivingRing
      className="bg-card shadow-card w-80 overflow-hidden"
      mode="agent"
    >
      <ChromeBar
        address={<span className="text-machine text-xs">app.uniswap.org</span>}
        leading={<DrivingDot mode="agent" />}
      />
      <Page label="Agent is driving" />
    </DrivingRing>
    <DrivingRing
      className="bg-card shadow-card w-80 overflow-hidden"
      mode="human"
    >
      <ChromeBar
        address={<span className="text-machine text-xs">app.uniswap.org</span>}
        leading={<DrivingDot mode="human" />}
      />
      <Page label="You have the page" />
    </DrivingRing>
    <DrivingRing
      className="bg-card shadow-card w-80 overflow-hidden"
      mode="idle"
    >
      <ChromeBar
        address={<span className="text-machine text-xs">about:blank</span>}
        leading={<DrivingDot mode="idle" />}
      />
      <Page label="Nobody driving" />
    </DrivingRing>
  </div>
);

export const Bare = () => (
  <div className="flex items-center gap-4">
    <DrivingRing className="bg-card size-16 rounded-xl" mode="agent" />
    <DrivingRing className="bg-card size-16 rounded-xl" mode="human" />
    <DrivingRing className="bg-card size-16 rounded-xl" mode="idle" />
  </div>
);
