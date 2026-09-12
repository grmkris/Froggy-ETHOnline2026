/**
 * The wallet a page sees.
 *
 * Injected into every document of every tab before the page's own scripts run
 * (`Page.addScriptToEvaluateOnNewDocument`). It is an EIP-1193 provider that
 * announces itself under EIP-6963 and as `window.ethereum`, and it holds no
 * secret and no state worth stealing: every call is serialised and handed to
 * the server through a CDP binding, and the server evaluates the answer back
 * into exactly the execution context that asked. A page that tampers with
 * this object can only lie to itself.
 *
 * Plain JavaScript in a string, on purpose. It runs in the page's main world
 * on whatever Chrome the provider gives us, so it uses nothing newer than what
 * a dapp itself would rely on and imports nothing.
 */

import { BROWSER_WALLET_CALL_LIMIT, WalletRpcMethod } from "@froggy/protocol";

export interface WalletProviderOptions {
  /** The binding name `Runtime.addBinding` registered. */
  readonly binding: string;
  /** `0x2105` for Base. The page is told this before it asks. */
  readonly chainIdHex: string;
  /** Answered locally, so `eth_chainId` never waits on the server. */
  readonly name: string;
  readonly rdns: string;
  /** A data: URI. Uniswap's picker shows it next to the name. */
  readonly icon: string;
}

/** The global the server calls to deliver a reply into the page. */
export const WALLET_REPLY_GLOBAL = "__froggyWalletReply";
/** The global the server calls to raise an EIP-1193 event in the page. */
export const WALLET_EVENT_GLOBAL = "__froggyWalletEvent";

