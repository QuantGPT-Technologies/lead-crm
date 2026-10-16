import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { env, isSupabaseConfigured } from "@/lib/env";

const PUBLIC = ["/login", "/setup", "/api/cron"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/"));

  if (!isSupabaseConfigured()) {
    return pathname === "/setup" ? NextResponse.next() : NextResponse.redirect(new URL("/setup", request.url));
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // Refreshes the session cookie when it is about to expire.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let signedIn = !!user;
  if (user) {
    const { data: role, error } = await supabase.rpc("app_role");
    if (error || !role) {
      await supabase.auth.signOut({ scope: "local" });
      signedIn = false;
    }
  }
  const redirectWithCookies = (url: URL) => {
    const result = NextResponse.redirect(url);
    response.cookies.getAll().forEach(cookie => result.cookies.set(cookie));
    return result;
  };

  // A server action posted after the session ended is let through: every action checks the
  // session itself and answers with a redirect to /login that the page can follow. Redirecting
  // the POST here instead would hand the browser an HTML page it cannot read as an action result.
  if (!signedIn && !isPublic && request.method === "POST" && request.headers.has("next-action")) return response;

  if (!signedIn && !isPublic) {
    const url = new URL("/login", request.url);
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return redirectWithCookies(url);
  }
  if (signedIn && pathname === "/login") {
    return redirectWithCookies(new URL("/dashboard", request.url));
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|firebase-messaging-sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
