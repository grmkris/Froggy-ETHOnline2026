import { PURCHASE_INPUT_LIMIT, PURCHASE_MAX_USD_MICROS } from "@froggy/domain";
import type { PurchaseRequest } from "@froggy/protocol";
import { Button, buttonVariants } from "@froggy/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@froggy/ui/components/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@froggy/ui/components/field";
import { Input } from "@froggy/ui/components/input";
import { Textarea } from "@froggy/ui/components/textarea";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@froggy/ui/components/toggle-group";
import { useId, useRef, useState } from "react";
import type { ReactElement } from "react";

import { usePurchases } from "../../hooks/use-purchases";
import { useWorkspace } from "../../lib/workspace-context";
import { PurchaseResults } from "./purchase-results";
import { PurchaseWallets } from "./purchase-wallets";

export const PurchasePanel = (): ReactElement => {
  const { app } = useWorkspace();
  const api = usePurchases(app.sessionId, true);
  const id = useId();
  const [url, setUrl] = useState("");
  const [method, setMethod] = useState<"GET" | "POST">("GET");
  const [body, setBody] = useState("{}");
  const [purpose, setPurpose] = useState("");
  const [maximum, setMaximum] = useState("0.10");
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);
  // A lost response must retry the same purchase, even after editing a draft
  // and returning to it. Keys are assigned before the first network call.
  const submittedKeys = useRef(new Map<string, string>());
  const submit = (): void => {
    if (submitting.current || !api.enabled) {
      return;
    }
    setError(null);
    let target: URL;
    try {
      target = new URL(url.trim());
    } catch {
      setError("Enter a complete HTTP or HTTPS URL.");
      return;
    }
    if (
      !["https:", "http:"].includes(target.protocol) ||
      target.username !== "" ||
      target.password !== ""
    ) {
      setError("Use an HTTP or HTTPS URL without embedded credentials.");
      return;
    }
    const maxUsdMicros = Math.round(Number(maximum) * 1_000_000);
    if (
      !Number.isFinite(maxUsdMicros) ||
      maxUsdMicros < 1 ||
      maxUsdMicros > PURCHASE_MAX_USD_MICROS
    ) {
      setError("Choose a maximum price between $0.000001 and $1.");
      return;
    }
    if (purpose.trim() === "") {
      setError("Add a purpose so you can recognize this purchase.");
      return;
    }
    if (method === "POST") {
      if (new TextEncoder().encode(body).byteLength > PURCHASE_INPUT_LIMIT) {
        setError("JSON input must be at most 16 KiB.");
        return;
      }
      try {
        JSON.parse(body);
      } catch {
        setError("Enter valid JSON for the POST request.");
        return;
      }
    }
    const draft = {
      v: 1,
      url: target.href,
      method,
      body: method === "POST" ? body : null,
      purpose: purpose.trim(),
      maxUsdMicros,
    } as const;
    const fingerprint = JSON.stringify(draft);
    let idempotencyKey = submittedKeys.current.get(fingerprint);
    if (idempotencyKey === undefined) {
      idempotencyKey = crypto.randomUUID();
      submittedKeys.current.set(fingerprint, idempotencyKey);
    }
    const input: PurchaseRequest = { ...draft, idempotencyKey };
    submitting.current = true;
    api.request.mutate(input, {
      onSettled: () => {
        submitting.current = false;
      },
    });
  };
  return (
    <section aria-label="Pay a URL" className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-section">Pay a URL</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Get a price, approve once, keep the result.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            className={buttonVariants({ variant: "ghost", size: "sm" })}
            href="/demo/x402"
            rel="noreferrer"
            target="_blank"
          >
            Open demo
          </a>
          <Button
            disabled={api.request.isPending}
            onClick={() => {
              setUrl(
                new URL("/demo/x402/report", globalThis.location.origin).href
              );
              setMethod("GET");
              setPurpose("Try the x402 demo report");
              setError(null);
              api.request.reset();
            }}
            size="sm"
            type="button"
            variant="outline"
          >
            Use demo report
          </Button>
        </div>
      </div>
      <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>
              <h3>Request a paid resource</h3>
            </CardTitle>
            <CardDescription>
              The approval will show the exact URL, network, token and
              recipient.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              aria-label="Request a URL purchase"
              className="flex flex-col gap-5"
              onSubmit={(event) => {
                event.preventDefault();
                submit();
              }}
            >
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor={`${id}-url`}>URL</FieldLabel>
                  <Input
                    autoComplete="off"
                    disabled={api.request.isPending}
                    id={`${id}-url`}
                    maxLength={8192}
                    onChange={(event) => {
                      setUrl(event.target.value);
                      api.request.reset();
                    }}
                    placeholder="https://example.com/paid-resource"
                    required
                    type="url"
                    value={url}
                  />
                </Field>
                <Field>
                  <span className="text-sm font-medium" id={`${id}-method`}>
                    Request method
                  </span>
                  <ToggleGroup
                    aria-labelledby={`${id}-method`}
                    disabled={api.request.isPending}
                    multiple={false}
                    onValueChange={(values) => {
                      const [selected] = values;
                      if (selected === "GET" || selected === "POST") {
                        setMethod(selected);
                        api.request.reset();
                      }
                    }}
                    value={[method]}
                    variant="outline"
                  >
                    <ToggleGroupItem value="GET">GET</ToggleGroupItem>
                    <ToggleGroupItem value="POST">JSON POST</ToggleGroupItem>
                  </ToggleGroup>
                </Field>
                {method === "POST" ? (
                  <Field>
                    <FieldLabel htmlFor={`${id}-body`}>JSON input</FieldLabel>
                    <Textarea
                      aria-describedby={`${id}-body-help`}
                      className="text-machine min-h-28"
                      disabled={api.request.isPending}
                      id={`${id}-body`}
                      maxLength={PURCHASE_INPUT_LIMIT}
                      onChange={(event) => {
                        setBody(event.target.value);
                        api.request.reset();
                      }}
                      required
                      spellCheck={false}
                      value={body}
                    />
                    <FieldDescription id={`${id}-body-help`}>
                      You approve sending this input before it leaves Froggy. A
                      second approval confirms the price.
                    </FieldDescription>
                  </Field>
                ) : null}
                <Field>
                  <FieldLabel htmlFor={`${id}-purpose`}>Purpose</FieldLabel>
                  <Input
                    disabled={api.request.isPending}
                    id={`${id}-purpose`}
                    maxLength={500}
                    onChange={(event) => {
                      setPurpose(event.target.value);
                      api.request.reset();
                    }}
                    placeholder="What is this purchase for?"
                    required
                    value={purpose}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`${id}-maximum`}>
                    Maximum price (USD)
                  </FieldLabel>
                  <Input
                    aria-describedby={`${id}-maximum-help`}
                    className="max-w-40"
                    disabled={api.request.isPending}
                    id={`${id}-maximum`}
                    inputMode="decimal"
                    max={1}
                    min={0.000001}
                    onChange={(event) => {
                      setMaximum(event.target.value);
                      api.request.reset();
                    }}
                    required
                    step={0.000001}
                    type="number"
                    value={maximum}
                  />
                  <FieldDescription id={`${id}-maximum-help`}>
                    Up to $1 per purchase. You approve the quoted amount.
                  </FieldDescription>
                </Field>
              </FieldGroup>
              {error === null ? null : <FieldError>{error}</FieldError>}
              {api.request.isError ? (
                <FieldError>
                  {api.request.error.message} Submitting this unchanged request
                  again checks the same purchase.
                </FieldError>
              ) : null}
              {api.request.isSuccess ? (
                <output className="text-muted-foreground text-sm">
                  Request saved. Follow its approval above and its result below.
                </output>
              ) : null}
              <Button
                disabled={api.request.isPending || !api.enabled}
                type="submit"
              >
                {api.request.isPending
                  ? "Creating request…"
                  : "Request purchase"}
              </Button>
            </form>
          </CardContent>
        </Card>
        <PurchaseWallets api={api} />
      </div>
      <PurchaseResults api={api} />
    </section>
  );
};
