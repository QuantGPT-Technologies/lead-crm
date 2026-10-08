"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeftRight, BarChart3, BookOpenCheck, CalendarClock, ChevronDown, ChevronRight, ChevronsLeft, ChevronsRight, CircleUser,
  Database, FileText, GraduationCap, GripVertical, History, LayoutDashboard, MessagesSquare, Search, Settings, Share2, Target,
  Trophy, Upload, UserCog, Users, type LucideIcon,
} from "lucide-react";
import type { NavItem } from "@/lib/nav";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  ArrowLeftRight, BarChart3, CalendarClock, CircleUser, Database, FileText, GraduationCap, History, LayoutDashboard,
  MessagesSquare, Search, Settings, Share2, Target, Trophy, Upload, UserCog, Users,
};

const contains = (item: NavItem, path: string): boolean =>
  item.href === path || !!item.children?.some((c) => contains(c, path));

export function Sidebar({ nav, appName }: { nav: NavItem[]; appName: string }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  // only what the user explicitly opened/closed is stored; otherwise a group is open when it holds the current page
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const isOpen = (item: NavItem) => toggled[item.label] ?? contains(item, pathname);
  const toggle = (item: NavItem) => setToggled((t) => ({ ...t, [item.label]: !isOpen(item) }));

  if (collapsed) {
    return (
      <aside className="sticky top-0 hidden h-screen w-14 shrink-0 flex-col items-center gap-1 border-r border-line bg-card py-4 md:flex">
        <button type="button" onClick={() => setCollapsed(false)} aria-label="Expand menu" className="mb-3 text-muted hover:text-fg">
          <ChevronsRight size={18} />
        </button>
        {nav.flatMap((g) => g.children ?? []).map((item) => {
          const Icon = ICONS[item.icon ?? ""] ?? Users;
          const href = item.href ?? item.children?.[1]?.href ?? "#";
          return (
            <Link
              key={item.label}
              href={href}
              title={item.label}
              className={cn("flex h-9 w-9 items-center justify-center rounded-md hover:bg-soft", contains(item, pathname) ? "bg-soft text-brand" : "text-muted")}
            >
              <Icon size={17} />
            </Link>
          );
        })}
      </aside>
    );
  }

  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col overflow-y-auto border-r border-line bg-card md:flex">
      <div className="flex items-center justify-between px-4 py-4">
        <Link href="/dashboard" className="flex items-center gap-2 text-base font-extrabold">
          <span className="bg-brand-gradient flex h-8 w-8 items-center justify-center rounded-lg text-white">
            <BookOpenCheck size={17} />
          </span>
          {appName}
        </Link>
        <button type="button" onClick={() => setCollapsed(true)} aria-label="Collapse menu" className="text-muted hover:text-fg">
          <ChevronsLeft size={18} />
        </button>
      </div>

      <nav className="space-y-1.5 px-2 pb-6">
        {nav.map((group) => (
          <div key={group.label}>
            <button
              type="button"
              onClick={() => toggle(group)}
              aria-expanded={isOpen(group)}
              className="flex w-full items-center gap-2 rounded-md bg-soft px-2.5 py-2 text-[13px] font-bold tracking-wide"
            >
              <GripVertical size={13} className="text-muted" />
              <span className="flex-1 text-left">{group.label}</span>
              {isOpen(group) ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
            </button>

            {isOpen(group) && (
              <ul className="mt-1 space-y-0.5">
                {group.children?.map((item) => {
                  const Icon = ICONS[item.icon ?? ""] ?? Users;
                  if (!item.children) {
                    return (
                      <li key={item.label}>
                        <Link
                          href={item.href!}
                          className={cn(
                            "flex items-center gap-3 rounded-md px-3 py-2 font-semibold hover:bg-soft",
                            pathname === item.href ? "bg-soft text-brand" : "",
                          )}
                        >
                          <Icon size={16} className="text-muted" />
                          {item.label}
                        </Link>
                      </li>
                    );
                  }
                  return (
                    <li key={item.label}>
                      <button
                        type="button"
                        onClick={() => toggle(item)}
                        aria-expanded={isOpen(item)}
                        className={cn("flex w-full items-center gap-3 rounded-md px-3 py-2 font-semibold hover:bg-soft", isOpen(item) && "bg-soft")}
                      >
                        <Icon size={16} className="text-muted" />
                        <span className="flex-1 text-left">{item.label}</span>
                        {isOpen(item) ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                      </button>
                      {isOpen(item) && (
                        <ul className="py-1">
                          {item.children.map((c) => (
                            <li key={c.label}>
                              <Link
                                href={c.href!}
                                className={cn("block py-1.5 pl-11 pr-3 hover:text-brand", pathname === c.href ? "font-bold text-brand" : "text-muted")}
                              >
                                – {c.label}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ))}
      </nav>
    </aside>
  );
}
