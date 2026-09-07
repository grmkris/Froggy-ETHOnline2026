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
import { ConnectionDetails } from "../components/settings/connection-details";
import { DeleteData } from "../components/settings/delete-data";
import { DigestSettings } from "../components/settings/digest-settings";
import { DirectoryPanel } from "../components/settings/directory-panel";
import { IntegrationBadges } from "../components/settings/integration-badges";
import { useIdentity } from "../lib/privy";
import { useWorkspace } from "../lib/workspace-context";

export const SettingsPage = (): ReactElement => {
  const { app, deleteMyData, webMcp } = useWorkspace();
  const identity = useIdentity();
  return (
    <Page title="Settings">
      <Card>
        <CardHeader>
          <CardTitle>Reminders</CardTitle>
          <CardDescription>
            A daily digest of what changed, sent to Telegram when it is paired.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DigestSettings />
        </CardContent>
      </Card>
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
      <Card>
        <CardHeader>
          <CardTitle>Integrations</CardTitle>
          <CardDescription>
            What this deployment talks to for real, and what is stubbed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <IntegrationBadges modes={app.modes} stubbed={identity.stubbed} />
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
          <DeleteData
            onConfirm={() => {
              void deleteMyData();
            }}
          />
        </CardContent>
      </Card>
    </Page>
  );
};
