// Local demo: runs the CRM against a stand-in for Supabase so every page can be seen without a Supabase project.
//
//   npm run demo            start (keeps data between runs in .demo/)
//   npm run demo -- --reset wipe the demo data and start fresh
//
// What it starts, all on this machine:
//   - a real PostgreSQL (embedded-postgres) loaded with supabase/schema.sql + sample data
//   - PostgREST (the same REST layer Supabase uses), downloaded once from its GitHub releases
//   - a small stand-in for Supabase Auth (password login, sessions, admin user API)
//   - `next dev`, pointed at the above through environment variables
// The app code is unchanged; .env.local is not read or modified. This is for viewing and testing only.
import { spawn, execFileSync } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import EmbeddedPostgres from "embedded-postgres";

const ROOT = path.resolve(import.meta.dirname, "..");
const DEMO = path.join(ROOT, ".demo");
const PG_DIR = path.join(DEMO, "pg");
const PG_PORT = 54329;
const REST_PORT = 54330;
const API_PORT = 54321;
const APP_PORT = Number(process.env.PORT) || 3000;
const JWT_SECRET = "local-demo-jwt-secret-not-for-production-use-0001";
const POSTGREST_VERSION = "v16.4";
const PASSWORD = "Demo@1234";
const GLOBAL_EMAIL = "company@demo.test";

if (process.argv.includes("--reset")) rmSync(DEMO, { recursive: true, force: true });
mkdirSync(DEMO, { recursive: true });

