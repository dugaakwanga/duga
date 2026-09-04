import { NextRequest, NextResponse } from "next/server";
import { requireSession, type SessionUser } from "@duga/core/server";
import { modules, type Handler } from "@/lib/server/modules";

export interface Ctx {
  session: SessionUser;
  id?: string;
  action?: string;
  body: Record<string, unknown>;
  query: URLSearchParams;
  req: NextRequest;
}

async function handle(
  req: NextRequest,
  params: { path: string[] },
  method: string,
): Promise<NextResponse> {
  let session: SessionUser;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  }
  const [resource, ...rest] = params.path ?? [];
  if (!resource || !modules[resource]) {
    return NextResponse.json({ error: "Unknown resource" }, { status: 404 });
  }

  // Feature gating: if the resource belongs to a feature that is disabled for
  // the caller's school/role, block it here (server-side, not just in the UI).
  const { FEATURE_BY_RESOURCE, SUBFEATURE_BY_RESOURCE } = await import("@/lib/features");
  const featureId = FEATURE_BY_RESOURCE[resource];
  if (featureId) {
    const { featureEnabled } = await import("@/lib/server/features");
    const allowed = await featureEnabled(session.user.schoolId, session.user.role, featureId);
    if (!allowed) {
      return NextResponse.json({ ok: false, error: "This feature is not enabled for your role at this school." }, { status: 403 });
    }
  }
  // Sub-feature gating (superadmin's fine-grained switches), e.g. finance.
  const subId = SUBFEATURE_BY_RESOURCE[resource];
  if (subId) {
    const { subfeatureEnabled } = await import("@/lib/server/features");
    const allowed = await subfeatureEnabled(session.user.schoolId, session.user.role, subId);
    if (!allowed) {
      return NextResponse.json({ ok: false, error: "This feature is not enabled for your role at this school." }, { status: 403 });
    }
  }

  const mod = modules[resource];
  const query = new URL(req.url).searchParams;
  const body: Record<string, unknown> = method === "GET" ? {} : await req.json().catch(() => ({}));

  const base: Omit<Ctx, "id" | "action"> = { session, body, query, req };

  const run = (fn: Handler, extra: Partial<Ctx> = {}): Promise<unknown> =>
    fn({ ...base, ...extra } as Ctx);

  try {
    let result: unknown;
    if (method === "GET") {
      if (rest.length === 0) result = await run(mod.list!);
      else if (rest.length === 1 && mod.actions?.[rest[0]!]) {
        // Named, non-id-scoped actions (e.g. "messages/notifications") can be
        // fetched via GET the same way they're invoked via POST — otherwise
        // this segment always falls through to mod.get() below and is
        // misread as a record id.
        result = await run(mod.actions![rest[0]!]!, { action: rest[0] });
      } else if (rest.length === 1) result = await run(mod.get!, { id: rest[0] });
      else return NextResponse.json({ error: "Not found" }, { status: 404 });
    } else if (method === "POST") {
      if (rest.length === 0) result = await run(mod.create!);
      else if (rest.length === 1 && mod.actions?.[rest[0]!]) {
        const action = mod.actions![rest[0]!]!;
        result = await run(action, { action: rest[0] });
      } else if (rest.length === 2 && mod.actions?.[rest[1]!]) {
        const action = mod.actions![rest[1]!]!;
        result = await run(action, { id: rest[0], action: rest[1] });
      } else {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
    } else if (method === "PATCH") {
      if (rest.length === 1) result = await run(mod.update!, { id: rest[0] });
      // Self-scoped updates (profile, settings) target the logged-in user /
      // their own school, so no id is required.
      else if (rest.length === 0) result = await run(mod.update!);
      else return NextResponse.json({ error: "Not found" }, { status: 404 });
    } else if (method === "DELETE") {
      if (rest.length === 1) result = await run(mod.remove!, { id: rest[0] });
      else return NextResponse.json({ error: "Not found" }, { status: 404 });
    } else {
      return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
    }

    return NextResponse.json({ ok: true, data: result ?? null });
  } catch (e) {
    const err = e as Error & { status?: number };
    const status = err.status ?? (err.name === "ForbiddenError" ? 403 : 500);
    if (status >= 500) console.error(`[v1:${resource}]`, err);
    return NextResponse.json({ ok: false, error: err.message || "Internal error" }, { status });
  }
}

export const GET = (req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) =>
  ctx.params.then((p) => handle(req, p, "GET"));
export const POST = (req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) =>
  ctx.params.then((p) => handle(req, p, "POST"));
export const PATCH = (req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) =>
  ctx.params.then((p) => handle(req, p, "PATCH"));
export const DELETE = (req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) =>
  ctx.params.then((p) => handle(req, p, "DELETE"));
