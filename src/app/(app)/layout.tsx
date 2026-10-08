import { getSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { flatNav, navFor } from "@/lib/nav";
import { todayBounds } from "@/lib/utils";
import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, profile } = await getSession();
  const nav = navFor(profile.role);

  const { count: dueFollowups } = await supabase
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("assigned_to", profile.id)
    .eq("status", "pending")
    .lt("due_at", todayBounds().end.toISOString()); // overdue + due today

  return (
    <div className="flex min-h-screen">
      <Sidebar nav={nav} appName={env.appName} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          pages={flatNav(nav)}
          user={{ name: profile.full_name, code: profile.emp_code, role: profile.role }}
          company={env.companyName}
          dueFollowups={dueFollowups ?? 0}
        />
        <main className="min-w-0 flex-1 p-4">{children}</main>
      </div>
    </div>
  );
}
