import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { env, isSupabaseConfigured } from "@/lib/env";
import { TAB_COOKIE } from "@/lib/tab-session-constants";

const PUBLIC = ["/login", "/setup", "/api/cron", "/api/session", "/partner/login", "/partner/setup"];

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
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, {
          ...options,
          ...(options.maxAge === 0 ? {} : { maxAge: undefined, expires: undefined }),
        }));
      },
    },
  });

  // Refreshes the session cookie when it is about to expire. getClaims checks the token locally
  // when the project uses asymmetric signing keys, otherwise it asks Supabase Auth (like getUser).
  const { data: claimData } = await supabase.auth.getClaims();
  const user = claimData?.claims?.sub ? { id: claimData.claims.sub } : null;
  let signedIn = !!user && request.cookies.has(TAB_COOKIE);
  let partner = false;
  // The role lookup costs two extra database round trips, so it runs only where the answer is
  // needed: on the sign-in pages, to send an already signed-in user to the right workspace.
  // Everywhere else the page or action checks the account itself (getSession for staff,
  // getPartnerSession for partners), including inactive accounts and partners on staff pages.
  const loginPage = pathname === "/login" || pathname === "/partner/login";
  if (user && signedIn && loginPage) {
    const { data: role, error } = await supabase.rpc("app_role");
    // Partners have no staff role; they are let in only while active and verified.
    if (!error && !role) partner = (await supabase.rpc("partner_portal_access")).data === true;
    if (error || (!role && !partner)) {
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

  const partnerArea = pathname === "/partner" || pathname.startsWith("/partner/");
  if (!signedIn && !isPublic) {
    const url = new URL(partnerArea ? "/partner/login" : "/login", request.url);
    if (pathname !== "/" && !partnerArea) url.searchParams.set("next", pathname);
    return redirectWithCookies(url);
  }
  if (signedIn && (pathname === "/login" || pathname === "/partner/login") && request.nextUrl.searchParams.get("fresh") !== "1") {
    return redirectWithCookies(new URL(partner ? "/partner" : "/dashboard", request.url));
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|firebase-messaging-sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
