/**
 * Three primary destinations, and everything else is secondary.
 *
 * Home is where work starts, resumes and reports back; Explore is where you
 * look things up and act on them without writing a sentence first; Wallet is
 * the money, what may be spent and by whom. A task is the organising unit, so
 * a conversation is something a task *has* rather than a place you go.
 *
 * The browser is deliberately absent: it is a contextual view inside a task,
 * and closing it never stops the work. Receipts belong to the Wallet, and
 * external assistants to Connections, because a destination per capability is
 * how a workspace becomes a dashboard.
 */

import {
  CompassIcon,
  HomeIcon,
  PlugIcon,
  SettingsIcon,
  WalletIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type NavPath = "/" | "/explore" | "/wallet";
type SecondaryPath = "/agents" | "/settings";

export interface NavItem {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly to: NavPath;
}

export interface SecondaryItem {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly to: SecondaryPath;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { icon: HomeIcon, label: "Home", to: "/" },
  { icon: CompassIcon, label: "Explore", to: "/explore" },
  { icon: WalletIcon, label: "Wallet", to: "/wallet" },
];

/** Reachable, and visibly not a destination: the foot of the rail. */
export const SECONDARY_ITEMS: readonly SecondaryItem[] = [
  { icon: PlugIcon, label: "Connections", to: "/agents" },
  { icon: SettingsIcon, label: "Account", to: "/settings" },
];
