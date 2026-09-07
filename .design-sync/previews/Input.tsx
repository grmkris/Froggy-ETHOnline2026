import { Input } from "@froggy/ui";

export const Default = () => (
  <div className="flex w-80 flex-col gap-3">
    <Input defaultValue="0.4801 USDC" />
    <Input placeholder="Paste an agent connection URL" />
  </div>
);

export const States = () => (
  <div className="flex w-80 flex-col gap-3">
    <Input defaultValue="daily-cap" />
    <Input disabled defaultValue="Locked by policy" />
    <Input aria-invalid defaultValue="not-a-url" />
  </div>
);

export const Types = () => (
  <div className="flex w-80 flex-col gap-3">
    <Input placeholder="you@example.com" type="email" />
    <Input defaultValue="25.00" type="number" />
    <Input placeholder="Search receipts" type="search" />
  </div>
);
