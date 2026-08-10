// ---------------------------------------------------------------------------
// Per-page website content — shared by the portal editor and the public web.
// Each site page has a small set of editable text fields. The portal writes
// them; the web renders them with these defaults as fallbacks. Keeping the
// field definitions here (in the browser-safe core package) means both apps
// agree on keys and defaults without duplication.
// ---------------------------------------------------------------------------

export type PageFieldType = "text" | "area" | "list";

export interface PageFieldDef {
  key: string;
  label: string;
  type: PageFieldType;
}

export interface PageDef {
  slug: string;
  label: string;
  fields: PageFieldDef[];
}

export type PageFields = Record<string, string | string[]>;
export type SitePages = Record<string, PageFields>;

export const PAGE_DEFS: PageDef[] = [
  {
    slug: "about",
    label: "About Us",
    fields: [
      { key: "heroTitle", label: "Hero title", type: "text" },
      { key: "heroSubtitle", label: "Hero subtitle", type: "area" },
      { key: "storyKicker", label: "Story kicker", type: "text" },
      { key: "storyHeading", label: "Story heading", type: "text" },
      { key: "storyPara1", label: "Story paragraph 1", type: "area" },
      { key: "storyPara2", label: "Story paragraph 2", type: "area" },
      { key: "missionHeading", label: "Mission heading", type: "text" },
      { key: "missionText", label: "Mission text", type: "area" },
      { key: "visionHeading", label: "Vision heading", type: "text" },
      { key: "visionText", label: "Vision text", type: "area" },
      { key: "valuesKicker", label: "Values kicker", type: "text" },
      { key: "valuesHeading", label: "Values heading", type: "text" },
      { key: "timelineKicker", label: "Milestones kicker", type: "text" },
      { key: "timelineHeading", label: "Milestones heading", type: "text" },
      { key: "leadershipKicker", label: "Leadership kicker", type: "text" },
      { key: "leadershipHeading", label: "Leadership heading", type: "text" },
      { key: "accreditKicker", label: "Accreditation kicker", type: "text" },
      { key: "accreditHeading", label: "Accreditation heading", type: "text" },
      { key: "ctaLabel", label: "Call-to-action label", type: "text" },
    ],
  },
  {
    slug: "academics",
    label: "Academics",
    fields: [
      { key: "heroTitle", label: "Hero title", type: "text" },
      { key: "heroSubtitle", label: "Hero subtitle", type: "area" },
      { key: "primaryKicker", label: "Primary kicker", type: "text" },
      { key: "primaryHeading", label: "Primary heading", type: "text" },
      { key: "primaryText", label: "Primary text", type: "area" },
      { key: "secondaryKicker", label: "Secondary kicker", type: "text" },
      { key: "secondaryHeading", label: "Secondary heading", type: "text" },
      { key: "secondaryText", label: "Secondary text", type: "area" },
      { key: "subjectsKicker", label: "Subjects kicker", type: "text" },
      { key: "subjectsHeading", label: "Subjects heading", type: "text" },
      { key: "subjectsPrimary", label: "Primary subjects (one per line)", type: "list" },
      { key: "subjectsJss", label: "Junior Secondary subjects (one per line)", type: "list" },
      { key: "subjectsSss", label: "Senior Secondary subjects (one per line)", type: "list" },
      { key: "extraKicker", label: "Beyond the classroom kicker", type: "text" },
      { key: "extraHeading", label: "Beyond the classroom heading", type: "text" },
      { key: "extraText", label: "Beyond the classroom text", type: "area" },
      { key: "ctaKicker", label: "CTA kicker", type: "text" },
      { key: "ctaHeading", label: "CTA heading", type: "text" },
      { key: "ctaLabel", label: "CTA button label", type: "text" },
    ],
  },
  {
    slug: "admissions",
    label: "Admissions",
    fields: [
      { key: "heroTitle", label: "Hero title", type: "text" },
      { key: "heroSubtitle", label: "Hero subtitle", type: "area" },
      { key: "stepsKicker", label: "Steps kicker", type: "text" },
      { key: "stepsHeading", label: "Steps heading", type: "text" },
      { key: "reqsKicker", label: "Requirements kicker", type: "text" },
      { key: "reqsHeading", label: "Requirements heading", type: "text" },
      { key: "requirements", label: "Admission requirements (one per line)", type: "list" },
      { key: "ctaTitle", label: "Ready-to-apply title", type: "text" },
      { key: "ctaText", label: "Ready-to-apply text", type: "area" },
      { key: "ctaLabel", label: "Ready-to-apply button label", type: "text" },
      { key: "feesKicker", label: "Fees kicker", type: "text" },
      { key: "feesHeading", label: "Fees heading", type: "text" },
      { key: "feesText", label: "Fees text", type: "area" },
      { key: "plan1Title", label: "Payment option 1 title", type: "text" },
      { key: "plan1Text", label: "Payment option 1 text", type: "area" },
      { key: "plan2Title", label: "Payment option 2 title", type: "text" },
      { key: "plan2Text", label: "Payment option 2 text", type: "area" },
      { key: "plan3Title", label: "Payment option 3 title", type: "text" },
      { key: "plan3Text", label: "Payment option 3 text", type: "area" },
    ],
  },
  {
    slug: "contact",
    label: "Contact",
    fields: [
      { key: "heroTitle", label: "Hero title", type: "text" },
      { key: "heroSubtitle", label: "Hero subtitle", type: "area" },
      { key: "formHeading", label: "Form heading", type: "text" },
      { key: "detailsHeading", label: "Details heading", type: "text" },
    ],
  },
  {
    slug: "apply",
    label: "Apply",
    fields: [
      { key: "heroTitle", label: "Hero title", type: "text" },
      { key: "heroSubtitle", label: "Hero subtitle", type: "area" },
      { key: "formHeading", label: "Form heading", type: "text" },
      { key: "prepKicker", label: "Before-you-begin kicker", type: "text" },
      { key: "prepHeading", label: "Before-you-begin heading", type: "text" },
      { key: "requirements", label: "Admission requirements (one per line)", type: "list" },
      { key: "note", label: "After-submit note", type: "area" },
    ],
  },
  {
    slug: "graduates",
    label: "Graduates",
    fields: [
      { key: "heroTitle", label: "Hero title", type: "text" },
      { key: "heroSubtitle", label: "Hero subtitle", type: "area" },
      { key: "alumniKicker", label: "Alumni voices kicker", type: "text" },
      { key: "alumniHeading", label: "Alumni voices heading", type: "text" },
    ],
  },
  {
    slug: "gallery",
    label: "Gallery",
    fields: [
      { key: "heroTitle", label: "Hero title", type: "text" },
      { key: "heroSubtitle", label: "Hero subtitle", type: "area" },
    ],
  },
  {
    slug: "news",
    label: "News",
    fields: [
      { key: "heroTitle", label: "Hero title", type: "text" },
      { key: "heroSubtitle", label: "Hero subtitle", type: "area" },
    ],
  },
  {
    slug: "testimonials",
    label: "Testimonials",
    fields: [
      { key: "heroTitle", label: "Hero title", type: "text" },
      { key: "heroSubtitle", label: "Hero subtitle", type: "area" },
    ],
  },
  {
    slug: "pta",
    label: "Parent-Teacher Association",
    fields: [
      { key: "heroTitle", label: "Hero title", type: "text" },
      { key: "heroSubtitle", label: "Hero subtitle", type: "area" },
      { key: "executivesKicker", label: "Executives kicker", type: "text" },
      { key: "executivesHeading", label: "Executives heading", type: "text" },
      { key: "meetingsKicker", label: "Meetings kicker", type: "text" },
      { key: "meetingsHeading", label: "Meetings heading", type: "text" },
      { key: "joinText", label: "Join / participation note", type: "area" },
    ],
  },
];

