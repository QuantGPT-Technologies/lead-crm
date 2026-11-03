"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { fmtDateTime } from "@/lib/utils";

interface Notice { id: string; title: string; detail: string; at: string; href: string; urgent: boolean }
export function Notifications({ userId }: { userId: string }) {
  const [items, setItems] = useState<Notice[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [read, setRead] = useState<Set<string>>(new Set());
  useEffect(() => {
    let cancelled = false;
    let requestNumber = 0;
    const load = async () => {
      const request = ++requestNumber;
      try {
        const response = await fetch("/api/notifications", { cache: "no-store" });
        const result = await response.json();
        if (cancelled || request !== requestNumber) return;
        if (!response.ok) throw new Error(result.error ?? "Could not load notifications");
        setItems(result.items); setError("");
        try { const stored = JSON.parse(localStorage.getItem(`crm-notices:${userId}`) ?? "[]"); if (Array.isArray(stored)) setRead(new Set(stored)); } catch {}
      } catch { if (!cancelled) setError("Could not load notifications. Try refreshing."); }
    };
    void load();
    const refresh = () => { void load(); };
    window.addEventListener("focus", refresh);
    window.addEventListener("crm-toast", refresh);
    const timer = setInterval(() => { if (document.visibilityState === "visible") void load(); }, 60000);
    return () => { cancelled = true; clearInterval(timer); window.removeEventListener("focus", refresh); window.removeEventListener("crm-toast", refresh); };
  }, [userId]);
  const unread = items.filter(item => !read.has(item.id)).length;
  const markRead = () => {
    const ids = new Set(items.map(item => item.id));
    setRead(ids);
    try { localStorage.setItem(`crm-notices:${userId}`, JSON.stringify([...ids])); } catch {}
  };
  return <div className="relative">
    <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={`Notifications, ${unread} unread`} className="relative flex h-9 w-9 items-center justify-center rounded-xl hover:bg-soft"><Bell size={18} />{unread > 0 && <span className="absolute -right-1 -top-1 rounded-full bg-red-600 px-1 text-[10px] text-white">{unread}</span>}</button>
    {open && <section aria-label="Notifications" className="popover absolute right-0 top-12 w-[min(360px,90vw)] p-3">
      <div className="mb-2 flex items-center justify-between"><h2 className="font-bold">Notifications</h2><button type="button" onClick={markRead} className="text-xs text-brand">Mark all read</button><button type="button" onClick={() => setOpen(false)} aria-label="Close notifications">×</button></div>
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
      <div className="max-h-96 space-y-2 overflow-y-auto">{items.map(item => <Link key={item.id} href={item.href} onClick={() => setOpen(false)} className={`block rounded-lg border p-3 ${item.urgent ? "border-red-400" : "border-line"}`}>
        <p className="text-xs font-bold">{!read.has(item.id) && "• "}{item.title}</p><p className="mt-1 text-xs text-muted">{item.detail}</p><p className="mt-1 text-[10px] text-muted">{fmtDateTime(item.at)}</p>
      </Link>)}{!items.length && !error && <p className="p-3 text-xs text-muted">No follow-ups or recent lead updates.</p>}</div>
      <Link href="/followups" onClick={() => setOpen(false)} className="mt-3 block text-xs font-bold text-brand">View all follow-ups</Link>
    </section>}
  </div>;
}
