"use client";

import { useState } from "react";
import { BellRing } from "lucide-react";
import { toast } from "@/components/toast";
import { firebaseApp, firebaseConfig, isFirebaseConfigured, vapidKey } from "@/lib/firebase-client";

/** Menu item that turns on follow-up reminders (Firebase Cloud Messaging) for this browser. Hidden when Firebase is not configured. */
export function PushRegister() {
  const [busy, setBusy] = useState(false);
  if (!isFirebaseConfigured()) return null;

  async function enable() {
    setBusy(true);
    try {
      const { getMessaging, getToken, isSupported } = await import("firebase/messaging");
      if (!(await isSupported())) return toast("This browser does not support push notifications", "error");
      if ((await Notification.requestPermission()) !== "granted") return toast("Notifications are blocked for this site", "error");

      // the service worker reads its Firebase config from the query string (it cannot read env vars)
      const qs = new URLSearchParams(firebaseConfig as Record<string, string>).toString();
      const registration = await navigator.serviceWorker.register(`/firebase-messaging-sw.js?${qs}`);
      const token = await getToken(getMessaging(firebaseApp()), { vapidKey, serviceWorkerRegistration: registration });
      const res = await fetch("/api/push/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
      if (!res.ok) throw new Error((await res.json()).error ?? "Could not save device");
      toast("Follow-up reminders enabled on this device");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not enable reminders", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" onClick={enable} disabled={busy} className="flex w-full items-center gap-2 px-3 py-2 hover:bg-soft disabled:opacity-50">
      <BellRing size={15} /> {busy ? "Enabling..." : "Enable reminders"}
    </button>
  );
}
