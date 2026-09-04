/**
 * The app socket: wallet, mandate, receipts, policy decisions.
 *
 * Low rate and every message matters, so unlike the browser socket this one
 * does live in React state. The receipts list is append-only in the client for
 * the same reason it is on the server: a receipt is a record of a past
 * decision, and mutating one would be rewriting history.
 */

import type { Mandate, PolicyDecision, Receipt } from "@froggy/domain";
import type {
  AppClientMessage,
  ServiceModes,
  WalletSummary,
} from "@froggy/protocol";
import {
  decodeAppServerMessage,
  encodeAppClientMessage,
} from "@froggy/protocol";
import { Result } from "effect";
import { useCallback, useEffect, useRef, useState } from "react";

import { socketUrl } from "../environment";

const PING_INTERVAL_MS = 15_000;
const MAX_BACKOFF_MS = 5000;

export interface AppStream {
  readonly connected: boolean;
  readonly lastDecision: PolicyDecision | null;
  readonly mandate: Mandate | null;
  readonly modes: ServiceModes | null;
  readonly receipts: readonly Receipt[];
  readonly send: (message: AppClientMessage) => void;
  readonly wallet: WalletSummary | null;
}

export const useAppSocket = (): AppStream => {
  const [connected, setConnected] = useState(false);
  const [modes, setModes] = useState<ServiceModes | null>(null);
  const [mandate, setMandate] = useState<Mandate | null>(null);
  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [receipts, setReceipts] = useState<readonly Receipt[]>([]);
  const [lastDecision, setLastDecision] = useState<PolicyDecision | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  const send = useCallback((message: AppClientMessage) => {
    const socket = socketRef.current;
    if (socket?.readyState !== WebSocket.OPEN) {
      return;
    }
    socket.send(encodeAppClientMessage(message));
  }, []);

  useEffect(() => {
    let closed = false;
    let attempt = 0;
    let socket: WebSocket | null = null;
    let ping: ReturnType<typeof setInterval> | null = null;
    let reconnect: ReturnType<typeof setTimeout> | null = null;

    const open = (): void => {
      if (closed) {
        return;
      }
      socket = new WebSocket(socketUrl("/ws/app"));
      socketRef.current = socket;

      socket.addEventListener("open", () => {
        attempt = 0;
        setConnected(true);
        ping = setInterval(() => {
          socket?.send(
            encodeAppClientMessage({ sentAt: Date.now(), type: "ping", v: 1 })
          );
        }, PING_INTERVAL_MS);
      });

      socket.addEventListener("message", (event: MessageEvent<unknown>) => {
        const decoded = decodeAppServerMessage(String(event.data));
        if (Result.isFailure(decoded)) {
          return;
        }
        const message = decoded.success;
        switch (message.type) {
          case "session.welcome": {
            setModes(message.modes);
            return;
          }
          case "mandate.state": {
            setMandate(message.mandate);
            return;
          }
          case "wallet.state": {
            setWallet(message.wallet);
            return;
          }
          case "receipt.appended": {
            setReceipts((current) => [message.receipt, ...current]);
            return;
          }
          case "policy.decision": {
            setLastDecision(message.decision);
            break;
          }
          // Approval cards, pongs and protocol errors reach this socket but are
          // not state the pane renders yet. Listing them keeps the switch
          // exhaustive, so adding a message type is a compile error rather than
          // a silently ignored frame.
          case "approval.request":
          case "approval.resolved":
          case "pong":
          case "protocol.error": {
            break;
          }
          default: {
            break;
          }
        }
      });

      socket.addEventListener("close", () => {
        setConnected(false);
        if (ping !== null) {
          clearInterval(ping);
        }
        if (closed) {
          return;
        }
        attempt += 1;
        reconnect = setTimeout(
          open,
          Math.min(750 * 2 ** attempt, MAX_BACKOFF_MS)
        );
      });
    };

    open();

    return () => {
      closed = true;
      if (ping !== null) {
        clearInterval(ping);
      }
      if (reconnect !== null) {
        clearTimeout(reconnect);
      }
      socket?.close();
      socketRef.current = null;
    };
  }, []);

  return { connected, lastDecision, mandate, modes, receipts, send, wallet };
};
