import { prisma, logAudit } from "@duga/core/server";
import type { Module } from ".";
import { can, str } from "../helpers";

const CONTENT_KEY = "siteContent";

interface StatItem {
  value: number;
  suffix: string;
  label: string;
}

export interface HighlightItem {
  title: string;
  text: string;
}

export interface ProgrammeItem {
  img: string;
  tag: string;
  title: string;
  schedule: string;
  ages: string;
  text: string;
  href: string;
  cta: string;
}

export interface OfferItem {
  title: string;
  sub: string;
  href: string;
}

export interface SectionItem {
  kicker: string;
  title: string;
  text: string;
  href: string;
  link: string;
  img: string;
  alt: string;
  caption: string;
}

export interface TestimonialItem {
  quote: string;
  name: string;
  role: string;
}

export interface ContactItem {
  motto: string;
  founded: number;
  hours: string;
}

export interface SiteContent {
  tickerEnabled: boolean;
  ticker: string[];
  values: string[];
  hero: {
    eyebrow: string;
    lead: string;
  };
  stats: StatItem[];
  highlights: HighlightItem[];
  programmes: ProgrammeItem[];
  offers: OfferItem[];
  sections: SectionItem[];
  testimonials: TestimonialItem[];
  footer: {
    about: string;
    tagline: string;
  };
  contact: ContactItem;
}

export const DEFAULT_CONTENT: SiteContent = {
  tickerEnabled: true,
  ticker: [
    "Admissions open for the 2025/2026 session",
    "BECE 2025 — 98% credit pass",
    "New integrated science laboratory commissioned",
    "Boarding & day enrolment available",
    "Inter-house sports festival — Green House champions",
    "National examination preparation at accredited centres",
  ],
  values: ["Academic Excellence", "Discipline", "Character", "Innovation", "Service", "Integrity"],
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
  highlights: [
    { title: "Nursery to SSS 3", text: "One campus, one family — primary and secondary education under the same roof, from first letters to final national exams." },
    { title: "Modern Facilities", text: "A new integrated science laboratory, computer studies, a growing library and bright, spacious classrooms." },
    { title: "Boarding & Day", text: "Safe, well-supervised hostels with night study, mentorship and 24/7 care from dedicated housemasters." },
    { title: "School Transport", text: "Comfortable buses with clearly defined routes across Akwanga and its environs, morning and evening." },
    { title: "Experienced Teachers", text: "Qualified, caring staff who know every child by name and take each one's success personally." },
    { title: "Digital Learning", text: "Online classes, digital results and a parent portal for full transparency on fees, results and attendance." },
  ],
  programmes: [
    {
      img: "/images/primarypupil.png",
      tag: "Pre-School & Foundation",
      title: "Nursery to Primary 1",
      schedule: "Mon – Fri · 8:00am – 1:00pm",
      ages: "Ages 2 – 6",
      text: "A gentle, play-based start with phonics, early numeracy and strong character formation.",
      href: "/academics#primary",
      cta: "Explore Primary",
    },
    {
      img: "/images/group pupils.png",
      tag: "Primary Section",
      title: "Primary 1 – 6",
      schedule: "Mon – Fri · 8:00am – 2:30pm",
      ages: "Ages 6 – 12",
      text: "A rigorous foundation in literacy, numeracy and the sciences, with ICT and creative arts from day one.",
      href: "/academics#primary",
      cta: "Explore Primary",
    },
    {
      img: "/images/sec group 2.png",
      tag: "Secondary Section",
      title: "JSS 1 – SSS 3",
      schedule: "Mon – Fri · 8:00am – 3:30pm",
      ages: "Ages 12 – 18",
      text: "Fully prepared for BECE, WAEC, NECO and JAMB (sat at accredited centres) — with science labs, boarding and career guidance.",
      href: "/academics#secondary",
      cta: "Explore Secondary",
    },
  ],
  offers: [
    { title: "Academics", sub: "by Subject >", href: "/academics" },
    { title: "Admissions", sub: "How to apply >", href: "/admissions" },
    { title: "Boarding & Day", sub: "Hostel life >", href: "/academics#secondary" },
    { title: "News & Events", sub: "Latest updates >", href: "/news" },
    { title: "Parent Portal", sub: "Results & fees >", href: "" },
    { title: "Our School", sub: "Meet the family >", href: "/about" },
  ],
  sections: [
    {
      kicker: "Nursery · Primary 1–6",
      title: "The Primary Years",
      text: "A nurturing, hands-on foundation built on phonics, numeracy and good character. Our pupils are prepared for the common entrance — and for life.",
      href: "/academics#primary",
      link: "Explore primary",
      img: "/images/group pupils.png",
      alt: "Primary pupils of De Ultimate Glory Academy",
      caption: "Primary Section",
    },
    {
      kicker: "JSS 1 · SSS 3",
      title: "The Secondary Years",
      text: "From JSS 1 to SSS 3 we prepare students for BECE, WAEC, NECO and JAMB — sat at accredited examination centres — with strong teaching, science labs, ICT and career guidance.",
      href: "/academics#secondary",
      link: "Explore secondary",
      img: "/images/sec group 2.png",
      alt: "Secondary students of De Ultimate Glory Academy",
      caption: "Secondary Section",
    },
  ],
  testimonials: [
    {
      quote:
        "What I love about De Ultimate Glory Academy is the way the teachers know my children by name and push them to be their best — academically and as people. The results speak for themselves.",
      name: "Mrs. A. Okonkwo",
      role: "Parent of two pupils",
    },
    {
      quote:
        "The boarding house gives me total peace of mind. Night study, caring housemasters and regular updates from the portal — my daughter is safe, happy and focused.",
      name: "Mr. E. Ibrahim",
      role: "Parent of a boarding student",
    },
    {
      quote:
        "From phonics to common entrance, the primary section laid a solid foundation. My son moved to secondary fully prepared and confident.",
      name: "Mrs. F. Dangana",
      role: "Alumna parent",
    },
  ],
  footer: {
    about: "A co-educational Primary and Secondary school in Akwanga, Nasarawa State — building tomorrow's leaders with academic excellence and strong moral values.",
    tagline: "Imparting the winning wisdom in Nasarawa State.",
  },
  contact: {
    motto: "Imparting the Winning Wisdom",
    founded: 2006,
    hours: "Mon – Fri · 7:30am – 4:00pm",
  },
};

function asStrArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
  return out.length > 0 ? out : undefined;
}

function asObjArray<T>(v: unknown, guard: (x: Record<string, unknown>) => T | undefined): T[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v
    .map((x) => (x && typeof x === "object" ? guard(x as Record<string, unknown>) : undefined))
    .filter((x): x is T => !!x);
  return out.length > 0 ? out : undefined;
}

const guardHighlight = (x: Record<string, unknown>): HighlightItem | undefined => ({
  title: str(x.title) ?? "",
  text: str(x.text) ?? "",
});

const guardProgramme = (x: Record<string, unknown>): ProgrammeItem | undefined => ({
  img: str(x.img) ?? "",
  tag: str(x.tag) ?? "",
  title: str(x.title) ?? "",
  schedule: str(x.schedule) ?? "",
  ages: str(x.ages) ?? "",
  text: str(x.text) ?? "",
  href: str(x.href) ?? "",
  cta: str(x.cta) ?? "",
});

const guardOffer = (x: Record<string, unknown>): OfferItem | undefined => ({
  title: str(x.title) ?? "",
  sub: str(x.sub) ?? "",
  href: str(x.href) ?? "",
});

const guardSection = (x: Record<string, unknown>): SectionItem | undefined => ({
  kicker: str(x.kicker) ?? "",
  title: str(x.title) ?? "",
  text: str(x.text) ?? "",
  href: str(x.href) ?? "",
  link: str(x.link) ?? "",
  img: str(x.img) ?? "",
  alt: str(x.alt) ?? "",
  caption: str(x.caption) ?? "",
});

const guardTestimonial = (x: Record<string, unknown>): TestimonialItem | undefined => ({
  quote: str(x.quote) ?? "",
  name: str(x.name) ?? "",
  role: str(x.role) ?? "",
});

