import { prisma, logAudit } from "@duga/core/server";
import type { Module } from ".";
import { can, str } from "../helpers";

const CONTENT_KEY = "siteContent";

interface StatItem {
  value: number;
  suffix: string;
  label: string;
}

export interface SiteContent {
  ticker: string[];
  hero: {
    eyebrow: string;
    lead: string;
  };
  stats: StatItem[];
  footer: {
    about: string;
    tagline: string;
  };
}

const DEFAULT_CONTENT: SiteContent = {
  ticker: [
    "Admissions open for the 2025/2026 session",
    "BECE 2025 — 98% credit pass",
    "New integrated science laboratory commissioned",
    "Boarding & day enrolment available",
    "Inter-house sports festival — Green House champions",
    "National examination preparation at accredited centres",
  ],
  hero: {
    eyebrow: "Admissions Open · 2025/2026 Session",
    lead: "Imparting the Winning Wisdom. A co-educational Primary and Secondary school in Akwanga, Nasarawa State — where academic rigour, modern technology and strong moral values come together to shape the next generation of Nigerian leaders.",
  },
  stats: [
    { value: 20, suffix: "+", label: "Years of excellence" },
    { value: 1200, suffix: "+", label: "Students enrolled" },
    { value: 98, suffix: "%", label: "BECE pass rate" },
    { value: 80, suffix: "+", label: "Dedicated staff" },
  ],
  footer: {
    about: "A co-educational Primary and Secondary school in Akwanga, Nasarawa State — building tomorrow's leaders with academic excellence and strong moral values.",
    tagline: "Imparting the winning wisdom in Nasarawa State.",
  },
};

function asStrArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
  return out.length > 0 ? out : undefined;
}

function normalize(value: unknown): SiteContent {
  const saved = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const hero = (saved.hero && typeof saved.hero === "object" ? saved.hero : {}) as Record<string, unknown>;
  const footer = (saved.footer && typeof saved.footer === "object" ? saved.footer : {}) as Record<string, unknown>;
  const stats = Array.isArray(saved.stats)
    ? (saved.stats.filter(
        (s): s is StatItem => !!s && typeof s === "object" && "value" in s && "label" in s,
      ) as StatItem[])
    : DEFAULT_CONTENT.stats;
  return {
    ticker: asStrArray(saved.ticker) ?? DEFAULT_CONTENT.ticker,
    hero: {
      eyebrow: str(hero.eyebrow) ?? DEFAULT_CONTENT.hero.eyebrow,
      lead: str(hero.lead) ?? DEFAULT_CONTENT.hero.lead,
    },
    stats: stats.length > 0 ? stats : DEFAULT_CONTENT.stats,
    footer: {
      about: str(footer.about) ?? DEFAULT_CONTENT.footer.about,
      tagline: str(footer.tagline) ?? DEFAULT_CONTENT.footer.tagline,
    },
  };
}

async function loadContent(schoolId: string): Promise<SiteContent> {
  const row = await prisma.schoolSetting.findUnique({
    where: { schoolId_key: { schoolId, key: CONTENT_KEY } },
  });
  return normalize(row?.value);
}

export const contentModule: Module = {
  async list(ctx) {
    can(ctx, "content:manage");
    return loadContent(ctx.session.user.schoolId);
  },

  actions: {
    save: async (ctx) => {
      can(ctx, "content:manage");
      const schoolId = ctx.session.user.schoolId;
      const current = await loadContent(schoolId);

      const next: SiteContent = { ...current, hero: { ...current.hero }, footer: { ...current.footer } };
      if (str(ctx.body.ticker)) next.ticker = String(ctx.body.ticker).split("\n").map((t) => t.trim()).filter(Boolean);
      if (str(ctx.body.heroEyebrow)) next.hero.eyebrow = String(ctx.body.heroEyebrow);
      if (str(ctx.body.heroLead)) next.hero.lead = String(ctx.body.heroLead);
      if (Array.isArray(ctx.body.stats) && ctx.body.stats.length > 0) {
        next.stats = ctx.body.stats.filter((s) => !!s && typeof s === "object" && "value" in s && "label" in s) as StatItem[];
      }
      if (str(ctx.body.footerAbout)) next.footer.about = String(ctx.body.footerAbout);
      if (str(ctx.body.footerTagline)) next.footer.tagline = String(ctx.body.footerTagline);

      const row = await prisma.schoolSetting.upsert({
        where: { schoolId_key: { schoolId, key: CONTENT_KEY } },
        update: { value: next as never },
        create: { schoolId, key: CONTENT_KEY, value: next as never },
      });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "content.updated", entityType: "SchoolSetting", entityId: row.id, meta: { keys: Object.keys(ctx.body) } });
      return next;
    },

    reset: async (ctx) => {
      can(ctx, "content:manage");
      const schoolId = ctx.session.user.schoolId;
      await prisma.schoolSetting.deleteMany({ where: { schoolId, key: CONTENT_KEY } });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "content.reset", entityType: "SchoolSetting", entityId: schoolId });
      return DEFAULT_CONTENT;
    },
  },
};