export const DEFAULT_PAGES: SitePages = {
  about: {
    heroTitle: "Our story, told with pride",
    heroSubtitle: "Over twenty years of raising leaders in Akwanga, Nasarawa State — with a mission that has never changed.",
    storyKicker: "Our Story",
    storyHeading: "It began with a simple vision",
    storyPara1:
      "Founded in 2006, De Ultimate Glory Academy began with a simple conviction — to give the children of Akwanga and Nasarawa State a school where academic rigour, discipline and strong moral values are taken seriously.",
    storyPara2:
      "Today, we run both a full Primary and Secondary section on one campus, with modern classrooms, a science laboratory, computer studies, a library, boarding facilities and school transport. Our graduates have progressed to leading secondary schools and universities across Nigeria.",
    missionHeading: "Our Mission",
    missionText:
      "To provide a holistic, affordable and high-quality education that nurtures the intellectual, moral and physical potential of every child — preparing them to excel in national examinations and in life.",
    visionHeading: "Our Vision",
    visionText:
      "To be the leading citadel of learning in Nasarawa State — producing disciplined, creative and God-fearing leaders who transform their communities and the nation.",
    valuesKicker: "Core Values",
    valuesHeading: "The principles we instil, every day",
    timelineKicker: "Milestones",
    timelineHeading: "A journey of growth",
    leadershipKicker: "Leadership",
    leadershipHeading: "The people behind our success",
    accreditKicker: "Accreditation",
    accreditHeading: "Recognised & accredited",
    ctaLabel: "Begin your child's journey",
  },
  academics: {
    heroTitle: "From first steps to final exams",
    heroSubtitle:
      "Structured, standards-based programmes for the Primary and Secondary sections — from phonics to final national exams (sat at accredited centres).",
    primaryKicker: "The Primary Section",
    primaryHeading: "Nursery to Primary 6 — strong foundations",
    primaryText: "Literacy, numeracy and character, taught with warmth and structure.",
    secondaryKicker: "The Secondary Section",
    secondaryHeading: "JSS 1 to SSS 3 — rigorous preparation",
    secondaryText:
      "BECE, WAEC, NECO and JAMB (sat at accredited centres) — plus the study skills to succeed beyond them.",
    subjectsKicker: "Subjects Offered",
    subjectsHeading: "A curriculum that covers everything",
    subjectsPrimary: [
      "English Studies", "Mathematics", "Basic Science & Technology", "Computer Studies",
      "Social Studies", "Civic Education", "Christian Religious Studies", "Quantitative & Verbal Reasoning",
      "Creative Arts", "Physical & Health Education", "Hausa / Arabic (optional)",
    ],
    subjectsJss: [
      "English Language", "Mathematics", "Basic Science", "Basic Technology", "Computer Studies",
      "Social Studies", "Civic Education", "CRS", "Business Studies", "Fine Arts", "Physical & Health Education",
    ],
    subjectsSss: [
      "English Language", "Mathematics", "Biology", "Physics", "Chemistry", "Further Mathematics",
      "Economics", "Commerce", "Literature-in-English", "Government", "CRS", "Geography", "Computer Studies",
    ],
    extraKicker: "Beyond the Classroom",
    extraHeading: "Learning goes far beyond textbooks",
    extraText: "Clubs, sports, competitions and creative arts — every child finds their spark.",
    ctaKicker: "Ready to join us?",
    ctaHeading: "Give your child access to an education that truly prepares them",
    ctaLabel: "Apply for Admission",
  },
  admissions: {
    heroTitle: "Joining our family is simple",
    heroSubtitle: "Applications are open for the 2025/2026 academic session. Follow the steps below to begin.",
    stepsKicker: "How to Apply",
    stepsHeading: "Five steps to admission",
    reqsKicker: "Requirements",
    reqsHeading: "Please have these ready",
    requirements: [
      "Completed application form",
      "Birth certificate or sworn affidavit",
      "Previous school transfer certificate / report card",
      "Four (4) recent passport photographs",
      "Parent / guardian identification",
      "Medical / immunization records",
      "BECE result (for JSS 1 & SSS 1 applicants, if available)",
    ],
    ctaTitle: "Ready to apply?",
    ctaText: "Start your application online now. It takes less than five minutes.",
    ctaLabel: "Start Online Application",
    feesKicker: "Fees & Payment",
    feesHeading: "Simple, transparent payment options",
    feesText: "Transparent fee schedules are shared after acceptance.",
    plan1Title: "Flexible Payment Plans",
    plan1Text: "Fees can be paid in installments with approval from the school office.",
    plan2Title: "Online Payments",
    plan2Text: "Pay tuition, hostel and transport fees securely via Paystack — card, transfer or USSD.",
    plan3Title: "Scholarships",
    plan3Text: "Outstanding students and siblings may qualify for discounts and scholarships.",
  },
  contact: {
    heroTitle: "We would love to hear from you",
    heroSubtitle: "Reach out to our admissions office for any enquiries — we respond within one working day.",
    formHeading: "Send us a message",
    detailsHeading: "Contact details",
  },
  apply: {
    heroTitle: "Begin your child's journey today",
    heroSubtitle: "Complete the application form below. Our admissions team will contact you within 48 hours.",
    formHeading: "Student Application Form",
    prepKicker: "Before you begin",
    prepHeading: "Have these handy",
    requirements: [
      "Completed application form",
      "Birth certificate or sworn affidavit",
      "Previous school transfer certificate / report card",
      "Four (4) recent passport photographs",
      "Parent / guardian identification",
      "Medical / immunization records",
      "BECE result (for JSS 1 & SSS 1 applicants, if available)",
    ],
    note: "After submitting, you will receive a confirmation reference. Keep it safe — you'll need it to track your application.",
  },
  graduates: {
    heroTitle: "Proud of every single one",
    heroSubtitle:
      "Two decades of young people who passed through DUGA and went on to great things. This is their story.",
    alumniKicker: "Alumni Voices",
    alumniHeading: "What our alumni say",
  },
  gallery: {
    heroTitle: "School life, in pictures",
    heroSubtitle: "A look at campus life, events, students and facilities at De Ultimate Glory Academy.",
  },
  news: {
    heroTitle: "The latest from our campus",
    heroSubtitle: "Announcements, achievements and updates from De Ultimate Glory Academy.",
  },
  testimonials: {
    heroTitle: "Words from our school family",
    heroSubtitle: "Parents, pupils and alumni share what De Ultimate Glory Academy means to them.",
  },
  pta: {
    heroTitle: "Working together for every child",
    heroSubtitle: "Our Parent-Teacher Association brings parents and teachers together to support the school community.",
    executivesKicker: "Our Executive",
    executivesHeading: "Meet the PTA executive",
    meetingsKicker: "Meetings",
    meetingsHeading: "Upcoming & past meetings",
    joinText: "All parents and guardians of enrolled pupils are automatic members. Join us at our next meeting.",
  },
};

