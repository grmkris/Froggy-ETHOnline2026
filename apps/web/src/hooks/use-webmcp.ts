/**
 * Register the wallet's WebMCP tools while the workspace is open.
 *
 * The sources are read through a ref so the registered tools always see the
 * latest state without being re-registered on every socket message.
 */

import { useEffect, useRef, useState } from "react";

import { modelContextOf, registerWebMcp, webMcpTools } from "../lib/webmcp";
import type { WebMcpSources, WebMcpStatus } from "../lib/webmcp";

export const useWebMcp = (sources: WebMcpSources): WebMcpStatus => {
  const latest = useRef(sources);
  const [status, setStatus] = useState<WebMcpStatus>({ kind: "unavailable" });

  useEffect(() => {
    latest.current = sources;
  }, [sources]);

  useEffect(() => {
    const context = modelContextOf();
    if (context === null) {
      // One shape for the effect: a cleanup either way.
      return () => {
        setStatus({ kind: "unavailable" });
      };
    }
    const tools = webMcpTools(() => latest.current);
    const release = registerWebMcp(context, tools);
    setStatus({ kind: "registered", tools: tools.length });
    return () => {
      release();
      setStatus({ kind: "unavailable" });
    };
  }, []);

  return status;
};
