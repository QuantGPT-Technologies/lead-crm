import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Sends a push notification for every pending follow-up that is due in the next 15 minutes
 * (or already overdue) and has not been reminded yet.
 * Call it every 5-10 minutes from any scheduler (Vercel Cron, cron-job.org, Supabase pg_cron + pg_net):
 *   GET /api/cron/followup-reminders?secret=CRON_SECRET     (or header  Authorization: Bearer CRON_SECRET)
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  const given = new URL(request.url).searchParams.get("secret") ?? request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  const a = Buffer.from(secret);
  const b = Buffer.from(given);
  if (!secret || a.length !== b.length || !timingSafeEqual(a, b)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { NEXT_PUBLIC_FIREBASE_PROJECT_ID: projectId, FIREBASE_CLIENT_EMAIL: clientEmail, FIREBASE_PRIVATE_KEY: rawKey } = process.env;
  if (!projectId || !clientEmail || !rawKey) return NextResponse.json({ error: "Firebase admin keys are not configured" }, { status: 503 });
  if (!getApps().length) initializeApp({ credential: cert({ projectId, clientEmail, privateKey: rawKey.replace(/\\n/g, "\n") }) });

  const db = createAdminClient();
  const { data: tasks, error } = await db
    .from("tasks")
    .select("id, title, due_at, assigned_to, lead:leads(id, student_name)")
    .eq("status", "pending")
    .is("reminded_at", null)
    .not("assigned_to", "is", null)
    .lte("due_at", new Date(Date.now() + 15 * 60_000).toISOString())
    .limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!tasks?.length) return NextResponse.json({ reminded: 0 });

  const userIds = [...new Set(tasks.map((t) => t.assigned_to as string))];
  const { data: tokenRows } = await db.from("push_tokens").select("token, user_id").in("user_id", userIds);
  const tokensByUser = new Map<string, string[]>();
  tokenRows?.forEach((r) => tokensByUser.set(r.user_id, [...(tokensByUser.get(r.user_id) ?? []), r.token]));

  let sent = 0;
  const dead: string[] = [];
  for (const task of tasks) {
    const tokens = tokensByUser.get(task.assigned_to as string) ?? [];
    const lead = task.lead as unknown as { id: string; student_name: string } | null;
    if (tokens.length && lead) {
      const res = await getMessaging().sendEachForMulticast({
        tokens,
        data: { title: `Follow-up due: ${lead.student_name}`, body: task.title, url: `/leads/${lead.id}` },
      });
      sent += res.successCount;
      res.responses.forEach((r, i) => {
        if (r.error?.code === "messaging/registration-token-not-registered") dead.push(tokens[i]);
      });
    }
  }
  // mark all as handled so a user without a registered device is not retried forever
  await db.from("tasks").update({ reminded_at: new Date().toISOString() }).in("id", tasks.map((t) => t.id));
  if (dead.length) await db.from("push_tokens").delete().in("token", dead);

  return NextResponse.json({ reminded: tasks.length, notificationsSent: sent });
}
