// Creates the first admin user and the global (company) login.
// Usage: fill .env.local, run supabase/schema.sql in the SQL editor, then `npm run setup:admin`
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

if (!existsSync(".env.local")) {
  console.error("Missing .env.local - copy .env.example to .env.local and fill it in first.");
  process.exit(1);
}
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (!m || line.trim().startsWith("#")) continue;
  process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
}

const need = (k) => {
  if (!process.env[k]) {
    console.error(`Missing ${k} in .env.local`);
    process.exit(1);
  }
  return process.env[k];
};

const supabase = createClient(need("NEXT_PUBLIC_SUPABASE_URL"), need("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

const email = need("SETUP_ADMIN_EMAIL").toLowerCase();
const password = need("SETUP_ADMIN_PASSWORD");
const name = process.env.SETUP_ADMIN_NAME || "Admin";

const fail = (step, error) => {
  console.error(`${step} failed: ${error.message}`);
  process.exit(1);
};

const { error: gErr } = await supabase.rpc("set_global_login", {
  p_email: need("SETUP_GLOBAL_EMAIL"),
  p_password: need("SETUP_GLOBAL_PASSWORD"),
});
if (gErr) fail("Global login (did you run supabase/schema.sql?)", gErr);
console.log(`Global login set: ${process.env.SETUP_GLOBAL_EMAIL}`);

const { data: existing } = await supabase.from("profiles").select("id, emp_code").eq("email", email).maybeSingle();
if (existing) {
  console.log(`Admin already exists: ${email} (user id ${existing.emp_code}). Nothing to do.`);
  process.exit(0);
}

const { data: created, error: uErr } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
});
if (uErr) fail("Create auth user", uErr);

const { data: profile, error: pErr } = await supabase
  .from("profiles")
  .insert({ id: created.user.id, full_name: name, email, role: "admin" })
  .select("emp_code")
  .single();
if (pErr) fail("Create profile", pErr);

console.log(`Admin created.\n  User ID : ${profile.emp_code}  (or sign in with ${email})\n  Password: the SETUP_ADMIN_PASSWORD you set`);
console.log("Change both passwords after the first login (Configuration -> Settings, Others -> My Profile).");
