import { retiredSaleResponse } from "./oracle-route";

/** The anonymous key-holding bundle is retired in favor of authenticated /mcp. */
export const serveAgentDoor = (origin: string): Response =>
  retiredSaleResponse(origin);
