"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardPaste, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/partner", label: "My leads", icon: Users },
  { href: "/partner/upload", label: "Add leads", icon: ClipboardPaste },
];

export function PartnerNav() {
  const pathname = usePathname();
  const active = (href: string) => (href === "/partner" ? pathname === "/partner" || pathname.startsWith("/partner/leads") : pathname.startsWith(href));
  return (
    <nav className="flex gap-1 rounded-xl bg-soft p-1" aria-label="Partner portal">
      {ITEMS.map(({ href, label, icon: Icon }) => (
        <Link key={href} href={href} aria-current={active(href) ? "page" : undefined}
          className={cn("flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold", active(href) ? "bg-card text-brand shadow-sm" : "text-muted hover:text-fg")}>
          <Icon size={14} /> {label}
        </Link>
      ))}
    </nav>
  );
}
