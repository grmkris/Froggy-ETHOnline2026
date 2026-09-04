/**
 * `Bun.WebView` is present at runtime in Bun 1.4.0 but absent from
 * `@types/bun@1.4.0`, so this declaration is the only type information that
 * exists for it. Verified against the runtime prototype rather than docs:
 *
 *   navigate evaluate screenshot cdp click type press scroll scrollTo resize
 *   goBack goForward reload close url title loading onNavigated
 *   onNavigationFailed
 *
 * Only the members this package actually uses are declared. Adding a member
 * here that has not been checked against the runtime would be inventing an API,
 * and the compiler would then vouch for it.
 *
 * Note the runtime/type mismatch on history: the prototype has `goBack` and
 * `goForward`, while Bun's own published types (when they land) call them
 * `back`/`forward`. We do not use either — `Page.getNavigationHistory` plus
 * `Page.navigateToHistoryEntry` over CDP is the version that cannot drift.
 */

declare global {
  namespace Bun {
    interface WebViewBackend {
      readonly argv?: readonly string[];
      readonly path?: string;
      readonly type: "chrome";
      /**
       * `false` stops Bun auto-connecting to an already-running Chrome via its
       * `DevToolsActivePort`. Attaching to the user's own browser would hand
       * the agent every cookie they have.
       */
      readonly url?: false | string;
    }

    interface WebViewOptions {
      readonly backend: WebViewBackend;
      readonly dataStore?: { readonly directory: string };
      readonly height?: number;
      readonly width?: number;
    }

    /**
     * Members are declared as readonly properties rather than methods so an
     * instance structurally satisfies the narrow `TabView` interface this
     * package consumes. Declaring them as methods would make every consumer
     * reach for a cast to bridge two descriptions of the same object.
     */
    class WebView extends EventTarget {
      constructor(options: WebViewOptions);
      /**
       * One in-flight call per view. A second while one is pending throws
       * `Invalid state: a cdp() is already pending`, which is why every command
       * in this package goes through a per-view queue.
       */
      readonly cdp: <T = unknown>(
        method: string,
        params?: Readonly<Record<string, unknown>>
      ) => Promise<T>;
      readonly close: () => void;
      readonly evaluate: <T = unknown>(source: string) => Promise<T>;
      readonly navigate: (url: string) => Promise<void>;
      readonly loading: boolean;
      readonly title: string;
      readonly url: string;
      static closeAll(): void;
    }
  }
}
