import {
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@froggy/ui";

export const Default = () => (
  <Card className="w-80">
    <CardHeader>
      <CardTitle>Daily spending cap</CardTitle>
      <CardDescription>
        The agent may spend up to this much per day without asking.
      </CardDescription>
    </CardHeader>
    <CardContent>
      <span className="text-money text-2xl leading-none">$25.00</span>
      <p className="text-muted-foreground mt-1 text-sm">$4.80 used today</p>
    </CardContent>
  </Card>
);

export const WithAction = () => (
  <Card className="w-80">
    <CardHeader>
      <CardTitle>Research agent</CardTitle>
      <CardDescription>Connected 6 days ago · 41 receipts</CardDescription>
      <CardAction>
        <Badge variant="secondary">Active</Badge>
      </CardAction>
    </CardHeader>
    <CardContent>
      <p className="text-muted-foreground text-sm">
        Last spend: $0.48 on RPC credits, allowed by <code>daily-cap</code>.
      </p>
    </CardContent>
  </Card>
);

export const WithFooter = () => (
  <Card className="w-80">
    <CardHeader>
      <CardTitle>Approve this spend?</CardTitle>
      <CardDescription>
        The agent wants $12.40 for a Graph query subscription.
      </CardDescription>
    </CardHeader>
    <CardFooter className="gap-2">
      <Button size="sm">Allow once</Button>
      <Button size="sm" variant="outline">
        Allow this session
      </Button>
      <Button className="ml-auto" size="sm" variant="ghost">
        Deny
      </Button>
    </CardFooter>
  </Card>
);

export const Small = () => (
  <Card className="w-72" size="sm">
    <CardHeader>
      <CardTitle>Evidence</CardTitle>
      <CardDescription>3 of 3 Graph indexes fresh</CardDescription>
    </CardHeader>
    <CardContent>
      <p className="text-machine text-muted-foreground text-xs">
        snapshot 9f2c41ab8e0d7c53
      </p>
    </CardContent>
  </Card>
);
