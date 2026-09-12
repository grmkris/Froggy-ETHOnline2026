import { EmailPage, EmailStatus } from "@froggy/protocol";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Schema } from "effect";

import { useSessionToken } from "./session-token";
import { useWorkspace } from "./workspace-context";

const ErrorBody = Schema.Struct({ error: Schema.String });
export const useEmailClient = () => {
  const { getToken, canConnect } = useSessionToken();
  const { app } = useWorkspace();
  const queries = useQueryClient();
  const request = async (path: string, init: RequestInit = {}) => {
    const token = await getToken();
    if (token === null || token === "") {
      throw new Error("Sign in to use email.");
    }
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${token}`);
    const response = await fetch(`/api/email/${path}`, { ...init, headers });
    if (!response.ok) {
      const error = Schema.decodeUnknownResult(ErrorBody)(
        await response.json().catch(() => null)
      );
      throw new Error(
        error._tag === "Success" ? error.success.error : "Email request failed."
      );
    }
    return response;
  };
  const change = async (
    path: string,
    body: Schema.Json | undefined,
    method = "POST"
  ) => {
    const response = await request(path, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    await queries.invalidateQueries({ queryKey: ["email"] });
    await queries.invalidateQueries({ queryKey: ["history"] });
    return Schema.decodeUnknownSync(Schema.Json)(await response.json());
  };
  return { request, change, canConnect, owner: app.sessionId };
};
export const useEmailStatus = () => {
  const client = useEmailClient();
  return useQuery({
    queryKey: ["email", client.owner, "status"],
    queryFn: async () => {
      const resolvedEmail = await client.request("status");
      return Schema.decodeUnknownSync(EmailStatus)(await resolvedEmail.json());
    },
    enabled: client.canConnect,
    refetchInterval: 10_000,
    retry: false,
  });
};
export const useEmailPage = (conversation: string, query = "", before = "") => {
  const client = useEmailClient();
  const path = `messages?conversation=${encodeURIComponent(conversation)}&q=${encodeURIComponent(query)}${before ? `&before=${before}` : ""}`;
  return useQuery({
    queryKey: ["email", client.owner, path],
    queryFn: async () => {
      const resolvedEmail = await client.request(path);
      return Schema.decodeUnknownSync(EmailPage)(await resolvedEmail.json());
    },
    enabled: client.canConnect,
    refetchInterval: 5000,
    retry: false,
  });
};
