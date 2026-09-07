import { Badge } from "@froggy/ui";
import { CheckIcon, ClockIcon, XIcon } from "lucide-react";

export const Variants = () => (
  <div className="flex flex-wrap items-center gap-2">
    <Badge>Allowed</Badge>
    <Badge variant="secondary">Session</Badge>
    <Badge variant="outline">hedera-testnet</Badge>
    <Badge variant="destructive">Refused</Badge>
    <Badge variant="ghost">Draft</Badge>
    <Badge variant="link">View rule</Badge>
  </div>
);

export const WithIcons = () => (
  <div className="flex flex-wrap items-center gap-2">
    <Badge>
      <CheckIcon data-icon="inline-start" />
      Settled
    </Badge>
    <Badge variant="destructive">
      <XIcon data-icon="inline-start" />
      Over cap
    </Badge>
    <Badge variant="outline">
      <ClockIcon data-icon="inline-start" />
      Waiting on you
    </Badge>
  </div>
);

export const AsLink = () => (
  <div className="flex flex-wrap items-center gap-2">
    <Badge
      render={<a aria-label="Receipt 4821" href="#receipt" />}
      variant="secondary"
    >
      Receipt #4821
    </Badge>
    <Badge
      render={<a aria-label="Rule: daily cap" href="#rule" />}
      variant="outline"
    >
      rule: daily-cap
    </Badge>
  </div>
);
