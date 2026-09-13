import {
  BookmarkIcon,
  CompassIcon,
  HomeIcon,
  InboxIcon,
  HistoryIcon,
  PlugIcon,
  SettingsIcon,
  WalletIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly to: "/" | "/inbox" | "/watchlist";
}
interface SecondaryItem {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly to: "/explore" | "/wallet" | "/agents" | "/settings" | "/activity";
}

/** Daily destinations, with account and tools one level behind them. */
export const NAV_ITEMS: readonly NavItem[] = [
  { icon: HomeIcon, label: "Home", to: "/" },
  { icon: InboxIcon, label: "Inbox", to: "/inbox" },
  { icon: BookmarkIcon, label: "Watchlist", to: "/watchlist" },
];
export const SECONDARY_ITEMS: readonly SecondaryItem[] = [
  { icon: WalletIcon, label: "Your money", to: "/wallet" },
  { icon: CompassIcon, label: "Tools", to: "/explore" },
  { icon: HistoryIcon, label: "Activity", to: "/activity" },
  { icon: PlugIcon, label: "Connections", to: "/agents" },
  { icon: SettingsIcon, label: "Account", to: "/settings" },
];
