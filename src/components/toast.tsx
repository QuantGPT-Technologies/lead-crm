"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { CheckCircle2, CircleAlert, X } from "lucide-react";

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
export function notify(
  res: { error?: string; message?: string } | undefined,
  okText = "Saved",
) {
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
      const t = {
        id: Date.now() + Math.random(),
        ...(e as CustomEvent).detail,
      } as Toast;
      setItems((list) => [...list, t]);
      setTimeout(
        () => setItems((list) => list.filter((x) => x.id !== t.id)),
        t.kind === "error" ? 6000 : 3000,
      );
    };
    window.addEventListener(EVENT, onToast);
    return () => window.removeEventListener(EVENT, onToast);
  }, []);

  return (
    <div
      className="pointer-events-none fixed bottom-5 right-5 z-[100] flex max-w-[calc(100vw-40px)] flex-col gap-2"
      role="status"
      aria-live="polite"
    >
      {items.map((t) => (
        <div
          key={t.id}
          className={cn(
            "pointer-events-auto flex max-w-sm items-center gap-3 rounded-xl border border-line bg-card px-4 py-3.5 text-xs font-semibold shadow-lg",
            t.kind === "error" ? "text-red-600" : "text-brand",
          )}
        >
          {t.kind === "error" ? (
            <CircleAlert size={18} className="shrink-0" />
          ) : (
            <CheckCircle2 size={18} className="shrink-0" />
          )}
          <span>{t.text}</span>
          <button
            type="button"
            onClick={() =>
              setItems((list) => list.filter((x) => x.id !== t.id))
            }
            aria-label="Dismiss notification"
            className="ml-2 text-muted"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