const FROGGY_ICON = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#1f6f43"/><circle cx="22" cy="24" r="9" fill="#fff"/><circle cx="42" cy="24" r="9" fill="#fff"/><circle cx="23" cy="25" r="4" fill="#111"/><circle cx="41" cy="25" r="4" fill="#111"/><path d="M16 42q16 12 32 0" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round"/></svg>'
)}`;

export const DEFAULT_PROVIDER_IDENTITY = {
  icon: FROGGY_ICON,
  name: "Froggy",
  rdns: "app.froggy.wallet",
} as const;

/**
 * The source, with the options baked in as JSON literals so nothing is
 * interpolated as code. Methods outside `WalletRpcMethod` are refused in the
 * page with 4200 and never reach the bridge.
 */
export const walletProviderScript = (
  options: WalletProviderOptions
): string => {
  const config = JSON.stringify({
    binding: options.binding,
    chainIdHex: options.chainIdHex,
    eventGlobal: WALLET_EVENT_GLOBAL,
    icon: options.icon,
    limit: BROWSER_WALLET_CALL_LIMIT,
    methods: WalletRpcMethod.literals,
    name: options.name,
    rdns: options.rdns,
    replyGlobal: WALLET_REPLY_GLOBAL,
  });
  return `(() => {
  const config = ${config};
  if (window.__froggyWalletInstalled) { return; }
  const bridge = window[config.binding];
  if (typeof bridge !== "function") { return; }
  try { delete window[config.binding]; } catch (_) { /* fine */ }
  Object.defineProperty(window, "__froggyWalletInstalled", { value: true, configurable: false, writable: false });

  const pending = new Map();
  const listeners = new Map();
  let accounts = [];
  let chainId = config.chainIdHex;
  let sequence = 0;

  const rpcError = (code, message, data) => {
    const error = new Error(message);
    error.code = code;
    if (data !== undefined) { error.data = data; }
    return error;
  };
  const emit = (event, ...args) => {
    const set = listeners.get(event);
    if (!set) { return; }
    for (const handler of [...set]) {
      try { handler(...args); } catch (_) { /* a listener's failure is its own */ }
    }
  };

  const request = (args) => {
    if (!args || typeof args !== "object" || typeof args.method !== "string") {
      return Promise.reject(rpcError(-32600, "Expected { method, params }."));
    }
    const method = args.method;
    if (method === "eth_chainId") { return Promise.resolve(chainId); }
    if (method === "net_version") { return Promise.resolve(String(parseInt(chainId, 16))); }
    if (!config.methods.includes(method)) {
      return Promise.reject(rpcError(4200, "Froggy does not support " + method + "."));
    }
    let params = args.params === undefined ? [] : args.params;
    if (!Array.isArray(params)) { params = [params]; }
    sequence += 1;
    const id = String(sequence) + "-" + Math.random().toString(36).slice(2, 10);
    let payload;
    try {
      payload = JSON.stringify({ v: 1, id, method, params });
    } catch (_) {
      return Promise.reject(rpcError(-32602, "Parameters must be JSON."));
    }
    if (payload.length > config.limit) {
      return Promise.reject(rpcError(-32602, "Request too large for Froggy."));
    }
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject, method });
      try { bridge(payload); } catch (error) {
        pending.delete(id);
        reject(rpcError(4900, "Froggy is not connected."));
      }
    });
  };

  const provider = {
    isFroggy: true,
    request,
    on(event, handler) {
      if (!listeners.has(event)) { listeners.set(event, new Set()); }
      listeners.get(event).add(handler);
      return provider;
    },
    addListener(event, handler) { return provider.on(event, handler); },
    once(event, handler) {
      const wrapped = (...args) => { provider.removeListener(event, wrapped); handler(...args); };
      return provider.on(event, wrapped);
    },
    removeListener(event, handler) {
      const set = listeners.get(event);
      if (set) { set.delete(handler); }
      return provider;
    },
    off(event, handler) { return provider.removeListener(event, handler); },
    removeAllListeners(event) {
      if (event === undefined) { listeners.clear(); } else { listeners.delete(event); }
      return provider;
    },
    isConnected() { return true; },
    enable() { return request({ method: "eth_requestAccounts" }); },
    send(methodOrPayload, paramsOrCallback) {
      if (typeof methodOrPayload === "string") {
        return request({ method: methodOrPayload, params: paramsOrCallback });
      }
      if (typeof paramsOrCallback === "function") {
        return provider.sendAsync(methodOrPayload, paramsOrCallback);
      }
      return request(methodOrPayload);
    },
    sendAsync(payload, callback) {
      request(payload).then(
        (result) => callback(null, { id: payload.id, jsonrpc: "2.0", result }),
        (error) => callback(error, { id: payload.id, jsonrpc: "2.0", error })
      );
    },
    get chainId() { return chainId; },
    get networkVersion() { return String(parseInt(chainId, 16)); },
    get selectedAddress() { return accounts[0] || null; },
  };

  Object.defineProperty(window, config.replyGlobal, {
    configurable: false, enumerable: false, writable: false,
    value: (json) => {
      let reply;
      try { reply = JSON.parse(json); } catch (_) { return; }
      const waiter = pending.get(reply.id);
      if (!waiter) { return; }
      pending.delete(reply.id);
      if (reply.ok) {
        let result;
        try { result = JSON.parse(reply.result); } catch (_) { result = null; }
        if ((waiter.method === "eth_requestAccounts" || waiter.method === "eth_accounts") && Array.isArray(result)) {
          accounts = result;
        }
        waiter.resolve(result);
      } else {
        waiter.reject(rpcError(reply.error.code, reply.error.message));
      }
    },
  });
  Object.defineProperty(window, config.eventGlobal, {
    configurable: false, enumerable: false, writable: false,
    value: (json) => {
      let event;
      try { event = JSON.parse(json); } catch (_) { return; }
      let data;
      try { data = JSON.parse(event.data); } catch (_) { data = null; }
      if (event.event === "accountsChanged" && Array.isArray(data)) { accounts = data; }
      if (event.event === "chainChanged" && typeof data === "string") { chainId = data; }
      if (event.event === "disconnect") {
        accounts = [];
        for (const [id, waiter] of pending) {
          pending.delete(id);
          waiter.reject(rpcError(4900, "Froggy disconnected."));
        }
      }
      emit(event.event, data);
    },
  });

  const info = Object.freeze({
    uuid: (crypto && crypto.randomUUID) ? crypto.randomUUID() : "froggy-" + Math.random().toString(36).slice(2),
    name: config.name,
    icon: config.icon,
    rdns: config.rdns,
  });
  const announce = () => {
    window.dispatchEvent(new CustomEvent("eip6963:announceProvider", {
      detail: Object.freeze({ info, provider }),
    }));
  };
  window.addEventListener("eip6963:requestProvider", announce);
  try {
    Object.defineProperty(window, "ethereum", { value: provider, configurable: true, enumerable: true, writable: false });
  } catch (_) { /* a page that already froze window.ethereum keeps its own */ }
  announce();
  setTimeout(() => { emit("connect", { chainId }); }, 0);
})();`;
};
