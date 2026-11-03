"use client";

import { useEffect, useState } from "react";
import { TAB_STORAGE } from "@/lib/tab-session-constants";

type NavigationWindow = Window & { navigation?: EventTarget };
type NavigationEvent = Event & { navigationType?: string; destination?: { sameDocument?: boolean } };

export function WorkspaceGuard({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let disposed = false, checking = false, navigating = false;
    let key: string | null = null;
    try { key = sessionStorage.getItem(TAB_STORAGE); } catch { /* Storage denied: require a fresh sign-in. */ }
    const login = () => {
      try { sessionStorage.removeItem(TAB_STORAGE); } catch { /* Already unavailable. */ }
      window.location.replace("/login?fresh=1");
    };
    // Browsers can clone sessionStorage into windows opened with an opener.
    if (window.opener) { window.opener = null; login(); return; }
    if (!key) { login(); return; }

    const obscure = () => { document.documentElement.dataset.crmObscured = "true"; };
    if (document.visibilityState === "hidden" || !document.hasFocus()) obscure();
    const validate = async () => {
      if (checking || disposed) return;
      checking = true;
      try {
        const response = await fetch("/api/session/validate", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key }), cache: "no-store", signal: AbortSignal.timeout(10000) });
        if (disposed) return;
        if (response.status === 401 || response.status === 403) { obscure(); login(); return; }
        if (!response.ok) throw new Error("Session check unavailable");
        setReady(true); setUnavailable(false);
        if (document.visibilityState === "visible" && document.hasFocus()) delete document.documentElement.dataset.crmObscured;
      } catch {
        if (!disposed) { obscure(); setUnavailable(true); }
      } finally { checking = false; }
    };
    const visibility = () => { if (document.visibilityState === "hidden") obscure(); else void validate(); };
    const focus = () => { void validate(); };
    const navigation = (event: Event) => {
      const e = event as NavigationEvent;
      if (e.navigationType === "reload" || e.destination?.sameDocument === false) navigating = true;
    };
    const navigationError = () => { navigating = false; };
    const pageshow = () => { navigating = false; void validate(); };
    // For browsers without Navigation API, preserve actual link navigations/reloads where detectable.
    const link = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!event.defaultPrevented && target && (!target.target || target.target === "_self") && !target.download) navigating = true;
    };
    const hotkeys = (event: KeyboardEvent) => {
      const modifier = event.ctrlKey || event.metaKey;
      if (event.key === "F5" || (modifier && event.key.toLowerCase() === "r")) navigating = true;
      if ((modifier && ["c", "x", "p", "s"].includes(event.key.toLowerCase())) || event.key === "PrintScreen") event.preventDefault();
    };
    const prevent = (event: Event) => event.preventDefault();
    const preventExport = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (anchor && anchor.download !== "lead-upload-sample.csv" && (anchor.hasAttribute("download") || /^(data:|blob:)/i.test(anchor.href))) event.preventDefault();
    };
    const pagehide = (event: PageTransitionEvent) => {
      obscure();
      if (event.persisted || navigating) return;
      // pagehide is best effort. The per-tab storage check also prevents reopening with shared cookies.
      try { sessionStorage.removeItem(TAB_STORAGE); } catch { /* Tab storage is already gone. */ }
      const body = new Blob([JSON.stringify({ key })], { type: "application/json" });
      if (!navigator.sendBeacon("/api/session/close", body)) {
        void fetch("/api/session/close", { method: "POST", body, keepalive: true }).catch(() => {});
      }
    };
    const nav = (window as NavigationWindow).navigation;
    nav?.addEventListener("navigate", navigation);
    nav?.addEventListener("navigateerror", navigationError);
    if (!nav) document.addEventListener("click", link);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("focus", focus);
    window.addEventListener("blur", obscure);
    window.addEventListener("pageshow", pageshow);
    window.addEventListener("pagehide", pagehide);
    document.addEventListener("keydown", hotkeys, true);
    document.addEventListener("click", preventExport, true);
    const blocked = ["copy", "cut", "contextmenu", "dragstart"];
    blocked.forEach(name => document.addEventListener(name, prevent, true));
    void validate();
    const timer = setInterval(() => { if (document.visibilityState === "visible") void validate(); }, 30000);
    return () => {
      disposed = true; clearInterval(timer);
      nav?.removeEventListener("navigate", navigation);
      nav?.removeEventListener("navigateerror", navigationError);
      document.removeEventListener("click", link);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("focus", focus); window.removeEventListener("blur", obscure);
      window.removeEventListener("pageshow", pageshow); window.removeEventListener("pagehide", pagehide);
      document.removeEventListener("keydown", hotkeys, true);
      document.removeEventListener("click", preventExport, true);
      blocked.forEach(name => document.removeEventListener(name, prevent, true));
      delete document.documentElement.dataset.crmObscured;
    };
  }, []);

  return <div data-crm-guard>
    <div className="crm-print-block">Printing is disabled for this workspace.</div>
    <div className="crm-privacy-shield" role="status">{unavailable ? "Connection unavailable. Reconnecting securely…" : "CRM hidden while this window is inactive."}</div>
    {ready && !unavailable ? <div className="crm-protected-content">{children}</div> : <div className="flex min-h-screen items-center justify-center text-muted" role="status">{unavailable ? "Connection unavailable. Reconnecting securely…" : "Checking this tab’s session…"}</div>}
  </div>;
}
