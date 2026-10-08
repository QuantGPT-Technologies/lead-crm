import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const secret = () => {
  const s = process.env.APP_SECRET;
  if (!s || s.length < 16) throw new Error("APP_SECRET is missing or too short in .env.local");
  return s;
};

const sign = (body: string) => createHmac("sha256", secret()).update(body).digest("base64url");

/** Stores a tamper-proof, http-only value that expires after `maxAgeSec`. */
export async function setSigned(name: string, value: Record<string, unknown>, maxAgeSec: number) {
  const body = Buffer.from(JSON.stringify({ ...value, exp: Date.now() + maxAgeSec * 1000 })).toString("base64url");
  (await cookies()).set(name, `${body}.${sign(body)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSec,
  });
}

export async function readSigned<T extends Record<string, unknown>>(name: string): Promise<T | null> {
  const raw = (await cookies()).get(name)?.value;
  if (!raw) return null;
  const [body, sig] = raw.split(".");
  if (!body || !sig) return null;
  const expected = Buffer.from(sign(body));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString()) as T & { exp: number };
    return data.exp > Date.now() ? data : null;
  } catch {
    return null;
  }
}

export async function clearSigned(...names: string[]) {
  const store = await cookies();
  names.forEach((n) => store.delete(n));
}
