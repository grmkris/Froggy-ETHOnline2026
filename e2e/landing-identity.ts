import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";

export type LandingIdentityState =
  | "signed-out"
  | "signed-in"
  | "loading"
  | "failed";

/** Exercise the real route/CTA against controlled identity bridge states. */
export const landingIdentity = async (
  page: Page,
  initial: LandingIdentityState
) => {
  await page.route("**/src/lib/privy.tsx", async (route) => {
    const response = await route.fetch();
    const original = await response.text();
    const hook = "return useContext(IdentityContext);";
    expect(original).toContain(hook);
    const body = original
      .replace(
        "export const useIdentity",
        `let landingFixtureState = sessionStorage.getItem("landing-test-identity") ?? ${JSON.stringify(initial)};\nexport const useIdentity`
      )
      .replace(
        hook,
        `
      const original = useContext(IdentityContext);
      const [state, setState] = useState(landingFixtureState);
      useEffect(() => {
        const change = event => { landingFixtureState = event.detail; sessionStorage.setItem("landing-test-identity", event.detail); setState(event.detail); };
        window.addEventListener("landing-test-identity", change);
        return () => window.removeEventListener("landing-test-identity", change);
      }, []);
      return { ...original, stubbed: false,
        status: state === "failed" || state === "loading" ? state : "ready",
        ready: state !== "loading", authenticated: state === "signed-in",
        login: () => window.dispatchEvent(new Event("landing-test-login"))
      };
    `
      );
    await route.fulfill({ response, body });
  });
};

export const changeLandingIdentity = async (
  page: Page,
  state: LandingIdentityState
) => {
  await page.evaluate(
    (next) =>
      window.dispatchEvent(
        new CustomEvent("landing-test-identity", { detail: next })
      ),
    state
  );
};
