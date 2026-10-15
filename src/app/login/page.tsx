import { ArrowUpRight, Leaf, ShieldCheck } from "lucide-react";
import { env, requireGlobalLogin, requireOtp } from "@/lib/env";
import { readSigned } from "@/lib/signed-cookie";
import { one, type SearchParams } from "@/lib/utils";
import { LoginFlow } from "./login-flow";
import { BrandLogo } from "@/components/brand-logo";
export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const useGlobal = requireGlobalLogin();
  const globalDone = useGlobal
    ? !!(await readSigned("crm_global").catch(() => null))
    : true;
  const next = one(sp.next);
  return (
    <main className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <section className="login-story relative hidden flex-col justify-between overflow-hidden p-12 lg:flex xl:p-16">
        <div className="relative z-10 flex items-center gap-3">
            <BrandLogo size={44} />
            <span className="whitespace-nowrap text-xl font-semibold tracking-tight">
            {env.appName}
          </span>
        </div>
        <div className="relative z-10 my-12 max-w-lg">
          <p className="mb-6 text-[10px] uppercase tracking-[.22em] text-[#c4d5ae]">
            People first. Progress follows.
          </p>
          <h2 className="login-display text-6xl xl:text-7xl">
            Good relationships.
            <br />
            <span className="italic text-[#d9e5b8]">Great possibilities.</span>
          </h2>
          <p className="mt-8 max-w-sm text-sm leading-7 text-[#d4ded0]">
            A calmer place to connect with students, nurture opportunities, and
            build what comes next.
          </p>
          <div className="mt-12 max-w-sm rounded-2xl border border-white/15 bg-white/5 p-6">
            <div className="mb-5 flex items-center justify-between text-xs">
              <span className="text-white/65">Your next chapter</span>
              <ArrowUpRight size={16} />
            </div>
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#d9e5b8] text-[#254b37]">
                <Leaf size={20} />
              </span>
              <div>
                <p className="font-semibold">Small steps. Meaningful growth.</p>
                <p className="mt-1 text-xs text-white/60">
                  One conversation at a time.
                </p>
              </div>
            </div>
          </div>
        </div>
        <div className="relative z-10 flex items-center justify-between text-[11px] text-white/55">
          <span>{env.companyName}</span>
          <span className="flex items-center gap-2">
            <ShieldCheck size={14} /> A secure team workspace
          </span>
        </div>
      </section>
      <section className="flex min-w-0 flex-col justify-between px-6 py-8 sm:px-12 lg:px-16 xl:px-24">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="flex items-center gap-2 whitespace-nowrap text-sm font-bold sm:text-lg lg:invisible">
              <BrandLogo size={32} />
            {env.appName}
          </span>
          <span className="rounded-full border border-line px-3 py-1.5 text-[10px] text-muted">
            Team workspace
          </span>
        </div>
        <div className="my-14">
          <LoginFlow
            useGlobal={useGlobal}
            useOtp={requireOtp()}
            initialStep={globalDone ? "user" : "global"}
            next={next && /^\/(?!\/)[^\\\s]*$/.test(next) ? next : "/dashboard"}
            notice={
              one(sp.error) === "inactive"
                ? "Your account is not active. Contact your administrator."
                : undefined
            }
          />
        </div>
        <p className="text-center text-[11px] leading-6 text-muted">
          © {new Date().getFullYear()} {env.companyName}
          <br />A workspace for meaningful connections.
        </p>
      </section>
    </main>
  );
}