// ----------------------------------------------------------------- JWT -----
const b64 = (v) => Buffer.from(typeof v === "string" ? v : JSON.stringify(v)).toString("base64url");
function signJwt(payload, ttlSec) {
  const now = Math.floor(Date.now() / 1000);
  const body = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ iat: now, exp: now + ttlSec, ...payload })}`;
  return `${body}.${createHmac("sha256", JWT_SECRET).update(body).digest("base64url")}`;
}
function readJwt(token) {
  const [h, p, s] = String(token ?? "").split(".");
  if (!s || createHmac("sha256", JWT_SECRET).update(`${h}.${p}`).digest("base64url") !== s) return null;
  const claims = JSON.parse(Buffer.from(p, "base64url").toString());
  return claims.exp > Date.now() / 1000 ? claims : null;
}
const TEN_YEARS = 10 * 365 * 86400;
const ANON_KEY = signJwt({ role: "anon", iss: "demo" }, TEN_YEARS);
const SERVICE_KEY = signJwt({ role: "service_role", iss: "demo" }, TEN_YEARS);

// ------------------------------------------------------------ postgres -----
const firstRun = !existsSync(path.join(PG_DIR, "PG_VERSION"));
const pg = new EmbeddedPostgres({ databaseDir: PG_DIR, user: "postgres", password: "postgres", port: PG_PORT, persistent: true, initdbFlags: ["--encoding=UTF8", "--locale=C"], onLog: () => {}, onError: () => {} });
console.log(firstRun ? "Creating demo database (first run takes a minute)..." : "Starting demo database...");
if (firstRun) await pg.initialise();
await pg.start();
if (firstRun) await pg.createDatabase("crm");
const db = pg.getPgClient("crm");
await db.connect();

if (firstRun) {
  // the parts of a Supabase project that supabase/schema.sql expects to exist already
  await db.query(`
    create schema extensions; create schema auth;
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create role authenticator login password 'demo' noinherit;
    grant anon, authenticated, service_role to authenticator;
    create table auth.users (
      id uuid primary key default gen_random_uuid(), email text unique not null, encrypted_password text not null,
      banned boolean not null default false, created_at timestamptz not null default now());
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claims', true)::json ->> 'sub', '')::uuid $$;
    grant usage on schema auth, extensions, public to anon, authenticated, service_role;
  `);
  await db.query(readFileSync(path.join(ROOT, "supabase", "schema.sql"), "utf8"));
  await seed();
  console.log("Demo data loaded.");
}

async function seed() {
  const one = async (sql, params) => (await db.query(sql, params)).rows[0];
  const all = async (sql, params) => (await db.query(sql, params)).rows;
  const user = async (name, email, role, manager) => {
    const { id } = await one("insert into auth.users (email, encrypted_password) values ($1, extensions.crypt($2, extensions.gen_salt('bf'))) returning id", [email, PASSWORD]);
    await db.query("insert into profiles (id, full_name, email, role, manager_id, phone) values ($1,$2,$3,$4,$5,$6)", [id, name, email, role, manager ?? null, "9000000000"]);
    return id;
  };
  const admin = await user("Demo Admin", "admin@demo.test", "admin");
  const manager = await user("Meera Manager", "manager@demo.test", "manager");
  const agents = [await user("Arjun Agent", "arjun@demo.test", "agent", manager), await user("Bela Agent", "bela@demo.test", "agent", manager), await user("Chetan Agent", "chetan@demo.test", "agent", manager)];
  await db.query("select set_global_login($1, $2)", [GLOBAL_EMAIL, PASSWORD]);

  const sources = await all("select id from lead_sources order by name");
  const stages = Object.fromEntries((await all("select id, name from stages")).map((s) => [s.name, s.id]));
  const subs = await all("select id, stage_id from sub_stages order by sort_order");
  const uni = (await one("select id from universities limit 1")).id;
  const courses = await all("select id, name, fee from courses order by name");
  const first = ["Aarav", "Diya", "Kabir", "Isha", "Rohan", "Sneha", "Vikram", "Tara", "Nikhil", "Pooja", "Farhan", "Leela", "Sameer", "Anika", "Dev", "Mira"];
  const last = ["Sharma", "Verma", "Nair", "Khan", "Patel", "Iyer", "Singh", "Das", "Mehta", "Joshi", "Gupta"];
  const cities = [["Delhi", "Delhi"], ["Mumbai", "Maharashtra"], ["Pune", "Maharashtra"], ["Bengaluru", "Karnataka"], ["Jaipur", "Rajasthan"], ["Lucknow", "Uttar Pradesh"]];
  const stagePlan = ["Not Contacted", "Not Contacted", "Not Contacted", "Contacted", "Contacted", "Interested", "Interested", "Application Started", "Payment Pending", "Enrolled", "Not Interested", "Not Contacted", "Junk"];
  const owners = [...agents, agents[0], manager, null, agents[1]];
  const day = 86_400_000;
  const cap = (ms) => new Date(Math.min(ms, Date.now())); // nothing in the sample history happens in the future

  for (let i = 0; i < 90; i++) {
    const name = `${first[i % first.length]} ${last[(i * 7) % last.length]}`;
    const stageName = stagePlan[i % stagePlan.length];
    const stageId = stages[stageName];
    const owner = owners[i % owners.length];
    const course = courses[i % courses.length];
    const [city, state] = cities[i % cities.length];
    const created = new Date(Date.now() - (i % 30) * day - (i % 9) * 3_600_000);
    const attempts = stageName === "Not Contacted" ? 0 : 1 + (i % 3);
    const lead = await one(
      `insert into leads (student_name, mobile, email, source_id, source_desc, stage_id, sub_stage_id, university_id, course_id, owner_id, allotted_at,
         city, state, priority, product, attempt_count, last_contacted_at, qualification, created_by, created_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) returning id`,
      [name, String(9810000000 + i * 7919), `${name.toLowerCase().replace(" ", ".")}${i}@example.com`, sources[i % sources.length].id, i % 4 === 0 ? "Campaign A" : null,
        stageId, subs.find((s) => s.stage_id === stageId)?.id ?? null, stageName === "Not Contacted" ? null : uni, stageName === "Not Contacted" ? null : course.id,
        owner, owner ? created : null, city, state, ["warm", "hot", "cold"][i % 3], `Online ${course.name}`, attempts, attempts ? cap(created.getTime() + day) : null,
        ["Graduate", "12th", "Post Graduate"][i % 3], admin, created],
    );
    const actor = owner ?? manager;
    const log = (type, summary, details = {}, at = created) =>
      db.query("insert into lead_activities (lead_id, actor_id, type, summary, details, created_at) values ($1,$2,$3,$4,$5,$6)", [lead.id, actor, type, summary, details, at]);
    await log("created", `Demo Admin created the Lead ${name} with following details`, { fields: { "Do Not Disturb": "N/A", Category: "Lead Info", Stage: "Not Contacted" } });
    for (let c = 0; c < attempts; c++) {
      const at = cap(created.getTime() + (c + 1) * day / 2);
      const outcome = ["connected", "no_answer", "busy"][(i + c) % 3];
      await db.query("insert into call_logs (lead_id, user_id, outcome, duration_sec, notes, called_at) values ($1,$2,$3,$4,$5,$6)", [lead.id, actor, outcome, outcome === "connected" ? 60 + ((i * 37) % 400) : 0, outcome === "connected" ? "Discussed course and fees." : null, at]);
      await log("call", `Logged a call (${outcome.replace("_", " ")})`, { fields: { Attempt: String(c + 1) } }, at);
    }
    if (stageName !== "Not Contacted") await log("stage_change", `Moved ${name} to ${stageName}`, { fields: { Stage: `Not Contacted → ${stageName}` } }, cap(created.getTime() + day));
    if (owner && ["Contacted", "Interested", "Application Started", "Payment Pending"].includes(stageName)) {
      const due = new Date(new Date().setHours(11 + (i % 7), 0, 0, 0) + ((i % 5) - 2) * day); // spread over missed / today / upcoming
      await db.query("insert into tasks (lead_id, title, due_at, assigned_to, created_by) values ($1,$2,$3,$4,$4)", [lead.id, i % 2 ? "Follow up call" : "Share fee structure", due, owner]);
    }
    if (stageName === "Interested") {
      await db.query("insert into opportunities (lead_id, title, amount, probability, expected_close, status, created_by) values ($1,$2,$3,$4,$5,$6,$7)", [lead.id, `${course.name} admission`, course.fee, 40 + (i % 5) * 10, new Date(Date.now() + 14 * day), i % 11 === 0 ? "lost" : "open", actor]);
      await db.query("insert into messages (lead_id, channel, recipient, subject, body, status, sent_by) values ($1,'email',$2,$3,$4,'logged',$5)", [lead.id, `${first[i % first.length].toLowerCase()}@example.com`, `Details for ${course.name}`, `Hi ${name}, sharing the course details as discussed.`, actor]);
    }
    if (stageName === "Enrolled") {
      const paid = Math.round(Number(course.fee) * [1, 0.5, 0.25][i % 3]);
      await db.query("insert into enrollments (lead_id, enrollment_no, university_id, course_id, fee_amount, paid_amount, enrolled_on, created_by, created_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)", [lead.id, `ENR${1000 + i}`, uni, course.id, course.fee, paid, cap(created.getTime() + 3 * day), actor, cap(created.getTime() + 3 * day)]);
      await log("enrolled", `Enrolled this lead in ${course.name}`, { fields: { Fee: String(course.fee), Paid: String(paid) } }, cap(created.getTime() + 3 * day));
    }
  }
}

// ----------------------------------------------------------- postgrest -----
const exe = path.join(DEMO, process.platform === "win32" ? "postgrest.exe" : "postgrest");
if (!existsSync(exe)) {
  const asset =
    process.platform === "win32" ? "windows-x86-64.zip"
    : process.platform === "darwin" ? `macos-${process.arch === "arm64" ? "aarch64" : "x86-64"}.tar.xz`
    : `linux-static-${process.arch === "arm64" ? "aarch64" : "x86-64"}.tar.xz`;
  const url = `https://github.com/PostgREST/postgrest/releases/download/${POSTGREST_VERSION}/postgrest-${POSTGREST_VERSION}-${asset}`;
  console.log(`Downloading PostgREST ${POSTGREST_VERSION} (one time)...`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not download ${url}: HTTP ${res.status}`);
  const archive = path.join(DEMO, asset);
  await pipeline(res.body, createWriteStream(archive));
  if (asset.endsWith(".zip")) execFileSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -Force -LiteralPath '${archive}' -DestinationPath '${DEMO}'`]);
  else execFileSync("tar", ["-xJf", archive, "-C", DEMO]);
  rmSync(archive);
}
const children = [];
const run = (cmd, args, env, label) => {
  const child = spawn(cmd, args, { env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
  const show = (d) => String(d).split(/\r?\n/).filter(Boolean).forEach((l) => console.log(`[${label}] ${l}`));
  if (label === "app") child.stdout.on("data", show);
  child.stderr.on("data", (d) => /error|fatal/i.test(String(d)) && show(d));
  child.on("exit", (code) => code && console.log(`[${label}] exited with code ${code}`));
  children.push(child);
  return child;
};
// On Windows PostgREST needs libpq.dll, which ships with the embedded Postgres binaries.
const pgBin = path.join(ROOT, "node_modules", "@embedded-postgres", "windows-x64", "native", "bin");
const pathKey = Object.keys(process.env).find((k) => k.toLowerCase() === "path") ?? "PATH";
run(exe, [], {
  ...(process.platform === "win32" ? { [pathKey]: `${pgBin}${path.delimiter}${process.env[pathKey]}` } : {}),
  PGRST_DB_URI: `postgres://authenticator:demo@127.0.0.1:${PG_PORT}/crm`,
  PGRST_DB_SCHEMAS: "public",
  PGRST_DB_ANON_ROLE: "anon",
  PGRST_JWT_SECRET: JWT_SECRET,
  PGRST_SERVER_HOST: "127.0.0.1",
  PGRST_SERVER_PORT: String(REST_PORT),
  PGRST_DB_MAX_ROWS: "1000",
}, "postgrest");

// ------------------------------------------- auth stand-in + API gateway ---
const userJson = (u) => ({
  id: u.id, aud: "authenticated", role: "authenticated", email: u.email, email_confirmed_at: u.created_at, phone: "",
  app_metadata: { provider: "email", providers: ["email"] }, user_metadata: {}, identities: [], created_at: u.created_at, updated_at: u.created_at,
});
const session = (u) => ({
  access_token: signJwt({ sub: u.id, role: "authenticated", aud: "authenticated", email: u.email, session_id: randomBytes(8).toString("hex") }, 3600),
  token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
  refresh_token: signJwt({ sub: u.id, typ: "refresh" }, 30 * 86400), user: userJson(u),
});
const findUser = async (where, value) => (await db.query(`select * from auth.users where ${where} = $1`, [value])).rows[0];
const hash = "extensions.crypt($1, extensions.gen_salt('bf'))";

async function auth(req, url, body) {
  const route = `${req.method} ${url.pathname.replace("/auth/v1", "")}`;
  const bearer = readJwt(req.headers.authorization?.replace(/^Bearer /i, ""));
  const fail = (status, error_code, msg) => ({ status, json: { code: status, error_code, msg } });
  const isService = bearer?.role === "service_role";

  if (route === "POST /token" && url.searchParams.get("grant_type") === "password") {
    const u = (await db.query("select * from auth.users where lower(email) = lower($1) and encrypted_password = extensions.crypt($2, encrypted_password)", [body.email, body.password])).rows[0];
    if (!u) return fail(400, "invalid_credentials", "Invalid login credentials");
    if (u.banned) return fail(400, "user_banned", "User is banned");
    return { status: 200, json: session(u) };
  }
  if (route === "POST /token" && url.searchParams.get("grant_type") === "refresh_token") {
    const claims = readJwt(body.refresh_token);
    const u = claims?.typ === "refresh" && (await findUser("id", claims.sub));
    if (!u || u.banned) return fail(400, "refresh_token_not_found", "Invalid Refresh Token");
    return { status: 200, json: session(u) };
  }
  if (route === "GET /user" || route === "PUT /user") {
    const u = bearer?.sub && (await findUser("id", bearer.sub));
    if (!u || u.banned) return fail(403, "bad_jwt", "Invalid or expired session");
    if (req.method === "PUT" && body.password) await db.query(`update auth.users set encrypted_password = ${hash} where id = $2`, [body.password, u.id]);
    return { status: 200, json: userJson(u) };
  }
  if (route === "POST /logout") return { status: 204 };
  if (route === "POST /otp") return fail(422, "otp_disabled", "Email OTP is not available in the local demo");

  const adminUser = url.pathname.match(/^\/auth\/v1\/admin\/users(?:\/([0-9a-f-]{36}))?$/i);
  if (adminUser) {
    if (!isService) return fail(403, "not_admin", "Service role key required");
    const id = adminUser[1];
    if (req.method === "POST" && !id) {
      if (await findUser("lower(email)", String(body.email).toLowerCase())) return fail(422, "email_exists", "A user with this email address has already been registered");
      const u = (await db.query(`insert into auth.users (email, encrypted_password) values ($2, ${hash}) returning *`, [body.password, String(body.email).toLowerCase()])).rows[0];
      return { status: 200, json: userJson(u) };
    }
    const u = id && (await findUser("id", id));
    if (!u) return fail(404, "user_not_found", "User not found");
    if (req.method === "PUT") {
      if (body.password) await db.query(`update auth.users set encrypted_password = ${hash} where id = $2`, [body.password, id]);
      if (body.ban_duration) await db.query("update auth.users set banned = $1 where id = $2", [body.ban_duration !== "none", id]);
      return { status: 200, json: userJson(u) };
    }
    if (req.method === "DELETE") {
      await db.query("delete from auth.users where id = $1", [id]);
      return { status: 200, json: {} };
    }
  }
  return fail(404, "not_found", `Auth route not available in the local demo: ${route}`);
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${API_PORT}`);
    if (url.pathname.startsWith("/rest/v1")) {
      // pass straight through to PostgREST, exactly as Supabase's gateway does
      const upstream = http.request({ host: "127.0.0.1", port: REST_PORT, method: req.method, path: url.pathname.replace("/rest/v1", "") + url.search, headers: { ...req.headers, host: `127.0.0.1:${REST_PORT}` } }, (r) => {
        res.writeHead(r.statusCode, r.headers);
        r.pipe(res);
      });
      upstream.on("error", (e) => res.writeHead(502, { "content-type": "application/json" }).end(JSON.stringify({ message: `PostgREST unreachable: ${e.message}` })));
      return req.pipe(upstream);
    }
    if (url.pathname.startsWith("/auth/v1")) {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      let body = {};
      try {
        body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
      } catch {}
      try {
        const out = await auth(req, url, body);
        res.writeHead(out.status, { "content-type": "application/json" }).end(out.json ? JSON.stringify(out.json) : undefined);
      } catch (e) {
        res.writeHead(500, { "content-type": "application/json" }).end(JSON.stringify({ code: 500, msg: e.message }));
      }
      return;
    }
    res.writeHead(404).end();
  })
  .listen(API_PORT, "127.0.0.1");

// ------------------------------------------------------------- the app -----
// wait until PostgREST answers so the first page load does not race it
for (let i = 0; i < 60; i++) {
  if (await fetch(`http://127.0.0.1:${REST_PORT}/`).then((r) => r.ok, () => false)) break;
  await new Promise((r) => setTimeout(r, 500));
}
run(process.execPath, [path.join(ROOT, "node_modules", "next", "dist", "bin", "next"), "dev", "-p", String(APP_PORT)], {
  NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${API_PORT}`,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
  APP_SECRET: "local-demo-app-secret-0123456789",
  AUTH_REQUIRE_GLOBAL_LOGIN: "true",
  AUTH_REQUIRE_OTP: "false",
  NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME || "Lead CRM",
  NEXT_PUBLIC_COMPANY_NAME: process.env.NEXT_PUBLIC_COMPANY_NAME || "Demo Company",
}, "app");

console.log(`
  Demo is starting at  http://localhost:${APP_PORT}

  Step 1  Global Sign In   ${GLOBAL_EMAIL}  /  ${PASSWORD}
  Step 2  User Login       EA00000001 (admin)  /  ${PASSWORD}
          also: EA00000002 manager, EA00000003-5 agents (same password)

  Press Ctrl+C to stop. Data is kept in .demo/ (npm run demo -- --reset to wipe).
`);

let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  children.forEach((c) => c.kill());
  await db.end().catch(() => {});
  await pg.stop().catch(() => {});
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
