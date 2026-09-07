import { Skeleton } from "@froggy/ui";

export const TextLines = () => (
  <div className="flex w-80 flex-col gap-3">
    <Skeleton className="h-4 w-40" />
    <Skeleton className="h-4 w-64" />
    <Skeleton className="h-4 w-24" />
  </div>
);

export const ReceiptPlaceholder = () => (
  <div className="bg-card ring-foreground/10 flex w-80 flex-col gap-3 rounded-xl p-4 ring-1">
    <div className="flex items-center gap-3">
      <Skeleton className="size-8 rounded-full" />
      <div className="flex flex-1 flex-col gap-1.5">
        <Skeleton className="h-3.5 w-28" />
        <Skeleton className="h-3 w-20" />
      </div>
      <Skeleton className="h-6 w-16 rounded-full" />
    </div>
    <Skeleton className="h-3 w-full" />
    <Skeleton className="h-3 w-4/5" />
  </div>
);
