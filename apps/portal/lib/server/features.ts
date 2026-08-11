import { prisma } from "@duga/core/server";
import type { Role } from "@duga/core";
import { defaultFeaturesFor, SUBFEATURES, SUBFEATURE_BY_ID } from "../features";
import type { Ctx } from "@/app/api/v1/[...path]/route";

export const FEATURE_SETTING_KEY = "featureConfig";

export interface FeatureConfig {
  /** Feature ids disabled by the superadmin for this school (all roles). */
  disabled: string[];
  /** Sub-feature ids disabled by the superadmin (all roles), on top of `disabled`. */
  disabledSubs: string[];
  /** Features the owner grants to the ADMIN role. */
  admin: string[];
  /** Features the admin grants to the TEACHER role. */
  teacher: string[];
  /** Features the admin grants to PARENT and STUDENT roles. */
  family: string[];
}

const defaults = (): FeatureConfig => ({
  disabled: [],
  disabledSubs: [],
  admin: defaultFeaturesFor("ADMIN"),
  teacher: defaultFeaturesFor("TEACHER"),
  family: defaultFeaturesFor("PARENT"),
});

export async function getFeatureConfig(schoolId: string): Promise<FeatureConfig> {
  const row = await prisma.schoolSetting.findUnique({ where: { schoolId_key: { schoolId, key: FEATURE_SETTING_KEY } } });
  if (!row || !row.value || typeof row.value !== "object") return defaults();
  const v = row.value as Partial<FeatureConfig>;
  const d = defaults();
  return {
    disabled: Array.isArray(v.disabled) ? v.disabled : d.disabled,
    disabledSubs: Array.isArray(v.disabledSubs) ? v.disabledSubs : d.disabledSubs,
    admin: Array.isArray(v.admin) ? v.admin : d.admin,
    teacher: Array.isArray(v.teacher) ? v.teacher : d.teacher,
    family: Array.isArray(v.family) ? v.family : d.family,
  };
}

async function saveFeatureConfig(schoolId: string, cfg: FeatureConfig) {
  await prisma.schoolSetting.upsert({
    where: { schoolId_key: { schoolId, key: FEATURE_SETTING_KEY } },
    update: { value: cfg as unknown as never },
    create: { schoolId, key: FEATURE_SETTING_KEY, value: cfg as unknown as never },
  });
}

/**
 * Effective feature ids for a role at a school, honouring the superadmin's
 * per-school disabled list on top of whatever the owner/admin granted.
 */
export async function featuresForRole(schoolId: string, role: Role): Promise<string[]> {
  const cfg = await getFeatureConfig(schoolId);
  const blocked = new Set(cfg.disabled);
  const base =
    role === "OWNER"
      ? defaultFeaturesFor("OWNER")
      : role === "ADMIN"
        ? cfg.admin
        : role === "TEACHER"
          ? cfg.teacher
          : cfg.family;
  return base.filter((id) => !blocked.has(id));
}

/** True if the role may use the given feature at the school. */
export async function featureEnabled(schoolId: string, role: Role, featureId: string): Promise<boolean> {
  if (role === "OWNER") {
    const cfg = await getFeatureConfig(schoolId);
    return !cfg.disabled.includes(featureId);
  }
  const ids = await featuresForRole(schoolId, role);
  return ids.includes(featureId);
}

/** Throw ForbiddenError unless the feature is enabled for the caller. */
export async function assertFeature(ctx: Ctx, featureId: string): Promise<void> {
  const ok = await featureEnabled(ctx.session.user.schoolId, ctx.session.user.role as Role, featureId);
  if (!ok) {
    const err = new Error("This feature is not enabled for your role at this school.") as Error & { status?: number };
    err.status = 403;
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Sub-features (superadmin-level fine-grained switches)
// ---------------------------------------------------------------------------

/**
 * Sub-feature ids that are effectively enabled for a role at a school. A
 * sub-feature is off when the superadmin disabled it, or when its parent
 * feature is off for the role.
 */
export async function subfeaturesForRole(schoolId: string, role: Role): Promise<string[]> {
  const cfg = await getFeatureConfig(schoolId);
  const blockedSubs = new Set(cfg.disabledSubs);
  const base = await featuresForRole(schoolId, role);
  const enabledFeatures = new Set(base);
  return SUBFEATURES.map((s) => s.id).filter((id) => {
    if (blockedSubs.has(id)) return false;
    const def = SUBFEATURE_BY_ID[id];
    if (def?.feature && !enabledFeatures.has(def.feature)) return false;
    return true;
  });
}

/** True if the sub-feature is enabled for the caller's school and role. */
export async function subfeatureEnabled(schoolId: string, role: Role, subId: string): Promise<boolean> {
  const ids = await subfeaturesForRole(schoolId, role);
  return ids.includes(subId);
}

/** Throw ForbiddenError unless the sub-feature is enabled for the caller. */
export async function assertSubfeature(ctx: Ctx, subId: string): Promise<void> {
  const ok = await subfeatureEnabled(ctx.session.user.schoolId, ctx.session.user.role as Role, subId);
  if (!ok) {
    const err = new Error("This feature is not enabled for your role at this school.") as Error & { status?: number };
    err.status = 403;
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Module wiring for the API
// ---------------------------------------------------------------------------

export async function setFeatureConfigFor(
  schoolId: string,
  actorRole: Role,
  target: "admin" | "teacher" | "family",
  ids: string[],
): Promise<FeatureConfig> {
  const cfg = await getFeatureConfig(schoolId);
  const blocked = new Set(cfg.disabled);
  const clean = [...new Set(ids.filter((id) => !blocked.has(id)))];
  if (target === "admin") cfg.admin = clean;
  else if (target === "teacher") cfg.teacher = clean;
  else cfg.family = clean;
  await saveFeatureConfig(schoolId, cfg);
  return cfg;
}
