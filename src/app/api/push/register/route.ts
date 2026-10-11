import { NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";

/** Saves this browser's FCM token against the signed-in user. */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { token } = (await request.json().catch(() => ({}))) as { token?: string };
  if (!token || typeof token !== "string" || token.length > 4096) return NextResponse.json({ error: "Invalid token" }, { status: 400 });

  // A browser's token moves to whoever signs in on it next (shared computer), which the signed-in
  // client may not do to another user's row; the user is verified above, so the service role writes it.
  const { error } = await createAdminClient().from("push_tokens").upsert({ token, user_id: user.id });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
