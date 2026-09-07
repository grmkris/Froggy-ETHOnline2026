/** What a task came back with: text, sources, a picture or a sound. */

import type { ServiceTicket } from "@froggy/protocol";
import { Button } from "@froggy/ui/components/button";
import { DownloadIcon } from "lucide-react";
import { useState } from "react";
import type { ReactElement } from "react";

import { artifactFilename, safeLink } from "../../lib/services-view";
import { ServiceImagePreview } from "./service-image-preview";

export const ServiceTaskResult = ({
  download,
  task,
}: {
  readonly download: (url: string, filename: string) => Promise<void>;
  readonly task: ServiceTicket;
}): ReactElement => {
  const [failure, setFailure] = useState<string | null>(null);
  const { artifact } = task;
  return (
    <div className="flex flex-col gap-3">
      {task.text === "" ? null : (
        <p className="text-sm whitespace-pre-wrap">{task.text}</p>
      )}
      {task.sources.length === 0 ? null : (
        <ul className="flex flex-col gap-2 text-sm">
          {task.sources.map((source) => (
            <li className="flex flex-col gap-0.5" key={source.url}>
              <a
                className="underline underline-offset-4"
                href={safeLink(source.url)}
                rel="noopener noreferrer"
                target="_blank"
              >
                {source.title}
              </a>
              <p className="text-muted-foreground whitespace-pre-wrap">
                {source.text}
              </p>
            </li>
          ))}
        </ul>
      )}
      {artifact?.mime.startsWith("image/") === true ? (
        <ServiceImagePreview description={task.prompt} url={artifact.url} />
      ) : null}
      {artifact === null ? null : (
        <div className="flex flex-col gap-1">
          <Button
            className="min-h-11 self-start"
            onClick={() => {
              void (async () => {
                try {
                  await download(
                    artifact.url,
                    artifactFilename(artifact.mime, task.id)
                  );
                } catch {
                  setFailure("Download failed. Please try again.");
                }
              })();
            }}
            size="sm"
            variant="outline"
          >
            <DownloadIcon data-icon="inline-start" />
            Download {artifact.mime.startsWith("audio/") ? "audio" : "image"}
          </Button>
          {failure === null ? null : (
            <p className="text-destructive text-xs" role="alert">
              {failure}
            </p>
          )}
        </div>
      )}
    </div>
  );
};
