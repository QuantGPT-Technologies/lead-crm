import Link from "next/link";
import { env, isSupabaseConfigured } from "@/lib/env";

// rendered per request so it reflects the current .env.local
export const dynamic = "force-dynamic";

const STEPS = [
  ["Create a Supabase project", "supabase.com -> New project. Wait until it finishes provisioning."],
  ["Create the database", "Supabase Dashboard -> SQL Editor -> paste the whole of supabase/schema.sql -> Run."],
  ["Add your keys", "Copy .env.example to .env.local and fill NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY and APP_SECRET."],
  ["Create the first admin", "Set the SETUP_* values in .env.local, then run:  npm run setup:admin"],
  ["Restart the app", "Stop and run  npm run dev  again so the new environment values are loaded."],
];

export default function SetupPage() {
  const ready = isSupabaseConfigured();
  return (
    <main className="mx-auto max-w-2xl p-6 py-16">
      <h1 className="text-2xl font-extrabold text-brand">{env.appName} - setup</h1>
      <p className="mt-2 text-muted">
        {ready ? "Supabase keys are present." : "Supabase is not configured yet. Follow these steps once:"}
      </p>
      <ol className="mt-6 space-y-3">
        {STEPS.map(([title, body], i) => (
          <li key={title} className="rounded-lg border border-line bg-card p-4">
            <p className="font-bold">
              {i + 1}. {title}
            </p>
            <p className="mt-1 text-muted">{body}</p>
          </li>
        ))}
      </ol>
      {ready && (
        <Link href="/login" className="mt-6 inline-block font-bold text-brand underline">
          Go to login
        </Link>
      )}
    </main>
  );
}
