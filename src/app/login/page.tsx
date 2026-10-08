import { ShieldCheck } from "lucide-react";
import { env, requireGlobalLogin, requireOtp } from "@/lib/env";
import { readSigned } from "@/lib/signed-cookie";
import { one, type SearchParams } from "@/lib/utils";
import { LoginFlow } from "./login-flow";

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const useGlobal = requireGlobalLogin();
  const globalDone = useGlobal ? !!(await readSigned("crm_global").catch(() => null)) : true;
  const next = one(sp.next);

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="grid w-full max-w-6xl overflow-hidden rounded-xl bg-card shadow-xl md:min-h-[640px] md:grid-cols-2">
        <div
          className="bg-brand-diagonal relative hidden items-center justify-center text-white md:flex"
          style={{ clipPath: "polygon(0 0, 88% 0, 100% 100%, 0 100%)" }}
        >
          <div className="pr-16 text-center">
            <div className="mx-auto mb-6 flex h-28 w-28 items-center justify-center rounded-3xl bg-white/15 backdrop-blur">
              <ShieldCheck size={64} strokeWidth={1.5} />
            </div>
            <h2 className="text-3xl font-extrabold">{env.appName}</h2>
            <p className="mt-2 text-white/80">Secure sign in for your team</p>
          </div>
        </div>

        <div className="flex flex-col justify-between px-6 py-10 sm:px-14">
          <LoginFlow
            useGlobal={useGlobal}
            useOtp={requireOtp()}
            initialStep={globalDone ? "user" : "global"}
            next={next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard"}
            notice={one(sp.error) === "inactive" ? "Your account is not active. Contact your administrator." : undefined}
          />
          <p className="mt-10 text-center text-sm text-muted">
            {new Date().getFullYear()}. {env.companyName}. All Rights Reserved.
          </p>
        </div>
      </div>
    </main>
  );
}
