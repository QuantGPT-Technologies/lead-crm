"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, LogOut, Menu, Moon, Plus, Search, Sun, User } from "lucide-react";
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
  const [q, setQ] = useState("");
  const [menu, setMenu] = useState<"search" | "user" | "nav" | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setMenu(null);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  function toggleTheme() {
    // the <html> class is the source of truth (set before paint in the root layout)
    const next = document.documentElement.classList.toggle("dark");
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {}
  }

  const matches = q.trim() ? pages.filter((p) => p.label.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8) : [];
  const initials = user.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  return (
    <header ref={ref} className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-card px-4">
      <div className="relative md:hidden">
        <button type="button" aria-label="Open menu" onClick={() => setMenu(menu === "nav" ? null : "nav")} className="flex h-9 w-9 items-center justify-center rounded-md bg-soft">
          <Menu size={18} />
        </button>
        {menu === "nav" && (
          <div className="absolute left-0 top-11 max-h-[70vh] w-56 overflow-y-auto rounded-md border border-line bg-card py-1 shadow-xl">
            {pages.map((p) => (
              <Link key={p.href} href={p.href} onClick={() => setMenu(null)} className="block px-3 py-2 font-semibold hover:bg-soft">
                {p.label}
              </Link>
            ))}
          </div>
        )}
      </div>

      <form
        className="relative w-full max-w-xs"
        onSubmit={(e) => {
          e.preventDefault();
          if (!q.trim()) return;
          setMenu(null);
          router.push(matches[0]?.href ?? `/search?q=${encodeURIComponent(q.trim())}`);
        }}
      >
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setMenu("search");
          }}
          onFocus={() => setMenu("search")}
          placeholder="Search pages, menus, leads..."
          aria-label="Search pages and leads"
          className="input !pl-9"
        />
        {menu === "search" && q.trim() && (
          <div className="absolute left-0 right-0 top-11 rounded-md border border-line bg-card py-1 shadow-xl">
            {matches.map((p) => (
              <Link key={p.href} href={p.href} onClick={() => setMenu(null)} className="block px-3 py-2 hover:bg-soft">
                {p.label}
              </Link>
            ))}
            <Link href={`/search?q=${encodeURIComponent(q.trim())}`} onClick={() => setMenu(null)} className="block px-3 py-2 font-semibold text-brand hover:bg-soft">
              Search leads for “{q.trim()}”
            </Link>
          </div>
        )}
      </form>

      <div className="ml-auto flex items-center gap-3">
        <Link href="/leads/new" title="Add new lead" aria-label="Add new lead" className="flex h-9 w-9 items-center justify-center rounded-md bg-soft text-brand hover:brightness-95">
          <Plus size={18} />
        </Link>
        <div className="hidden text-right leading-tight sm:block">
          <p className="font-bold">{user.name}</p>
          <p className="text-xs text-muted">{user.code}</p>
          <p className="text-xs font-bold uppercase text-brand">{company}</p>
        </div>
        <Link href="/followups" title="Follow-ups due" aria-label={`${dueFollowups} follow-ups due`} className="relative flex h-9 w-9 items-center justify-center rounded-full border border-line hover:bg-soft">
          <Bell size={16} />
          {dueFollowups > 0 && (
            <span className="absolute -right-1 -top-1 min-w-4.5 rounded-full bg-red-500 px-1 text-center text-[10px] font-bold leading-[18px] text-white">
              {dueFollowups > 99 ? "99+" : dueFollowups}
            </span>
          )}
        </Link>
        <button type="button" onClick={toggleTheme} aria-label="Toggle dark mode" className="flex h-9 w-9 items-center justify-center rounded-full border border-line hover:bg-soft">
          <Sun size={16} className="dark:hidden" />
          <Moon size={16} className="hidden dark:block" />
        </button>
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenu(menu === "user" ? null : "user")}
            aria-label="Account menu"
            className="bg-brand-gradient flex h-9 w-9 items-center justify-center rounded-full text-xs font-extrabold text-white"
          >
            {initials}
          </button>
          {menu === "user" && (
            <div className="absolute right-0 top-11 w-48 rounded-md border border-line bg-card py-1 shadow-xl">
              <p className="border-b border-line px-3 py-2 text-xs uppercase text-muted">{user.role}</p>
              <Link href="/profile" onClick={() => setMenu(null)} className="flex items-center gap-2 px-3 py-2 hover:bg-soft">
                <User size={15} /> My Profile
              </Link>
              <PushRegister />
              <form action={signOut}>
                <button type="submit" className="flex w-full items-center gap-2 px-3 py-2 text-red-600 hover:bg-soft">
                  <LogOut size={15} /> Sign out
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
