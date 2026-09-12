import {
  BookmarkIcon,
  CompassIcon,
  HomeIcon,
  PlugIcon,
  SettingsIcon,
  WalletIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly to: "/" | "/watchlist";
}
interface SecondaryItem {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly to: "/explore" | "/wallet" | "/agents" | "/settings";
}

/** Two daily destinations. Money and tools remain reachable from the workspace. */
export const NAV_ITEMS: readonly NavItem[] = [
  { icon: HomeIcon, label: "Home", to: "/" },
  { icon: BookmarkIcon, label: "Watchlist", to: "/watchlist" },
];
export const SECONDARY_ITEMS: readonly SecondaryItem[] = [
  { icon: WalletIcon, label: "Your money", to: "/wallet" },
  { icon: CompassIcon, label: "Tools", to: "/explore" },
  { icon: PlugIcon, label: "Connections", to: "/agents" },
  { icon: SettingsIcon, label: "Account", to: "/settings" },
];
