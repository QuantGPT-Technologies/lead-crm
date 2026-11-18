"use client";

import { useRouter } from "next/navigation";

// One pending hover at a time is enough: the pointer can only rest on one link.
let timer: ReturnType<typeof setTimeout> | undefined;

/**
 * Loads a page in the background once the user rests the pointer on (or focuses / touches) a
 * link to it, so the click opens it almost at once. Lead pages are dynamic, so Next.js does not
 * fully prefetch them on its own. A short delay skips links the pointer only passes over.
 * Usage: <Link href={href} {...hoverPrefetch(href)}>
 */
export function useHoverPrefetch(delay = 120) {
  const router = useRouter();
  return (href: string) => ({
    onMouseEnter: () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.prefetch(href), delay);
    },
    onMouseLeave: () => clearTimeout(timer),
    onFocus: () => router.prefetch(href),
    onTouchStart: () => router.prefetch(href),
  });
}
