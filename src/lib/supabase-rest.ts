import "server-only";

export class DataSourceUnavailableError extends Error {}

export function dataSource(): "local" | "supabase" {
  const value = process.env.DATA_SOURCE;
  if (value === "local" || value === "supabase") return value;
  throw new DataSourceUnavailableError("Configure DATA_SOURCE como local ou supabase.");
}

function credentials() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new DataSourceUnavailableError("SUPABASE_URL e SUPABASE_SECRET_KEY são obrigatórios no modo supabase.");
  return { url: url.replace(/\/$/, ""), key };
}

export async function supabaseRest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { url, key } = credentials();
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    cache: "no-store",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=representation", ...init.headers },
  });
  if (!response.ok) throw new DataSourceUnavailableError(`Supabase respondeu ${response.status}: ${await response.text()}`);
  const text = await response.text();
  return (text ? JSON.parse(text) : null) as T;
}
