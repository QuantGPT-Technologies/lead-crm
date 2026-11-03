import { getSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { flatNav, navFor } from "@/lib/nav";
import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";
import { WorkspaceGuard } from "@/components/workspace-guard";
import { Suspense } from "react";
import { LeadViewMemory } from "@/components/lead-view-memory";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile } = await getSession();
  const nav = navFor(profile.role);

  return (
    <WorkspaceGuard><Suspense><LeadViewMemory userId={profile.id} /></Suspense><div className="flex min-h-screen">
      <Sidebar nav={nav} appName={env.appName} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          pages={flatNav(nav)}
          user={{
            id: profile.id,
            name: profile.full_name,
            code: profile.emp_code,
            role: profile.role,
          }}
          company={env.companyName}
        />
        <main id="main-content" className="workspace-main min-w-0 flex-1">
          {children}
        </main>
      </div>
    </div></WorkspaceGuard>
  );
}
