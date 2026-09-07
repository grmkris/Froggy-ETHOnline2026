import { Badge, Button, ChromeBar, DrivingDot } from "@froggy/ui";
import { RotateCwIcon, XIcon } from "lucide-react";

export const Default = () => (
  <div className="bg-card ring-foreground/10 w-96 overflow-hidden rounded-xl ring-1">
    <ChromeBar
      address={
        <span className="text-machine truncate text-xs">
          https://app.uniswap.org/swap
        </span>
      }
      leading={<DrivingDot mode="agent" />}
      trailing={
        <Button aria-label="Reload" size="icon-xs" variant="ghost">
          <RotateCwIcon />
        </Button>
      }
    />
    <div className="text-muted-foreground grid h-24 place-items-center text-sm">
      page
    </div>
  </div>
);

export const AddressOnly = () => (
  <div className="bg-card ring-foreground/10 w-96 overflow-hidden rounded-xl ring-1">
    <ChromeBar
      address={
        <span className="text-machine truncate text-xs">about:blank</span>
      }
    />
  </div>
);

export const Busy = () => (
  <div className="bg-card ring-foreground/10 w-96 overflow-hidden rounded-xl ring-1">
    <ChromeBar
      address={
        <span className="text-machine truncate text-xs">
          https://thegraph.com/explorer
        </span>
      }
      leading={<DrivingDot mode="human" />}
      trailing={
        <>
          <Badge variant="secondary">You</Badge>
          <Button aria-label="Close" size="icon-xs" variant="ghost">
            <XIcon />
          </Button>
        </>
      }
    />
    <div className="text-muted-foreground grid h-24 place-items-center text-sm">
      page
    </div>
  </div>
);
