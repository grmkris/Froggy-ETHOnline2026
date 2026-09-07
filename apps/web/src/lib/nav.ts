/**
 * The five places, in the order they sit in the sidebar and the tab bar.
 *
 * Chat is the front page; the rest are where the money is, what it can buy,
 * who else may spend it, and the account itself.
 */

import {
  BotIcon,
  MessageSquareIcon,
  SettingsIcon,
  SparklesIcon,
  WalletIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type NavPath = "/" | "/agents" | "/services" | "/settings" | "/wallet";

export interface NavItem {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly to: NavPath;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { icon: MessageSquareIcon, label: "Chat", to: "/" },
  { icon: WalletIcon, label: "Wallet", to: "/wallet" },
  { icon: SparklesIcon, label: "Services", to: "/services" },
  { icon: BotIcon, label: "Agents", to: "/agents" },
  { icon: SettingsIcon, label: "Settings", to: "/settings" },
];
