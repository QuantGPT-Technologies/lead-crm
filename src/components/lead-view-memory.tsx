"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function LeadViewMemory({ userId }: { userId: string }) {
  const path = usePathname();
  const search = useSearchParams();
  const router = useRouter();
  useEffect(() => {
    if (!["/leads", "/leads/kanban"].includes(path)) return;
    const key = `crm-lead-view:${userId}:${path}`;
    try {
      const query = search.toString();
      const remembered = sessionStorage.getItem(key);
      if (!query && remembered) router.replace(`${path}?${remembered}`, { scroll: false });
      else sessionStorage.setItem(key, query);
    } catch { /* Browsers may disable session storage. URL filters still work. */ }
  }, [path, search, router, userId]);
  return null;
}
