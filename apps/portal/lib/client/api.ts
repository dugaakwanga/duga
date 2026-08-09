export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

type Opts = {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | undefined>;
};

export async function api<T = unknown>(path: string, opts: Opts = {}): Promise<T> {
  const { method = "GET", body, query } = opts;
  let url = `/api/v1/${path.replace(/^\//, "")}`;
  if (query) {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (v !== undefined) q.set(k, String(v));
    const s = q.toString();
    if (s) url += `?${s}`;
  }
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({ ok: false, error: "Invalid response" }));
  if (!res.ok || !json.ok) {
    throw new ApiError(json.error || `Request failed (${res.status})`, res.status);
  }
  return json.data as T;
}

export interface LoginUser {
  id: string;
  name: string;
  role: string;
  schoolId: string;
  email: string;
  mustChangePassword: boolean;
}

export async function postForm(
  url: string,
  body: unknown,
): Promise<{ ok: boolean; error?: string; user?: LoginUser; [k: string]: unknown }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}
