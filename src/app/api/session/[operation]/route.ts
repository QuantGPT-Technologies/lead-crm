import { NextResponse } from "next/server";
import { clearSigned } from "@/lib/signed-cookie";
import { createClient } from "@/lib/supabase/server";
import { readTabSession } from "@/lib/tab-session";
import { TAB_COOKIE } from "@/lib/tab-session-constants";

export async function POST(request: Request, { params }: { params: Promise<{ operation: string }> }) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return new NextResponse(null, { status: 403 });
  const { operation } = await params;
  if (!["validate", "close"].includes(operation)) return new NextResponse(null, { status: 404 });
  const raw = await request.text();
  if (raw.length > 1024) return new NextResponse(null, { status: 400 });
  let key: unknown;
  try { key = JSON.parse(raw).key; } catch { return new NextResponse(null, { status: 400 }); }
  if (typeof key !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(key)) return new NextResponse(null, { status: 401 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: { session } } = await supabase.auth.getSession();
  const tab = user && session ? await readTabSession(user.id, session.access_token) : null;
  // A closing old tab must never sign out a newer login in another tab.
  if (!tab || tab.key !== key) return new NextResponse(null, { status: 401 });
  if (operation === "close") {
    await supabase.auth.signOut({ scope: "local" });
    await clearSigned(TAB_COOKIE, "crm_global", "crm_otp", "crm_phone_challenge");
  }
  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
