export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  appName: process.env.NEXT_PUBLIC_APP_NAME || "Lead CRM",
  companyName: process.env.NEXT_PUBLIC_COMPANY_NAME || "Your Company",
  timezone: process.env.NEXT_PUBLIC_APP_TIMEZONE || "Asia/Kolkata",
};

export const isSupabaseConfigured = () =>
  /^https?:\/\//.test(env.supabaseUrl) && !env.supabaseUrl.includes("YOUR-PROJECT-REF") && !!env.supabaseAnonKey;

const flag = (v: string | undefined, fallback: boolean) =>
  v === undefined || v === "" ? fallback : v.toLowerCase() === "true";

// Server-only flags
export const requireGlobalLogin = () => flag(process.env.AUTH_REQUIRE_GLOBAL_LOGIN, true);
export const requireOtp = () => flag(process.env.AUTH_REQUIRE_OTP, false);
