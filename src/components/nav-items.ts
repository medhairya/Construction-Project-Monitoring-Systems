import type { Role } from "@/lib/domain/types";

export type NavIcon =
  | "dashboard"
  | "projects"
  | "new"
  | "inbox"
  | "escalations"
  | "execution"
  | "admin";

export interface NavItem {
  href: string;
  label: string;
  icon: NavIcon;
  roles: Role[];
}

const ALL: Role[] = ["MINISTRY", "DEPT_HEAD", "DEPT_OPERATOR", "SITE_ENGINEER", "SUPER_ADMIN"];

export const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard", roles: ALL },
  { href: "/projects", label: "Projects", icon: "projects", roles: ALL },
  { href: "/projects/new", label: "Create Proposal", icon: "new", roles: ["MINISTRY", "SUPER_ADMIN"] },
  { href: "/inbox", label: "Dept Inbox", icon: "inbox", roles: ["MINISTRY", "DEPT_HEAD", "DEPT_OPERATOR", "SUPER_ADMIN"] },
  { href: "/escalations", label: "Escalations", icon: "escalations", roles: ALL },
  { href: "/my-sites", label: "My Sites", icon: "execution", roles: ["SITE_ENGINEER"] },
  { href: "/admin", label: "Admin & Demo Clock", icon: "admin", roles: ["SUPER_ADMIN", "MINISTRY"] },
];

export function NAV_FOR_ROLE(role: Role): NavItem[] {
  return NAV.filter((n) => n.roles.includes(role));
}
