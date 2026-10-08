import type { Role } from "@/lib/types";

export interface NavItem {
  label: string;
  href?: string;
  icon?: string;
  roles?: Role[];
  children?: NavItem[];
}

const STAFF: Role[] = ["admin", "manager"];

export const NAV: NavItem[] = [
  { label: "DASHBOARD", children: [{ label: "Overview", href: "/dashboard", icon: "LayoutDashboard" }] },
  {
    label: "MAIN",
    children: [
      { label: "Search Lead", href: "/search", icon: "Search" },
      { label: "Upload", href: "/upload", icon: "Upload", roles: STAFF },
      { label: "Distribute", href: "/distribute", icon: "Share2", roles: STAFF },
      { label: "Data Allotment", href: "/allotment", icon: "ArrowLeftRight", roles: STAFF },
      {
        label: "Lead",
        icon: "Users",
        children: [
          { label: "Lead Kanban", href: "/leads/kanban" },
          { label: "Lead List", href: "/leads" },
          { label: "Add New Lead", href: "/leads/new" },
        ],
      },
      { label: "Followups", href: "/followups", icon: "CalendarClock" },
      { label: "Enrolled", href: "/enrolled", icon: "GraduationCap" },
      { label: "Opportunity", href: "/opportunities", icon: "Target" },
    ],
  },
  {
    label: "REPORTS",
    children: [
      { label: "Lead Reports", href: "/reports", icon: "BarChart3" },
      { label: "Agent Performance", href: "/reports/agents", icon: "Trophy", roles: STAFF },
    ],
  },
  {
    label: "COMMUNICATION",
    children: [
      { label: "Message Log", href: "/communication", icon: "MessagesSquare" },
      { label: "Templates", href: "/communication/templates", icon: "FileText", roles: ["admin"] },
    ],
  },
  {
    label: "CONFIGURATION",
    roles: ["admin"],
    children: [
      { label: "Users", href: "/config/users", icon: "UserCog" },
      { label: "Masters", href: "/config/masters", icon: "Database" },
      { label: "Settings", href: "/config/settings", icon: "Settings" },
    ],
  },
  {
    label: "OTHERS",
    children: [
      { label: "Activity Log", href: "/activity", icon: "History" },
      { label: "My Profile", href: "/profile", icon: "CircleUser" },
    ],
  },
];

export function navFor(role: Role): NavItem[] {
  const allowed = (i: NavItem) => !i.roles || i.roles.includes(role);
  const walk = (items: NavItem[]): NavItem[] =>
    items.filter(allowed).map((i) => (i.children ? { ...i, children: walk(i.children) } : i));
  return walk(NAV);
}

export function flatNav(items: NavItem[]): { label: string; href: string }[] {
  return items.flatMap((i) => [...(i.href ? [{ label: i.label, href: i.href }] : []), ...(i.children ? flatNav(i.children) : [])]);
}
