/** The account: the daily digest, the plumbing, paid endpoints, and the way out. */

import { Button } from "@froggy/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@froggy/ui/components/card";
import type { ReactElement } from "react";

import { Page } from "../components/nav/page";
import { AppearanceSettings } from "../components/settings/appearance-settings";
import { ConnectionDetails } from "../components/settings/connection-details";
import { DeleteData } from "../components/settings/delete-data";
import { DigestSettings } from "../components/settings/digest-settings";
import { DirectoryPanel } from "../components/settings/directory-panel";
import { ScheduleList } from "../components/settings/schedule-list";
import { useIdentity } from "../lib/privy";
import { useWorkspace } from "../lib/workspace-context";

export const SettingsPage = (): ReactElement => {
  const { app, deleteMyData, webMcp } = useWorkspace();
  const identity = useIdentity();
  return (
    <Page
      intro="Your routines, connections, and account. All in one place."
      title="Settings"
      wide
    >
      <div className="grid items-start gap-6 xl:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Reminders</CardTitle>
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
          <Card>
            <CardHeader>
              <CardTitle>Connection</CardTitle>
              <CardDescription>
                The signer, the session, and whether the agent may sign under
                policy.
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
          <AppearanceSettings />
          <Card>
            <CardHeader>
              <CardTitle>Account</CardTitle>
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
              <DeleteData onConfirm={deleteMyData} />
            </CardContent>
          </Card>
        </div>
      </div>
    </Page>
  );
};
