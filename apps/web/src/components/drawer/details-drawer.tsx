/**
 * The details: the policy, the history, the plumbing.
 *
 * A drawer rather than a pane, because none of this needs to be on screen
 * while the agent works — it needs to be one gesture away when someone asks
 * "wait, what exactly is it allowed to do?"
 */

import { formatUsd } from "@froggy/domain";
import type { Mandate, Receipt } from "@froggy/domain";
import type { ServiceModes, WalletSummary } from "@froggy/protocol";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@froggy/ui/components/alert-dialog";
import { Badge } from "@froggy/ui/components/badge";
import { Button } from "@froggy/ui/components/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@froggy/ui/components/sheet";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@froggy/ui/components/tabs";
import type { ReactElement } from "react";

import { shortAddress } from "../../lib/format";
import { useIdentity } from "../../lib/privy";
import { ReceiptTicket } from "../cards/receipt-ticket";
import { DigestSettings } from "./digest-settings";
import { MandateEditor } from "./mandate-editor";
import { TelegramSettings } from "./telegram-settings";

interface DetailsDrawerProps {
  readonly mandate: Mandate | null;
  readonly modes: ServiceModes | null;
  readonly onDeleteData: () => void;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSaveMandate: (mandate: Mandate) => void;
  readonly open: boolean;
  readonly receipts: readonly Receipt[];
  readonly sessionId: string | null;
  readonly wallet: WalletSummary | null;
}

const HOUR_MS = 3_600_000;

const ruleLabel = (rule: Mandate["rules"][number]): string => {
  switch (rule._tag) {
    case "per_tx_cap": {
      return `${formatUsd(rule.maxUsdMicros)} per transaction`;
    }
    case "window_cap": {
      return `${formatUsd(rule.maxUsdMicros)} per ${Math.round(rule.windowMs / HOUR_MS)}h`;
    }
    case "payee_allowlist": {
      return `${rule.payeeIds.length} allowed payee${rule.payeeIds.length === 1 ? "" : "s"}`;
    }
    case "host_allowlist": {
      return `paid hosts: ${rule.hosts.join(", ") || "none"}`;
    }
    case "network_allowlist": {
      return `chains: ${rule.networks.join(", ")}`;
    }
    case "expiry": {
      return `expires ${new Date(rule.notAfter).toLocaleTimeString()}`;
    }
    case "approval_threshold": {
      return `ask above ${formatUsd(rule.overUsdMicros)}`;
    }
    case "ask_exemption": {
      return `pre-approved: ${rule.payeeId} up to ${formatUsd(rule.maxUsdMicros)}`;
    }
    default: {
      return "unknown rule";
    }
  }
};

const SIGNER_WORDS: Record<WalletSummary["agentSigner"], string> = {
  absent: "the agent has no signer",
  granted: "the agent may sign under policy",
  pending: "asking Privy for the agent's signer…",
};

const Policy = ({
  mandate,
  onSave,
}: {
  readonly mandate: Mandate | null;
  readonly onSave: (mandate: Mandate) => void;
}): ReactElement => (
  <div className="space-y-4">
    <ul className="space-y-1.5">
      {(mandate?.rules ?? []).map((rule) => (
        <li className="flex items-baseline gap-2 text-sm" key={rule.id}>
          <span className="text-brand">·</span>
          <span className="flex-1">{ruleLabel(rule)}</span>
          <span className="text-machine text-muted-foreground">
            {rule.id.slice(0, 12)}
          </span>
        </li>
      ))}
      {mandate?.frozen === true ? (
        <li className="bg-drive-frozen-soft rounded-xl p-3 text-sm">
          Frozen. Nothing is allowed until you unfreeze it from the header.
        </li>
      ) : null}
    </ul>
    {mandate === null ? null : (
      <details className="rounded-xl border p-3">
        <summary className="cursor-pointer text-sm font-medium select-none">
          Edit the mandate
        </summary>
        <div className="pt-3">
          <MandateEditor mandate={mandate} onSave={onSave} />
        </div>
      </details>
    )}
  </div>
);