/** Fields for a page, merged over the defaults for that page. */
export function mergePageFields(page: Partial<PageFields> | null | undefined, slug: string): PageFields {
  return { ...(DEFAULT_PAGES[slug] ?? {}), ...(page ?? {}) } as PageFields;
}

/** True when the value is a string array (a list field). */
export function isPageList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

/** Ensure a page object only contains known fields of the right shapes. */
export function sanitizePage(incoming: Record<string, unknown> | undefined, def: PageDef): PageFields {
  const page: PageFields = {};
  for (const f of def.fields) {
    const val = incoming?.[f.key];
    if (f.type === "list") {
      page[f.key] = Array.isArray(val)
        ? val.map(String).filter(Boolean)
        : typeof val === "string"
          ? val.split("\n").map((s) => s.trim()).filter(Boolean)
          : (DEFAULT_PAGES[def.slug]?.[f.key] as string[] | undefined) ?? [];
    } else {
      page[f.key] = typeof val === "string" ? val : (DEFAULT_PAGES[def.slug]?.[f.key] as string | undefined) ?? "";
    }
  }
  return page;
}

/** Build a complete pages map from stored JSON, filling defaults for missing pages/fields. */
export function normalizePages(value: unknown): SitePages {
  const saved = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const out: SitePages = {};
  for (const def of PAGE_DEFS) {
    const raw = saved[def.slug];
    out[def.slug] = sanitizePage(raw && typeof raw === "object" ? (raw as Record<string, unknown>) : undefined, def);
  }
  return out;
}
