"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface Toast {
  id: number;
  text: string;
  kind: "ok" | "error";
}

const EVENT = "crm-toast";

export function toast(text: string, kind: Toast["kind"] = "ok") {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { text, kind } }));
}

/** Shows the result of a server action. Returns true when it succeeded. */
export function notify(res: { error?: string; message?: string } | undefined, okText = "Saved") {
  if (res?.error) {
    toast(res.error, "error");
    return false;
  }
  toast(res?.message || okText);
  return true;
}

export function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);

  useEffect(() => {
    const onToast = (e: Event) => {
      const t = { id: Date.now() + Math.random(), ...(e as CustomEvent).detail } as Toast;
      setItems((list) => [...list, t]);
      setTimeout(() => setItems((list) => list.filter((x) => x.id !== t.id)), t.kind === "error" ? 6000 : 3000);
    };
    window.addEventListener(EVENT, onToast);
    return () => window.removeEventListener(EVENT, onToast);
  }, []);

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex flex-col gap-2" role="status" aria-live="polite">
      {items.map((t) => (
        <div
          key={t.id}
          className={cn(
            "pointer-events-auto max-w-sm rounded-md px-4 py-2.5 text-sm font-semibold text-white shadow-lg",
            t.kind === "error" ? "bg-red-600" : "bg-emerald-600",
          )}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
