import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/server/superadmin";
import { saModules, type SAHandler, type SACtx } from "@/lib/server/superadmin-modules";

async function handle(req: NextRequest, params: { path: string[] }, method: string): Promise<NextResponse> {
  let session;
  try {
    session = await requireSuperAdmin();
  } catch {
    return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  }

  const [resource, ...rest] = params.path ?? [];
  const mod = resource ? saModules[resource] : undefined;
  if (!resource || !mod) {
    return NextResponse.json({ error: "Unknown resource" }, { status: 404 });
  }

  const query = new URL(req.url).searchParams;
  const body: Record<string, unknown> = method === "GET" ? {} : await req.json().catch(() => ({}));
  const base: Omit<SACtx, "id" | "action"> = { session, body, query };

  const run = (fn: SAHandler, extra: Partial<SACtx> = {}): Promise<unknown> => fn({ ...base, ...extra } as SACtx);

  try {
    let result: unknown;
    if (method === "GET") {
      if (rest.length === 0) result = await run(mod.list!);
      else if (rest.length === 1) result = await run(mod.get!, { id: rest[0] });
      else return NextResponse.json({ error: "Not found" }, { status: 404 });
    } else if (method === "POST") {
      if (rest.length === 1 && mod.actions?.[rest[0]!]) {
        const action = mod.actions![rest[0]!]!;
        result = await run(action, { action: rest[0] });
      } else {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
    } else {
      return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
    }
    return NextResponse.json({ ok: true, data: result ?? null });
  } catch (e) {
    const err = e as Error & { status?: number };
    const status = err.status ?? (err.name === "ForbiddenError" ? 403 : 500);
    if (status >= 500) console.error(`[superadmin:${resource}]`, err);
    return NextResponse.json({ ok: false, error: err.message || "Internal error" }, { status });
  }
}

export const GET = (req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) => ctx.params.then((p) => handle(req, p, "GET"));
export const POST = (req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) => ctx.params.then((p) => handle(req, p, "POST"));