export function normalizeContent(value: unknown): SiteContent {
  const saved = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const hero = (saved.hero && typeof saved.hero === "object" ? saved.hero : {}) as Record<string, unknown>;
  const footer = (saved.footer && typeof saved.footer === "object" ? saved.footer : {}) as Record<string, unknown>;
  const contact = (saved.contact && typeof saved.contact === "object" ? saved.contact : {}) as Record<string, unknown>;
  const stats = Array.isArray(saved.stats)
    ? (saved.stats.filter(
        (s): s is StatItem => !!s && typeof s === "object" && "value" in s && "label" in s,
      ) as StatItem[])
    : DEFAULT_CONTENT.stats;
  return {
    tickerEnabled: typeof saved.tickerEnabled === "boolean" ? saved.tickerEnabled : DEFAULT_CONTENT.tickerEnabled,
    ticker: asStrArray(saved.ticker) ?? DEFAULT_CONTENT.ticker,
    values: asStrArray(saved.values) ?? DEFAULT_CONTENT.values,
    hero: {
      eyebrow: str(hero.eyebrow) ?? DEFAULT_CONTENT.hero.eyebrow,
      lead: str(hero.lead) ?? DEFAULT_CONTENT.hero.lead,
    },
    stats: stats.length > 0 ? stats : DEFAULT_CONTENT.stats,
    highlights: asObjArray(saved.highlights, guardHighlight) ?? DEFAULT_CONTENT.highlights,
    programmes: asObjArray(saved.programmes, guardProgramme) ?? DEFAULT_CONTENT.programmes,
    offers: asObjArray(saved.offers, guardOffer) ?? DEFAULT_CONTENT.offers,
    sections: asObjArray(saved.sections, guardSection) ?? DEFAULT_CONTENT.sections,
    testimonials: asObjArray(saved.testimonials, guardTestimonial) ?? DEFAULT_CONTENT.testimonials,
    footer: {
      about: str(footer.about) ?? DEFAULT_CONTENT.footer.about,
      tagline: str(footer.tagline) ?? DEFAULT_CONTENT.footer.tagline,
    },
    contact: {
      motto: str(contact.motto) ?? DEFAULT_CONTENT.contact.motto,
      founded: typeof contact.founded === "number" ? contact.founded : DEFAULT_CONTENT.contact.founded,
      hours: str(contact.hours) ?? DEFAULT_CONTENT.contact.hours,
    },
  };
}

async function loadContent(schoolId: string): Promise<SiteContent> {
  const row = await prisma.schoolSetting.findUnique({
    where: { schoolId_key: { schoolId, key: CONTENT_KEY } },
  });
  return normalizeContent(row?.value);
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

      const next: SiteContent = {
        ...current,
        hero: { ...current.hero },
        footer: { ...current.footer },
        contact: { ...current.contact },
      };
      if (typeof ctx.body.tickerEnabled === "boolean") next.tickerEnabled = ctx.body.tickerEnabled;
      if (str(ctx.body.ticker)) next.ticker = String(ctx.body.ticker).split("\n").map((t) => t.trim()).filter(Boolean);
      if (str(ctx.body.values)) next.values = String(ctx.body.values).split("\n").map((t) => t.trim()).filter(Boolean);
      if (str(ctx.body.heroEyebrow)) next.hero.eyebrow = String(ctx.body.heroEyebrow);
      if (str(ctx.body.heroLead)) next.hero.lead = String(ctx.body.heroLead);
      if (Array.isArray(ctx.body.stats) && ctx.body.stats.length > 0) {
        next.stats = ctx.body.stats.filter((s) => !!s && typeof s === "object" && "value" in s && "label" in s) as StatItem[];
      }
      if (Array.isArray(ctx.body.highlights)) {
        const items = asObjArray(ctx.body.highlights, guardHighlight);
        if (items) next.highlights = items;
      }
      if (Array.isArray(ctx.body.programmes)) {
        const items = asObjArray(ctx.body.programmes, guardProgramme);
        if (items) next.programmes = items;
      }
      if (Array.isArray(ctx.body.offers)) {
        const items = asObjArray(ctx.body.offers, guardOffer);
        if (items) next.offers = items;
      }
      if (Array.isArray(ctx.body.sections)) {
        const items = asObjArray(ctx.body.sections, guardSection);
        if (items) next.sections = items;
      }
      if (Array.isArray(ctx.body.testimonials)) {
        const items = asObjArray(ctx.body.testimonials, guardTestimonial);
        if (items) next.testimonials = items;
      }
      if (str(ctx.body.footerAbout)) next.footer.about = String(ctx.body.footerAbout);
      if (str(ctx.body.footerTagline)) next.footer.tagline = String(ctx.body.footerTagline);
      if (str(ctx.body.contactMotto)) next.contact.motto = String(ctx.body.contactMotto);
      if (typeof ctx.body.contactFounded === "number") next.contact.founded = ctx.body.contactFounded;
      if (str(ctx.body.contactHours)) next.contact.hours = String(ctx.body.contactHours);

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
