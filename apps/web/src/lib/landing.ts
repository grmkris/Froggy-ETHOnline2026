/** Public entry points stay explicit so workspace URLs retain their auth gate. */
const LANDING_PATHS = [
  "/landing",
  "/landing/pond",
  "/landing/playground",
  "/landing/glasshouse",
] as const;

export type LandingVariant = "pond" | "playground" | "glasshouse";

export const landingAsset = (name: string): string => `/froggy/landing/${name}`;

export const isLandingPath = (pathname: string): boolean =>
  LANDING_PATHS.some((path) => path === pathname.replace(/\/$/u, ""));
