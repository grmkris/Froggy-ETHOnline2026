import type { PaymentMethod } from "@froggy/domain";
import { PaymentMethodSave } from "@froggy/protocol";
import { Button } from "@froggy/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@froggy/ui/components/card";
import { Field, FieldGroup, FieldLabel } from "@froggy/ui/components/field";
import { Input } from "@froggy/ui/components/input";
import { Schema } from "effect";
import { useState } from "react";
import type { ReactElement } from "react";

import { useCardApi, usePaymentMethods } from "../../hooks/use-card-checkouts";

const CardForm = ({
  method,
  close,
}: {
  readonly method: PaymentMethod | null;
  readonly close: () => void;
}): ReactElement => {
  const api = useCardApi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      autoComplete="off"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        setBusy(true);
        setError(null);
        void (async () => {
          try {
            let input = Schema.decodeUnknownSync(PaymentMethodSave)({
              v: 1,
              label: data.get("label"),
              fundingAddress: data.get("address"),
              credentials: {
                name: data.get("name"),
                number: String(data.get("number")).replaceAll(/[ -]/gu, ""),
                expiryMonth: data.get("month"),
                expiryYear: data.get("year"),
                cvc: data.get("cvc"),
              },
            });
            if (method !== null) {
              input = { ...input, expectedRevision: method.revision };
            }
            await api.request(
              `/api/payment-methods${method === null ? "" : `/${method.id}`}`,
              input,
              method === null ? "POST" : "PUT"
            );
            form.reset();
            await api.refresh();
            close();
          } catch {
            setError(
              "Could not save this card. Check all fields and the funding address, then try again."
            );
          }
          setBusy(false);
        })();
      }}
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="card-label">Label</FieldLabel>
          <Input
            id="card-label"
            name="label"
            maxLength={120}
            defaultValue={method?.label}
            required
            placeholder="My shopping card"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="card-address">
            Your Linea funding address
          </FieldLabel>
          <Input
            id="card-address"
            name="address"
            defaultValue={method?.fundingAddress}
            required
            pattern="0x[0-9a-fA-F]{40}"
            placeholder="0x…"
            spellCheck={false}
          />
          <p className="text-muted-foreground text-xs">
            USDC is sent to this independent wallet. Check the address against
            your card account.
          </p>
        </Field>
        <Field>
          <FieldLabel htmlFor="card-name">Cardholder name</FieldLabel>
          <Input id="card-name" name="name" maxLength={150} required />
        </Field>
        <Field>
          <FieldLabel htmlFor="card-number">Card number</FieldLabel>
          <Input
            id="card-number"
            name="number"
            inputMode="numeric"
            type="password"
            maxLength={23}
            required
          />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field>
            <FieldLabel htmlFor="card-month">Month</FieldLabel>
            <Input
              id="card-month"
              name="month"
              inputMode="numeric"
              pattern="0[1-9]|1[0-2]"
              placeholder="MM"
              maxLength={2}
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="card-year">Year</FieldLabel>
            <Input
              id="card-year"
              name="year"
              inputMode="numeric"
              pattern="20[0-9]{2}"
              placeholder="YYYY"
              maxLength={4}
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="card-cvc">CVC</FieldLabel>
            <Input
              id="card-cvc"
              name="cvc"
              inputMode="numeric"
              type="password"
              pattern="[0-9]{3,4}"
              maxLength={4}
              required
            />
          </Field>
        </div>
        <p className="text-muted-foreground text-xs">
          Demo configuration: card details, including CVC, are encrypted and
          retained on the server. Use a card intended for this demo.
        </p>
        {error === null ? null : (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save payment method"}
          </Button>
          <Button type="button" variant="ghost" disabled={busy} onClick={close}>
            Cancel
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
};
const methodStatus = (revokedAt: number | null, stubbed: boolean): string => {
  if (revokedAt !== null) {
    return "Revoked";
  }
  return stubbed ? "Demo · simulated balance" : "Linea USDC";
};
export const PaymentMethodsPanel = (): ReactElement => {
  const methods = usePaymentMethods();
  const api = useCardApi();
  const [editing, setEditing] = useState<PaymentMethod | null | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Card id="payment-methods" className="scroll-mt-6">
      <CardHeader>
        <CardTitle>Payment methods</CardTitle>
        <CardDescription>
          A saved card and its Linea funding address. Every purchase needs your
          approval.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {methods.data?.enabled === false ? (
          <p className="text-muted-foreground text-sm">
            Saved-card purchases are not enabled in this workspace yet.
          </p>
        ) : null}
        {methods.isError ? (
          <p role="alert">Payment methods could not be loaded.</p>
        ) : null}
        {methods.data?.methods.map(({ method, balance, stubbed }) => (
          <div key={method.id} className="flex flex-col gap-2 border-b pb-4">
            <div className="flex items-center justify-between gap-3">
              <p className="font-medium">
                {method.label}{" "}
                <span className="text-muted-foreground">
                  ···· {method.last4}
                </span>
              </p>
              <span className="text-muted-foreground text-xs">
                {methodStatus(method.revokedAt, stubbed)}
              </span>
            </div>
            <p className="text-muted-foreground font-mono text-xs break-all">
              {method.fundingAddress}
            </p>
            {method.revokedAt === null ? (
              <>
                <p className="text-sm">
                  {balance === null
                    ? "Balance unavailable"
                    : `${(Number(balance) / 1_000_000).toFixed(6)} USDC available`}
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => setEditing(method)}
                  >
                    Replace
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => {
                      setBusy(true);
                      setError(null);
                      void (async () => {
                        try {
                          await api.request(
                            `/api/payment-methods/${method.id}`,
                            undefined,
                            "DELETE"
                          );
                          await api.refresh();
                        } catch {
                          setError(
                            "Revocation could not be confirmed. Try again."
                          );
                        }
                        setBusy(false);
                      })();
                    }}
                  >
                    Revoke
                  </Button>
                </div>
              </>
            ) : null}
          </div>
        ))}
        {error === null ? null : (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
        {editing === undefined ? (
          <Button
            variant="outline"
            disabled={methods.data?.enabled !== true}
            onClick={() => setEditing(null)}
          >
            Add payment method
          </Button>
        ) : (
          <CardForm
            key={editing?.id ?? "new"}
            method={editing}
            close={() => setEditing(undefined)}
          />
        )}
      </CardContent>
    </Card>
  );
};
