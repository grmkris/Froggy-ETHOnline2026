import { Button, buttonVariants } from "@froggy/ui/components/button";
/** The account: the daily digest, the plumbing, paid endpoints, and the way out. */
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@froggy/ui/components/card";
import { Link } from "@tanstack/react-router";
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
import { usePaymentMethods } from "../hooks/use-card-checkouts";
import { useIdentity } from "../lib/privy";
import { useWorkspace } from "../lib/workspace-context";

export const SettingsPage = (): ReactElement => {
  const { app, deleteMyData, webMcp } = useWorkspace();
  const identity = useIdentity();
  const methods = usePaymentMethods();
  return (
    <Page
      intro="Your routines, connections, and account. All in one place."
      title="Account"
      wide
    >
      <nav
        aria-label="Account sections"
        className="text-muted-foreground flex flex-wrap gap-x-5 gap-y-2 border-b pb-4 text-sm"
      >
        {[
          ["email", "Email"],
          ["payment-methods", "Payment methods"],
          ["routines", "Routines"],
          ["spending", "Spending controls"],
          ["appearance", "Appearance"],
          ["account", "Your account"],
        ]
          .filter(
            ([id]) => id !== "payment-methods" || methods.data?.enabled === true
          )
          .map(([id, label]) => (
            <a
              className="hover:text-brand focus-visible:outline-ring inline-flex min-h-11 items-center focus-visible:outline-2"
              key={id}
              href={`#${id}`}
            >
              {label}
            </a>
          ))}
      </nav>
      <div className="grid items-start gap-6 xl:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-6">
          <section id="email" className="scroll-mt-6">
            <EmailAccount />
          </section>
          <Card id="routines" className="scroll-mt-6">
            <CardHeader>
              <CardTitle>Routines</CardTitle>
              <CardDescription>
                What Froggy does on its own: the daily digest, and anything you
                asked it to remind you of or run later. Sent to Telegram when it
                is paired, and filed in the chat.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <DigestSettings />
              <ScheduleList />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Paid endpoints</CardTitle>
              <CardDescription>
                A stranger’s 402 becomes payable only once it is in this list.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DirectoryPanel receipts={app.receipts} />
            </CardContent>
          </Card>
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <PaymentMethodsPanel />
          <Card id="spending" className="scroll-mt-6">
            <CardHeader>
              <CardTitle>Spending controls</CardTitle>
              <CardDescription>
                The signer, the session, and the rules your agent is held to.
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
          <section id="appearance" className="scroll-mt-6">
            <AppearanceSettings />
          </section>
          <Card id="account" className="scroll-mt-6">
            <CardHeader>
              <CardTitle>Your account</CardTitle>
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
      </div>
    </Page>
  );
};
