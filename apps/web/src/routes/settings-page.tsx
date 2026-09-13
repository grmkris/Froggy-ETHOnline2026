/**
 * The account, as five short tabs on one route: the leash first, then what
 * Froggy does alone, the address, the card, and the way out. `?tab=` names
 * the open one, so a link can point at a section; the old `#section` links
 * still arrive, as a tab.
 */

import { Button, buttonVariants } from "@froggy/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@froggy/ui/components/card";
import { Tabs, TabsList, TabsTrigger } from "@froggy/ui/components/tabs";
import {
  Link,
  useLocation,
  useNavigate,
  useSearch,
} from "@tanstack/react-router";
import { Schema } from "effect";
import { useEffect } from "react";
import type { ReactElement } from "react";

import { EmailAccount } from "../components/email/email-account";
import { Page } from "../components/nav/page";
import { AppearanceSettings } from "../components/settings/appearance-settings";
import { ConnectionDetails } from "../components/settings/connection-details";
import { DeleteData } from "../components/settings/delete-data";
import { DigestSettings } from "../components/settings/digest-settings";
import { DirectoryPanel } from "../components/settings/directory-panel";
import { PaymentMethodsPanel } from "../components/settings/payment-methods";
import { ScheduleList } from "../components/settings/schedule-list";
import { TradingControls } from "../components/settings/trading-controls";
import { usePaymentMethods } from "../hooks/use-card-checkouts";
import { useIdentity } from "../lib/privy";
import { useWorkspace } from "../lib/workspace-context";

const AccountTab = Schema.Literals([
  "spending",
  "routines",
  "email",
  "payments",
  "account",
]);
type AccountTab = typeof AccountTab.Type;
const isTab = Schema.is(AccountTab);

const LABEL: Record<AccountTab, string> = {
  account: "Account",
  email: "Email",
  payments: "Payments",
  routines: "Routines",
  spending: "Spending",
};

const INTRO: Record<AccountTab, string> = {
  account: "How Froggy looks, and how to sign out or start over.",
  email: "One address, chosen once, for whenever Froggy needs an email.",
  payments: "A saved card for purchases. Every one still needs your approval.",
  routines:
    "What Froggy does without being asked: the daily digest, and anything you told it to do later.",
  spending: "What your agent may pay on its own, and where it has to ask.",
};

/** Where the links that predate the tabs land. */
const HASH_TABS = new Map<string, AccountTab>([
  ["account", "account"],
  ["appearance", "account"],
  ["email", "email"],
  ["payment-methods", "payments"],
  ["routines", "routines"],
  ["spending", "spending"],
]);

const SpendingTab = (): ReactElement => {
  const { app, webMcp } = useWorkspace();
  return (
    <section aria-label="Spending controls" className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Your agent’s allowance</CardTitle>
          <CardDescription>
            The rules the agent is held to when it pays. Anything above them, it
            asks you first.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ConnectionDetails
            sessionId={app.sessionId}
            wallet={app.wallet}
            webMcp={webMcp}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Trading</CardTitle>
          <CardDescription>
            Every trade is prepared, simulated and approved by you one step at a
            time. Stop blocks new signatures at once.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TradingControls />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Sites Froggy can pay</CardTitle>
          <CardDescription>
            A site becomes payable only once it is on this list. Probing one
            costs nothing.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DirectoryPanel receipts={app.receipts} />
        </CardContent>
      </Card>
    </section>
  );
};

const RoutinesTab = (): ReactElement => (
  <Card>
    <CardHeader>
      <CardTitle>Routines</CardTitle>
      <CardDescription>
        Sent to Telegram when it is paired, and filed in the chat either way.
      </CardDescription>
    </CardHeader>
    <CardContent className="flex flex-col gap-5">
      <DigestSettings />
      <ScheduleList />
    </CardContent>
  </Card>
);

const AccountTabBody = (): ReactElement => {
  const { deleteMyData } = useWorkspace();
  const identity = useIdentity();
  return (
    <div className="flex flex-col gap-6">
      <AppearanceSettings />
      <Card>
        <CardHeader>
          <CardTitle>Your account</CardTitle>
          <CardDescription>
            Sign out keeps everything. Delete my data removes it all, receipts
            included.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {identity.stubbed ? null : (
            <Button
              className="min-h-11"
              onClick={() => {
                identity.logout();
              }}
              variant="outline"
            >
              Sign out
            </Button>
          )}
          <Link
            className={buttonVariants({ variant: "outline" })}
            to="/welcome"
          >
            Show the welcome again
          </Link>
          <DeleteData onConfirm={deleteMyData} />
        </CardContent>
      </Card>
    </div>
  );
};

export const SettingsPage = (): ReactElement => {
  const search = useSearch({ from: "/workspace/settings" });
  const hash = useLocation({ select: (location) => location.hash });
  const navigate = useNavigate();
  const methods = usePaymentMethods();
  const cardsEnabled = methods.data?.enabled === true;
  const tab: AccountTab = search.tab ?? "spending";

  useEffect(() => {
    const landing = HASH_TABS.get(hash.replace(/^#/u, ""));
    if (landing !== undefined) {
      void navigate({
        hash: "",
        replace: true,
        search: landing === "spending" ? {} : { tab: landing },
        to: "/settings",
      });
    }
  }, [hash, navigate]);

  const tabs: readonly AccountTab[] = cardsEnabled
    ? ["spending", "routines", "email", "payments", "account"]
    : ["spending", "routines", "email", "account"];

  return (
    <Page eyebrow="Your rules, your data" intro={INTRO[tab]} title="Account">
      <Tabs
        onValueChange={(value: string) => {
          if (isTab(value)) {
            void navigate({
              search: value === "spending" ? {} : { tab: value },
              to: "/settings",
            });
          }
        }}
        value={tab}
      >
        <TabsList
          aria-label="Account sections"
          className="no-scrollbar w-full max-w-full overflow-x-auto sm:w-fit"
        >
          {tabs.map((name) => (
            <TabsTrigger key={name} value={name}>
              {LABEL[name]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {tab === "spending" ? <SpendingTab /> : null}
      {tab === "routines" ? <RoutinesTab /> : null}
      {tab === "email" ? <EmailAccount /> : null}
      {tab === "payments" ? <PaymentMethodsPanel /> : null}
      {tab === "account" ? <AccountTabBody /> : null}
    </Page>
  );
};
