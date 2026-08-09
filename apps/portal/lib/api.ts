// Client-side fetch helper used by portal pages.

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

interface ApiOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: Record<string, unknown>;
}

export async function api<T = unknown>(path: string, options: ApiOptions = {}): Promise<T> {
  const { method = "GET", body } = options;
  const res = await fetch(`/api/v1${path}`, {
    method,
    credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(json?.error ?? `Request failed (${res.status})`, res.status);
  }
  return json as T;
}

export async function apiAuth<T = unknown>(path: string, options: ApiOptions = {}): Promise<T> {
  const { method = "GET", body } = options;
  const res = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(json?.error ?? "Request failed", res.status);
  return json as T;
}

export interface ApiList<T> {
  items: T[];
  total: number;
}
