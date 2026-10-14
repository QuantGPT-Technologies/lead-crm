import type { Role } from "@/lib/types";

export interface NavItem {
  label: string;
  href?: string;
  icon?: string;
  roles?: Role[];
  children?: NavItem[];
}

const STAFF: Role[] = ["admin", "manager"];

// Organize around daily work; every destination is directly visible.
export const NAV: NavItem[] = [
  {
    label: "Workspace",
    children: [
      { label: "Overview", href: "/dashboard", icon: "LayoutDashboard" },
      { label: "All leads", href: "/leads", icon: "Users" },
      { label: "Pipeline", href: "/leads/kanban", icon: "Columns3" },
      { label: "Follow-ups", href: "/followups", icon: "CalendarClock" },
      { label: "Opportunities", href: "/opportunities", icon: "Target" },
      { label: "Enrollments", href: "/enrolled", icon: "GraduationCap" },
    ],
  },
  {
    label: "Team operations",
    roles: STAFF,
    children: [
      { label: "Import leads", href: "/upload", icon: "Upload" },
      { label: "Distribute leads", href: "/distribute", icon: "Share2" },
      { label: "Assignments", href: "/allotment", icon: "ArrowLeftRight" },
    ],
  },
  {
    label: "Insights & outreach",
    children: [
      { label: "Reports", href: "/reports", icon: "BarChart3" },
      {
        label: "Team performance",
        href: "/reports/agents",
        icon: "Trophy",
        roles: STAFF,
      },
      { label: "Messages", href: "/communication", icon: "MessagesSquare" },
      {
        label: "Templates",
        href: "/communication/templates",
        icon: "FileText",
        roles: ["admin"],
      },
      { label: "Activity", href: "/activity", icon: "History" },
    ],
  },
  {
    label: "Administration",
    roles: ["admin"],
    children: [
      { label: "Team members", href: "/config/users", icon: "UserCog" },
      { label: "Data & stages", href: "/config/masters", icon: "Database" },
      { label: "Settings", href: "/config/settings", icon: "Settings" },
    ],
  },
];

export function navFor(role: Role): NavItem[] {
  const allowed = (i: NavItem) => !i.roles || i.roles.includes(role);
  const walk = (items: NavItem[]): NavItem[] =>
    items
      .filter(allowed)
      .map((i) => (i.children ? { ...i, children: walk(i.children) } : i));
  return walk(NAV);
}

export function flatNav(items: NavItem[]): { label: string; href: string }[] {
  return items.flatMap((i) => [
    ...(i.href ? [{ label: i.label, href: i.href }] : []),
    ...(i.children ? flatNav(i.children) : []),
  ]);
}
