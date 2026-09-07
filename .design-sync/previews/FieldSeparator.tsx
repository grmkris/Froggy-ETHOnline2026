import { Field, FieldLabel, FieldSeparator, Input } from "@froggy/ui";

export const WithWord = () => (
  <div className="flex w-80 flex-col gap-5">
    <Field>
      <FieldLabel htmlFor="fs-a">Daily cap</FieldLabel>
      <Input defaultValue="$25.00" id="fs-a" />
    </Field>
    <FieldSeparator>and</FieldSeparator>
    <Field>
      <FieldLabel htmlFor="fs-b">Ask above</FieldLabel>
      <Input defaultValue="$10.00" id="fs-b" />
    </Field>
  </div>
);

export const Plain = () => (
  <div className="flex w-80 flex-col gap-5">
    <Field>
      <FieldLabel htmlFor="fs-c">Daily cap</FieldLabel>
      <Input defaultValue="$25.00" id="fs-c" />
    </Field>
    <FieldSeparator />
    <Field>
      <FieldLabel htmlFor="fs-d">Ask above</FieldLabel>
      <Input defaultValue="$10.00" id="fs-d" />
    </Field>
  </div>
);
