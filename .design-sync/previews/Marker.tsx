import { Marker, MarkerContent, MarkerIcon } from "@froggy/ui";
import { CheckIcon, ClockIcon } from "lucide-react";

export const Default = () => (
  <div className="w-96">
    <Marker>
      <MarkerIcon>
        <CheckIcon />
      </MarkerIcon>
      <MarkerContent>Allowed by daily-cap · $0.48 · 14:02</MarkerContent>
    </Marker>
  </div>
);

export const SeparatorVariant = () => (
  <div className="w-96">
    <Marker variant="separator">
      <MarkerContent>Today</MarkerContent>
    </Marker>
  </div>
);

export const BorderVariant = () => (
  <div className="w-96">
    <Marker variant="border">
      <MarkerIcon>
        <ClockIcon />
      </MarkerIcon>
      <MarkerContent>Waiting on you since 14:06</MarkerContent>
    </Marker>
  </div>
);

export const InTimeline = () => (
  <div className="flex w-96 flex-col gap-3">
    <Marker variant="separator">
      <MarkerContent>Yesterday</MarkerContent>
    </Marker>
    <Marker>
      <MarkerIcon>
        <CheckIcon />
      </MarkerIcon>
      <MarkerContent>Allowed $1.20 for IPFS pinning</MarkerContent>
    </Marker>
    <Marker>
      <MarkerIcon>
        <CheckIcon />
      </MarkerIcon>
      <MarkerContent>Allowed $4.00 for a price oracle poll</MarkerContent>
    </Marker>
    <Marker variant="separator">
      <MarkerContent>Today</MarkerContent>
    </Marker>
    <Marker>
      <MarkerIcon>
        <ClockIcon />
      </MarkerIcon>
      <MarkerContent>Asked about $12.40 for a Graph query</MarkerContent>
    </Marker>
  </div>
);
