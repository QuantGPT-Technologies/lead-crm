"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeftRight,
  ArrowUpRight,
  BarChart3,
  CalendarClock,
  Columns3,
  Database,
  FileText,
  GraduationCap,
  History,
  LayoutDashboard,
  Leaf,
  MessagesSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Settings,
  Share2,
  Target,
  Trophy,
  Upload,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { NavItem } from "@/lib/nav";
import { cn } from "@/lib/utils";
const ICONS: Record<string, LucideIcon> = {
  ArrowLeftRight,
  BarChart3,
  CalendarClock,
  Columns3,
  Database,
  FileText,
  GraduationCap,
  History,
  LayoutDashboard,
  MessagesSquare,
  Settings,
  Share2,
  Target,
  Trophy,
  Upload,
  UserCog,
  Users,
};
export function Sidebar({ nav, appName }: { nav: NavItem[]; appName: string }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const active = (href: string) =>
    pathname === href ||
    (href === "/leads" &&
      /^\/leads\/[^/]+$/.test(pathname) &&
      !["/leads/kanban", "/leads/new"].includes(pathname));
  return (
    <aside
      className={cn(
        "workspace-sidebar sticky top-0 hidden h-screen shrink-0 flex-col border-r border-line md:flex",
        collapsed && "!w-[76px]",
      )}
    >
      <div className={cn("flex h-24 items-center px-5", collapsed && "!px-4")}>
        <Link
          href="/dashboard"
          className="flex min-w-0 items-center gap-3"
          aria-label={appName}
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand text-white dark:text-bg">
            <Leaf size={21} strokeWidth={1.6} />
          </span>
          {!collapsed && (
            <div>
              <span className="text-[17px] font-extrabold tracking-tight">
                {appName}
              </span>
              <p className="mt-0.5 text-[10px] tracking-wide text-muted">
                A little closer. Every day.
              </p>
            </div>
          )}
        </Link>
      </div>
      <div className={cn("px-4 pb-4", collapsed && "px-3")}>
        <Link
          href="/leads/new"
          className="ui-button flex h-10 items-center justify-center gap-2 rounded-xl border border-brand/20 bg-card font-semibold text-brand"
          title="New lead"
        >
          <Plus size={16} />
          {!collapsed && "New lead"}
        </Link>
      </div>
      <nav
        aria-label="Main navigation"
        className="flex-1 space-y-5 overflow-y-auto px-3 pb-5"
      >
        {nav.map((group) => (
          <div key={group.label}>
            {!collapsed && <p className="eyebrow mb-2 px-3">{group.label}</p>}
            <div className="space-y-1">
              {group.children?.map((item) => {
                const Icon = ICONS[item.icon ?? ""] ?? Users;
                return (
                  <Link
                    key={item.href}
                    href={item.href!}
                    className={cn(
                      "nav-link",
                      collapsed && "justify-center !px-0",
                    )}
                    data-active={active(item.href!)}
                    aria-current={active(item.href!) ? "page" : undefined}
                    title={collapsed ? item.label : undefined}
                  >
                    <Icon size={17} strokeWidth={1.7} />
                    {!collapsed && (
                      <>
                        <span className="flex-1">{item.label}</span>
                        {active(item.href!) && (
                          <span className="h-1.5 w-1.5 rounded-full bg-brand" />
                        )}
                      </>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t border-line p-3">
        {!collapsed && (
          <Link
            href="/followups"
            className="mb-3 flex items-center justify-between rounded-xl bg-[var(--accent)] p-3 text-xs font-semibold"
          >
            Make your next move
            <ArrowUpRight size={15} />
          </Link>
        )}
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="nav-link w-full justify-center text-xs"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <PanelLeftOpen size={17} />
          ) : (
            <>
              <PanelLeftClose size={17} /> Collapse sidebar
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
