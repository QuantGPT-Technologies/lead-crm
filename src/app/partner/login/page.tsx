import { Handshake } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { env } from "@/lib/env";
import { one, type SearchParams } from "@/lib/utils";
import { PartnerLoginFlow } from "./partner-login-flow";

const NOTICES: Record<string, string> = {
  inactive: "This partner account is not active. Contact the administrator.",
  unverified: "Finish verifying your email to continue: open the link in your invitation email.",
};

export default async function PartnerLoginPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const notice = one(sp.fresh) === "1" ? "Sign in again to open the partner portal in this tab." : NOTICES[one(sp.error) ?? ""];
  return (
    <main className="flex min-h-screen flex-col justify-between px-6 py-8 sm:px-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex items-center gap-2 whitespace-nowrap text-sm font-bold sm:text-lg">
          <BrandLogo size={32} /> {env.appName}
        </span>
        <span className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-[10px] text-muted">
          <Handshake size={12} /> Partner portal
        </span>
      </div>
      <div className="my-14">
        <PartnerLoginFlow notice={notice} />
      </div>
      <p className="text-center text-[11px] leading-6 text-muted">© {new Date().getFullYear()} {env.companyName}</p>
    </main>
  );
}
