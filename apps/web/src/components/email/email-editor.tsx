import {
  EmailDraftInput,
  EmailFile,
  EmailDraft as EmailDraftSchema,
} from "@froggy/domain";
import type { ConversationId, EmailMessage, EmailDraft } from "@froggy/domain";
import { Button } from "@froggy/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@froggy/ui/components/card";
import { Field, FieldGroup, FieldLabel } from "@froggy/ui/components/field";
import { Input } from "@froggy/ui/components/input";
import { Textarea } from "@froggy/ui/components/textarea";
import { Schema } from "effect";
import { useState, useEffect, useRef } from "react";

import { useDrafts } from "../../lib/draft-context";
import { useEmailClient } from "../../lib/email-client";

const addresses = (text: string) =>
  text
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
export const FileButton = ({
  file,
}: {
  readonly file: Pick<EmailFile, "id" | "name"> &
    Partial<Pick<EmailFile, "size">>;
}) => {
  const client = useEmailClient();
  const [failure, setFailure] = useState("");
  return (
    <div>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          void (async () => {
            try {
              const response = await client.request(`files/${file.id}`);
              const url = URL.createObjectURL(await response.blob());
              const link = document.createElement("a");
              link.href = url;
              const disposition = response.headers.get("content-disposition");
              const encodedName = disposition?.match(
                /filename\*=UTF-8''(?<name>[^;]+)/u
              )?.groups?.["name"];
              link.download =
                encodedName !== undefined && encodedName !== ""
                  ? decodeURIComponent(encodedName)
                  : file.name;
              link.click();
              setTimeout(() => {
                URL.revokeObjectURL(url);
              }, 30_000);
            } catch {
              setFailure("Download unavailable.");
            }
          })();
        }}
      >
        {file.name}
        {file.size === undefined ? "" : ` · ${Math.ceil(file.size / 1024)} KiB`}
      </Button>
      {failure ? <p role="alert">{failure}</p> : null}
    </div>
  );
};
const initialEmailFields = (draft?: EmailDraft, reply?: EmailMessage) => ({
  to: draft?.to.join(", ") ?? reply?.from ?? "",
  cc: draft?.cc.join(", ") ?? "",
  bcc: draft?.bcc.join(", ") ?? "",
  subject: draft?.subject ?? (reply ? `Re: ${reply.subject}` : ""),
  text: draft?.text ?? "",
  files: draft?.files ?? [],
});

export const DraftEditor = ({
  conversationId,
  draft,
  reply,
  close,
}: {
  readonly conversationId: ConversationId;
  readonly draft?: EmailDraft | undefined;
  readonly reply?: EmailMessage | undefined;
  readonly close: (saved?: EmailDraft["id"]) => void;
}) => {
  const client = useEmailClient();
  const memory = useDrafts();
  const memoryKey = `${conversationId}:${draft?.id ?? reply?.id ?? "new"}`;
  const initial = initialEmailFields(draft, reply);
  const { to, cc, bcc, subject, text, files } =
    memory.emails.get(memoryKey) ?? initial;
  const edit = (update: Partial<typeof initial>) => {
    memory.editEmail(memoryKey, initial, update);
  };
  const [recipientsOpen, setRecipientsOpen] = useState(cc !== "" || bcc !== "");
  const [failure, setFailure] = useState("");
  const [pending, setPending] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const save = async () => {
    setPending(true);
    setFailure("");
    try {
      const input = Schema.decodeUnknownSync(EmailDraftInput)({
        conversationId,
        to: addresses(to),
        cc: addresses(cc),
        bcc: addresses(bcc),
        subject,
        text,
        files,
        replyTo: draft?.replyTo ?? reply?.id ?? null,
      });
      const saved = await client.change(
        draft ? `drafts/${draft.id}` : "drafts",
        { v: 1, ...input, revision: draft?.revision ?? 0 },
        draft ? "PATCH" : "POST"
      );
      const savedId = Schema.decodeUnknownSync(
        Schema.Struct({ v: Schema.Literal(1), draft: EmailDraftSchema })
      )(saved).draft.id;
      memory.clearEmail(memoryKey);
      if (mounted.current) {
        close(savedId);
      }
    } catch (error) {
      setFailure(
        error instanceof Error ? error.message : "Could not save draft."
      );
    }
    setPending(false);
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>{reply ? "Reply" : "Email draft"}</CardTitle>
        <CardDescription>
          Save a draft, then review the exact message before sending.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          id="email-draft-form"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <fieldset disabled={pending} className="min-w-0">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="mail-to">To</FieldLabel>
                <Input
                  id="mail-to"
                  value={to}
                  onChange={(event) => {
                    edit({ to: event.target.value });
                  }}
                  required
                />
              </Field>
              <Button
                type="button"
                variant="ghost"
                className="self-start"
                aria-expanded={recipientsOpen}
                onClick={() => {
                  setRecipientsOpen(!recipientsOpen);
                }}
              >
                Cc / Bcc
              </Button>
              {recipientsOpen ? (
                <>
                  <Field>
                    <FieldLabel htmlFor="mail-cc">Cc</FieldLabel>
                    <Input
                      id="mail-cc"
                      value={cc}
                      onChange={(event) => {
                        edit({ cc: event.target.value });
                      }}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="mail-bcc">Bcc</FieldLabel>
                    <Input
                      id="mail-bcc"
                      value={bcc}
                      onChange={(event) => {
                        edit({ bcc: event.target.value });
                      }}
                    />
                  </Field>
                </>
              ) : null}
              <Field>
                <FieldLabel htmlFor="mail-subject">Subject</FieldLabel>
                <Input
                  id="mail-subject"
                  value={subject}
                  onChange={(event) => {
                    edit({ subject: event.target.value });
                  }}
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="mail-text">Message</FieldLabel>
                <Textarea
                  id="mail-text"
                  value={text}
                  onChange={(event) => {
                    edit({ text: event.target.value });
                  }}
                  rows={7}
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="mail-files">
                  Attachments ({files.length})
                </FieldLabel>
                <Input
                  id="mail-files"
                  type="file"
                  disabled={pending}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) {
                      return;
                    }
                    setPending(true);
                    void (async () => {
                      try {
                        const result = await client.request("files", {
                          method: "POST",
                          headers: {
                            "content-type":
                              file.type || "application/octet-stream",
                            "x-file-name": encodeURIComponent(file.name),
                          },
                          body: file,
                        });
                        const parsed = Schema.decodeUnknownSync(
                          Schema.Struct({
                            v: Schema.Literal(1),
                            file: EmailFile,
                          })
                        )(await result.json());
                        edit({ files: [...files, parsed.file.id] });
                      } catch (error) {
                        setFailure(
                          error instanceof Error
                            ? error.message
                            : "Upload failed."
                        );
                      }
                      setPending(false);
                    })();
                  }}
                />
                {files.length ? (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      edit({ files: [] });
                    }}
                  >
                    Remove attachments from draft
                  </Button>
                ) : null}
              </Field>
            </FieldGroup>
          </fieldset>
        </form>
        {failure ? (
          <p role="alert" className="text-destructive text-sm">
            {failure}
          </p>
        ) : null}
      </CardContent>
      <CardFooter className="gap-2">
        <Button type="submit" form="email-draft-form" disabled={pending}>
          Save draft for review
        </Button>
        <Button
          variant="ghost"
          disabled={pending}
          onClick={() => {
            memory.clearEmail(memoryKey);
            close();
          }}
        >
          Cancel
        </Button>
      </CardFooter>
    </Card>
  );
};
