"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowUpRight,
  Bell,
  ChevronDown,
  Leaf,
  LogOut,
  Menu,
  Moon,
  Search,
  Sun,
  User,
} from "lucide-react";
import { signOut } from "@/app/login/actions";
import { PushRegister } from "@/components/push-register";
export function Topbar({
  pages,
  user,
  company,
  dueFollowups,
}: {
  pages: { label: string; href: string }[];
  user: { name: string; code: string; role: string };
  company: string;
  dueFollowups: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState("");
  const [menu, setMenu] = useState<"search" | "user" | "nav" | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setMenu(null);
    };
    const keys = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setMenu("search");
      }
      if (e.key === "Escape") {
        setMenu(null);
        inputRef.current?.blur();
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", keys);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", keys);
    };
  }, []);
  const destinations = [
    ...pages,
    { label: "New lead", href: "/leads/new" },
    { label: "My profile", href: "/profile" },
    { label: "Search leads", href: "/search" },
  ];
  const matches = (
    q.trim()
      ? destinations.filter((p) =>
          p.label.toLowerCase().includes(q.trim().toLowerCase()),
        )
      : destinations.slice(0, 5)
  ).slice(0, 8);
  const current =
    destinations.find((p) => p.href === pathname)?.label ??
    (pathname.startsWith("/leads/") ? "Lead workspace" : "Workspace");
  const initials = user.name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  function toggleTheme() {
    const dark = document.documentElement.classList.toggle("dark");
    try {
      localStorage.setItem("theme", dark ? "dark" : "light");
    } catch {}
  }
  return (
    <header
      ref={ref}
      className="sticky top-0 z-30 flex h-[76px] items-center gap-4 border-b border-line bg-bg/95 px-4 backdrop-blur-sm lg:px-8"
    >
      <a href="#main-content" className="sr-only focus:not-sr-only">
        Skip to content
      </a>
      <div className="relative md:hidden">
        <button
          type="button"
          aria-label="Open navigation"
          aria-expanded={menu === "nav"}
          onClick={() => setMenu(menu === "nav" ? null : "nav")}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-line"
        >
          <Menu size={19} />
        </button>
        {menu === "nav" && (
          <nav
            aria-label="Mobile navigation"
            className="popover absolute left-0 top-12 max-h-[70vh] w-64 overflow-y-auto p-2"
          >
            {destinations.map((p) => (
              <Link
                key={p.href}
                href={p.href}
                onClick={() => setMenu(null)}
                className="nav-link"
                data-active={pathname === p.href}
              >
                {p.label}
              </Link>
            ))}
          </nav>
        )}
      </div>
      <div className="hidden min-w-0 items-center gap-2 lg:flex">
        <Leaf size={14} className="text-muted" />
        <span className="max-w-36 truncate text-xs text-muted">{company}</span>
        <span className="text-line">/</span>
        <span className="whitespace-nowrap text-xs font-semibold">
          {current}
        </span>
      </div>
      <form
        className="relative w-full max-w-sm lg:ml-auto"
        onSubmit={(e) => {
          e.preventDefault();
          if (!q.trim()) return;
          setMenu(null);
          router.push(
            matches[0]?.href ?? `/search?q=${encodeURIComponent(q.trim())}`,
          );
        }}
      >
        <Search
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
        />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setMenu("search");
          }}
          onFocus={() => setMenu("search")}
          placeholder="Search your workspace…"
          aria-label="Search pages and leads"
          className="input !h-10 !bg-card !pl-10 !pr-14"
        />
        <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-line px-1.5 py-0.5 text-[10px] text-muted sm:block">
          Ctrl K
        </kbd>
        {menu === "search" && (
          <div className="popover absolute left-0 right-0 top-12 p-2">
            <p className="eyebrow px-3 py-2">
              {q ? "Destinations" : "Jump to"}
            </p>
            {matches.map((p) => (
              <Link
                key={p.href}
                href={p.href}
                onClick={() => setMenu(null)}
                className="nav-link justify-between"
              >
                {p.label}
                <ArrowUpRight size={14} />
              </Link>
            ))}
            {q.trim() && (
              <Link
                href={`/search?q=${encodeURIComponent(q.trim())}`}
                onClick={() => setMenu(null)}
                className="nav-link border-t border-line text-brand"
              >
                Search leads for “{q.trim()}”
              </Link>
            )}
          </div>
        )}
      </form>
      <div className="ml-auto flex shrink-0 items-center gap-2 lg:ml-0">
        <Link
          href="/followups"
          aria-label={`${dueFollowups} follow-ups due`}
          className="relative flex h-9 w-9 items-center justify-center rounded-xl hover:bg-soft"
        >
          <Bell size={18} strokeWidth={1.7} />
          {dueFollowups > 0 && (
            <span className="absolute right-1 top-1 h-2 w-2 rounded-full border-2 border-bg bg-amber-600" />
          )}
        </Link>
        <button
          type="button"
          onClick={toggleTheme}
          aria-label="Toggle color theme"
          className="hidden h-9 w-9 items-center justify-center rounded-xl hover:bg-soft sm:flex"
        >
          <Sun size={17} className="dark:hidden" />
          <Moon size={17} className="hidden dark:block" />
        </button>
        <div className="relative border-l border-line pl-3">
          <button
            type="button"
            onClick={() => setMenu(menu === "user" ? null : "user")}
            aria-label="Account menu"
            aria-expanded={menu === "user"}
            className="flex items-center gap-2"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent)] text-xs font-bold">
              {initials}
            </span>
            <span className="hidden text-left xl:block">
              <span className="block text-xs font-semibold">{user.name}</span>
              <span className="text-[10px] capitalize text-muted">
                {user.role}
              </span>
            </span>
            <ChevronDown size={13} className="hidden text-muted sm:block" />
          </button>
          {menu === "user" && (
            <div className="popover absolute right-0 top-12 w-60 p-2">
              <div className="mb-1 border-b border-line px-3 py-3">
                <p className="font-semibold">{user.name}</p>
                <p className="mt-1 text-xs text-muted">
                  {user.code} · {user.role}
                </p>
              </div>
              <Link
                href="/profile"
                onClick={() => setMenu(null)}
                className="nav-link"
              >
                <User size={16} /> My profile
              </Link>
              <button
                type="button"
                onClick={toggleTheme}
                className="nav-link w-full"
              >
                <Moon size={16} /> Switch color theme
              </button>
              <PushRegister />
              <form action={signOut}>
                <button type="submit" className="nav-link w-full !text-red-600">
                  <LogOut size={16} /> Sign out
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
