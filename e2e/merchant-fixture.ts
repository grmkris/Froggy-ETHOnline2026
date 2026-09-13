import { spawn } from "node:child_process";
import { once } from "node:events";
import { createInterface } from "node:readline";

import { Schema } from "effect";

export const startMerchant = async () => {
  const child = spawn(
    "bun",
    [new URL("merchant.ts", import.meta.url).pathname],
    {
      stdio: ["ignore", "pipe", "inherit"],
    }
  );
  const lines = createInterface({ input: child.stdout });
  let url: string;
  try {
    [url] = Schema.decodeUnknownSync(Schema.Tuple([Schema.String]))(
      await once(lines, "line", { signal: AbortSignal.timeout(10_000) })
    );
  } catch (error) {
    child.kill();
    throw error;
  } finally {
    lines.close();
  }
  return {
    url,
    stop: async () => {
      if (child.exitCode === null) {
        const exited = once(child, "exit");
        child.kill();
        await exited;
      }
    },
  };
};
