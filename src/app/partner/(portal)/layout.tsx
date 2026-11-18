import Link from "next/link";
import { Handshake, LogOut } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { WorkspaceGuard } from "@/components/workspace-guard";
import { TabCheckScript } from "@/components/tab-check-script";
import { env } from "@/lib/env";
import { getPartnerSession } from "@/lib/partner-auth";
import { partnerSignOut } from "../login/actions";
import { PartnerNav } from "./partner-nav";

export default async function PartnerLayout({ children }: { children: React.ReactNode }) {
  const { partner } = await getPartnerSession();
  return (
    <>
    <TabCheckScript />
    <WorkspaceGuard loginPath="/partner/login?fresh=1">
      <div className="min-h-screen">
        <header className="border-b border-line bg-card">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <Link href="/partner" className="flex items-center gap-2 font-bold">
              <BrandLogo size={30} />
              <span className="hidden sm:inline">{env.appName}</span>
              <span className="flex items-center gap-1 rounded-full bg-soft px-2.5 py-1 text-[11px] font-semibold text-muted"><Handshake size={12} /> Partner</span>
            </Link>
            <PartnerNav />
            <div className="flex items-center gap-3 text-sm">
              <span className="text-right leading-tight">
                <span className="block font-semibold">{partner.full_name}</span>
                <span className="block text-xs text-muted">{partner.organization ?? partner.partner_code}</span>
              </span>
              <form action={partnerSignOut}>
                <button type="submit" className="ui-button inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-line px-3 text-xs font-semibold hover:bg-soft" aria-label="Sign out">
                  <LogOut size={14} /> <span className="hidden sm:inline">Sign out</span>
                </button>
              </form>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-7 sm:px-6">{children}</main>
      </div>
    </WorkspaceGuard>
    </>
  );
}
