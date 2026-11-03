import "server-only";
import { randomBytes } from "node:crypto";
import { readSigned, setSigned } from "@/lib/signed-cookie";
import { TAB_COOKIE } from "@/lib/tab-session-constants";

type TabSession = { key: string; userId: string; sessionId: string };

// Only call after Supabase verifies the user/session, never on an untrusted bearer alone.
function sessionId(accessToken: string, userId: string): string | null {
  try {
    const claims = JSON.parse(Buffer.from(accessToken.split(".")[1], "base64url").toString("utf8"));
    return claims.sub === userId && typeof claims.session_id === "string" ? claims.session_id : null;
  } catch { return null; }
}

export async function startTabSession(userId: string, accessToken: string) {
  const id = sessionId(accessToken, userId);
  if (!id) throw new Error("Could not start this tab's session");
  const key = randomBytes(32).toString("base64url");
  await setSigned(TAB_COOKIE, { key, userId, sessionId: id }, 12 * 60 * 60, true);
  return key;
}

export async function readTabSession(userId: string, accessToken: string) {
  const tab = await readSigned<TabSession>(TAB_COOKIE);
  return tab?.userId === userId && tab.sessionId === sessionId(accessToken, userId) ? tab : null;
}
