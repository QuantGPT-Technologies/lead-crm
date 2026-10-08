/* Firebase Cloud Messaging service worker: shows follow-up reminders when the CRM tab is closed. */
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js");

// Config is passed in the registration URL by src/components/push-register.tsx
const params = new URL(self.location.href).searchParams;
firebase.initializeApp({
  apiKey: params.get("apiKey"),
  authDomain: params.get("authDomain"),
  projectId: params.get("projectId"),
  messagingSenderId: params.get("messagingSenderId"),
  appId: params.get("appId"),
});

// Messages are sent as data-only so this handler controls exactly one notification per reminder.
firebase.messaging().onBackgroundMessage((payload) => {
  const data = payload.data || {};
  self.registration.showNotification(data.title || "Follow-up due", {
    body: data.body || "",
    icon: "/favicon.ico",
    data: { url: data.url || "/followups" },
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data.url));
});
