import { logAudit } from "@duga/core/server";
import type { Module } from ".";
import type { Role } from "@duga/core";
import { CONFIGURES } from "@/lib/features";
import { getFeatureConfig, setFeatureConfigFor, featuresForRole } from "../features";
import type { Ctx } from "@/app/api/v1/[...path]/route";

export const featuresModule: Module = {
  async list(ctx) {
    const schoolId = ctx.session.user.schoolId;
    const role = ctx.session.user.role as Role;
    const cfg = await getFeatureConfig(schoolId);
    const myIds = await featuresForRole(schoolId, role);
    return {
      role,
      mine: myIds,
      config: cfg,
      // Who this caller is allowed to configure.
      canConfigure: CONFIGURES[role] ?? [],
    };
  },

  actions: {
    // POST /api/v1/features/set { target: "admin"|"teacher"|"family", ids: string[] }
    set: async (ctx: Ctx) => {
      const actor = ctx.session.user.role as Role;
      const target = String(ctx.body.target ?? "") as "admin" | "teacher" | "family";
      const ids = Array.isArray(ctx.body.ids) ? ctx.body.ids.filter((x): x is string => typeof x === "string") : [];
      const allowed = CONFIGURES[actor] ?? [];
      const targetRole: Role = target === "admin" ? "ADMIN" : target === "teacher" ? "TEACHER" : "PARENT";
      if (!allowed.includes(targetRole)) {
        const e = new Error("You cannot configure features for this role") as Error & { status?: number };
        e.status = 403;
        throw e;
      }
      const cfg = await setFeatureConfigFor(ctx.session.user.schoolId, actor, target, ids);
      await logAudit({
        schoolId: ctx.session.user.schoolId,
        userId: ctx.session.user.id,
        action: `features.configured.${target}`,
        entityType: "School",
        entityId: ctx.session.user.schoolId,
        meta: { ids },
      });
      return cfg;
    },

    reset: async (ctx: Ctx) => {
      const actor = ctx.session.user.role as Role;
      const target = String(ctx.body.target ?? "") as "admin" | "teacher" | "family";
      const targetRole: Role = target === "admin" ? "ADMIN" : target === "teacher" ? "TEACHER" : "PARENT";
      const allowed = CONFIGURES[actor] ?? [];
      if (!allowed.includes(targetRole)) {
        const e = new Error("You cannot configure features for this role") as Error & { status?: number };
        e.status = 403;
        throw e;
      }
      const { defaultFeaturesFor } = await import("@/lib/features");
      return setFeatureConfigFor(ctx.session.user.schoolId, actor, target, defaultFeaturesFor(targetRole));
    },
  },
};
