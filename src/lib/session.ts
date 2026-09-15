import { cookies } from "next/headers";

export const SESSION_COOKIE = "mipo_session";
const THIRTY_DAYS = 60 * 60 * 24 * 30;

export async function getOrCreateSessionId(): Promise<{ id: string; created: boolean }> {
  const store = await cookies();
  const existing = store.get(SESSION_COOKIE)?.value;
  if (existing && /^[0-9a-f-]{36}$/i.test(existing)) return { id: existing, created: false };
  return { id: crypto.randomUUID(), created: true };
}

export function sessionCookie(id: string) {
  return { name: SESSION_COOKIE, value: id, httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: THIRTY_DAYS };
}

export const expiresAt = () => new Date(Date.now() + THIRTY_DAYS * 1000).toISOString();
