/** Sites that may see the injected wallet's address, each with a way to revoke. */

import { WalletConnectionList } from "@froggy/protocol";
import { Button } from "@froggy/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@froggy/ui/components/empty";
import { Skeleton } from "@froggy/ui/components/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Schema } from "effect";
import { GlobeIcon } from "lucide-react";
import type { ReactElement } from "react";

import { hostOf, shortAddress } from "../../lib/format";
import { useSessionToken } from "../../lib/session-token";

const decodeListed = Schema.decodeUnknownSync(WalletConnectionList);
const when = (at: number): string => new Date(at).toLocaleString();

export const DappConnections = (): ReactElement => {
  const { getToken } = useSessionToken();
  const queries = useQueryClient();
  const connections = useQuery({
    queryFn: async () => {
      const token = await getToken();
      const response = await fetch("/api/wallet-connections", {
        headers: token === null ? {} : { authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        throw new Error(`wallet-connections: ${response.status}`);
      }
      return decodeListed(await response.json());
    },
    queryKey: ["wallet-connections"],
    refetchOnWindowFocus: "always",
    retry: false,
  });

  const revoke = useMutation({
    mutationFn: async (id: string) => {
      const token = await getToken();
      const response = await fetch(`/api/wallet-connections/${id}`, {
        headers: token === null ? {} : { authorization: `Bearer ${token}` },
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error(`wallet-connections: ${response.status}`);
      }
    },
    onSuccess: async () => {
      await queries.invalidateQueries({ queryKey: ["wallet-connections"] });
    },
    retry: false,
  });

  return (
    <section aria-label="Connected sites" className="flex flex-col gap-3">
      <h2 className="text-section">Connected sites</h2>
      <p className="text-muted-foreground text-sm leading-relaxed">
        Sites the injected wallet has shown your address to. Revoking forgets
        the site; it has to ask again.
      </p>
      {connections.isPending ? (
        <Skeleton className="h-20 w-full rounded-xl" />
      ) : null}
      {connections.isError ? (
        <div className="flex flex-col items-start gap-2">
          <p className="text-muted-foreground text-sm" role="alert">
            Couldn’t load connected sites.
          </p>
          <Button
            onClick={() => {
              void connections.refetch();
            }}
            size="sm"
            variant="outline"
          >
            Retry connected sites
          </Button>
        </div>
      ) : null}
      {connections.data !== undefined &&
      connections.data.connections.length === 0 &&
      !connections.isPending ? (
        <Empty className="py-6">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <GlobeIcon aria-hidden />
            </EmptyMedia>
            <EmptyTitle>No sites connected yet.</EmptyTitle>
            <EmptyDescription>
              When a page asks the injected wallet to connect, and you allow it,
              it lands here.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}
      {connections.data === undefined ||
      connections.data.connections.length === 0 ? null : (
        <ul className="flex flex-col gap-2">
          {connections.data.connections.map((row) => (
            <li
              className="bg-muted shadow-inset flex flex-wrap items-start justify-between gap-3 rounded-xl p-3"
              key={row.id}
            >
              <div className="min-w-0">
                <h3 className="font-medium wrap-anywhere">
                  {hostOf(row.origin)}
                </h3>
                <p className="text-machine text-muted-foreground mt-1 text-xs">
                  {shortAddress(row.address)}
                </p>
                <p className="text-muted-foreground mt-1 text-xs">
                  Connected {when(row.grantedAt)}
                </p>
              </div>
              <Button
                aria-label={`Revoke ${hostOf(row.origin)}`}
                className="min-h-11"
                disabled={revoke.isPending}
                onClick={() => {
                  revoke.mutate(row.id);
                }}
                size="sm"
                variant="outline"
              >
                {revoke.isPending ? "Revoking…" : "Revoke"}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {revoke.isError ? (
        <p className="text-refused text-sm" role="alert">
          Couldn’t revoke that site. Try again.
        </p>
      ) : null}
    </section>
  );
};
