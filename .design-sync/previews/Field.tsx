import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldTitle,
  Input,
  Switch,
  Textarea,
} from "@froggy/ui";

export const Vertical = () => (
  <Field className="w-80">
    <FieldLabel htmlFor="cap">Daily spending cap</FieldLabel>
    <Input defaultValue="$25.00" id="cap" />
    <FieldDescription>
      The agent may spend up to this much per day without asking you.
    </FieldDescription>
  </Field>
);

export const Horizontal = () => (
  <Field className="w-80" orientation="horizontal">
    <FieldContent>
      <FieldTitle>Ask before every spend</FieldTitle>
      <FieldDescription>
        Even the ones your rules already allow.
      </FieldDescription>
    </FieldContent>
    <Switch defaultChecked />
  </Field>
);

export const WithError = () => (
  <Field className="w-80" data-invalid="true">
    <FieldLabel htmlFor="url">Agent connection URL</FieldLabel>
    <Input aria-invalid defaultValue="not-a-url" id="url" />
    <FieldError>Enter a URL starting with https://</FieldError>
  </Field>
);

export const Grouped = () => (
  <FieldSet className="w-80">
    <FieldLegend>Spending rules</FieldLegend>
    <FieldDescription>
      These decide what the agent can do without you.
    </FieldDescription>
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor="g-cap">Daily cap</FieldLabel>
        <Input defaultValue="$25.00" id="g-cap" />
      </Field>
      <Field>
        <FieldLabel htmlFor="g-ask">Ask above</FieldLabel>
        <Input defaultValue="$10.00" id="g-ask" />
        <FieldDescription>
          Anything larger pauses and waits for you.
        </FieldDescription>
      </Field>
      <FieldSeparator>and</FieldSeparator>
      <Field>
        <FieldLabel htmlFor="g-note">Note for the agent</FieldLabel>
        <Textarea
          defaultValue="Prefer the cheapest provider that covers the week."
          id="g-note"
        />
      </Field>
    </FieldGroup>
  </FieldSet>
);