const DeleteData = ({
  onConfirm,
}: {
  readonly onConfirm: () => void;
}): ReactElement => (
  <AlertDialog>
    <AlertDialogTrigger
      render={
        <Button size="sm" variant="destructive">
          Delete my data
        </Button>
      }
    />
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>
          Delete everything Froggy holds for you?
        </AlertDialogTitle>
        <AlertDialogDescription>
          Your mandate, your receipts and your browser profile are removed and
          any running turn is stopped. Payments that already settled stay in the
          ledger, because money that moved is not a preference.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Keep it</AlertDialogCancel>
        <AlertDialogAction onClick={onConfirm}>Delete</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);

const About = ({
  modes,
  onDeleteData,
  sessionId,
  wallet,
}: {
  readonly modes: ServiceModes | null;
  readonly onDeleteData: () => void;
  readonly sessionId: string | null;
  readonly wallet: WalletSummary | null;
}): ReactElement => {
  const identity = useIdentity();
  return (
    <div className="space-y-4 text-sm">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
        <dt className="text-muted-foreground">Wallet</dt>
        <dd className="text-machine">{wallet?.address ?? "—"}</dd>
        <dt className="text-muted-foreground">Signer</dt>
        <dd className="text-machine">
          {shortAddress(wallet?.signerAddress ?? null)}
        </dd>
        <dt className="text-muted-foreground">Agent</dt>
        <dd>{wallet === null ? "—" : SIGNER_WORDS[wallet.agentSigner]}</dd>
        <dt className="text-muted-foreground">Session</dt>
        <dd className="text-machine">{sessionId ?? "—"}</dd>
      </dl>
      {wallet?.agentNote === null || wallet?.agentNote === undefined ? null : (
        <p className="text-muted-foreground text-xs">{wallet.agentNote}</p>
      )}
      <div className="flex flex-wrap gap-1">
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
      <DigestSettings />
      <TelegramSettings configured={modes?.telegram === "live"} />
      <div className="flex flex-wrap gap-2 pt-2">
        {identity.stubbed ? null : (
          <Button
            onClick={() => {
              identity.logout();
            }}
            size="sm"
            variant="outline"
          >
            Sign out
          </Button>
        )}
        <DeleteData onConfirm={onDeleteData} />
      </div>
    </div>
  );
};

export const DetailsDrawer = ({
  mandate,
  modes,
  onDeleteData,
  onOpenChange,
  onSaveMandate,
  open,
  receipts,
  sessionId,
  wallet,
}: DetailsDrawerProps): ReactElement => (
  <Sheet onOpenChange={onOpenChange} open={open}>
    <SheetContent className="w-full overflow-y-auto sm:max-w-md" side="right">
      <SheetHeader>
        <SheetTitle className="font-display">Details</SheetTitle>
        <SheetDescription>
          What the agent may do, what it has done, and where the money is.
        </SheetDescription>
      </SheetHeader>
      <Tabs className="px-4 pb-6" defaultValue="policy">
        <TabsList className="w-full">
          <TabsTrigger value="policy">Policy</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="about">Wallet</TabsTrigger>
        </TabsList>
        <TabsContent className="pt-4" value="policy">
          <Policy mandate={mandate} onSave={onSaveMandate} />
        </TabsContent>
        <TabsContent className="space-y-2 pt-4" value="history">
          {receipts.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Nothing spent or refused yet.
            </p>
          ) : (
            receipts.map((receipt) => (
              <ReceiptTicket compact key={receipt.id} receipt={receipt} />
            ))
          )}
        </TabsContent>
        <TabsContent className="pt-4" value="about">
          <About
            modes={modes}
            onDeleteData={onDeleteData}
            sessionId={sessionId}
            wallet={wallet}
          />
        </TabsContent>
      </Tabs>
    </SheetContent>
  </Sheet>
);
