// ---------------------------------------------------------------------------
// Public website registry — shared by the superadmin control panel and the
// public web app. The superadmin can switch these on/off per school; the web
// app reads the resulting configuration to hide pages and sections.
// Browser-safe (importable from both the portal and the public site).
// ---------------------------------------------------------------------------

export interface WebPageDef {
  slug: string;
  label: string;
}

export interface WebFeatureDef {
  id: string;
  label: string;
  /** Short line explaining what toggling it changes for visitors. */
  hint: string;
}

/** Public site pages the superadmin can enable or disable per school. */
export const WEB_PAGES: WebPageDef[] = [
  { slug: "about", label: "About Us" },
  { slug: "academics", label: "Academics" },
  { slug: "admissions", label: "Admissions" },
  { slug: "apply", label: "Online Application" },
  { slug: "graduates", label: "Graduates" },
  { slug: "testimonials", label: "Testimonials" },
  { slug: "gallery", label: "Gallery" },
  { slug: "news", label: "News" },
  { slug: "pta", label: "PTA" },
  { slug: "contact", label: "Contact" },
];

export const WEB_PAGE_SLUGS: string[] = WEB_PAGES.map((p) => p.slug);

/** Sections/features of the public site the superadmin can turn off. */
export const WEB_FEATURES: WebFeatureDef[] = [
  { id: "ticker", label: "Announcement ticker", hint: "The scrolling message bar at the top of the site." },
  { id: "hero", label: "Home hero", hint: "Opening hero with headline and photos." },
  { id: "programmes", label: "Featured programmes", hint: "Classes for every stage section on the homepage." },
  { id: "highlights", label: "Why DUGA highlights", hint: "The numbered benefits cards on the homepage." },
  { id: "sections", label: "Primary & secondary sections", hint: "One school, two journeys overview." },
  { id: "offers", label: "Our offerings grid", hint: "Browse-by-topic links on the homepage." },
  { id: "statBand", label: "Statistics band", hint: "Years, students, pass-rate counters." },
  { id: "portalPromo", label: "Portal promo", hint: "Section advertising the school portal." },
  { id: "gallery", label: "Gallery preview", hint: "Photo gallery section on the homepage (and the Gallery page)." },
  { id: "news", label: "News preview", hint: "Latest news section on the homepage (and the News page)." },
  { id: "testimonials", label: "Testimonials", hint: "Parent & alumni quotes." },
  { id: "newsletter", label: "Newsletter signup", hint: "Email signup block." },
  { id: "finalCta", label: "Closing call-to-action", hint: "Final apply/contact banner." },
];

export const WEB_FEATURE_IDS: string[] = WEB_FEATURES.map((f) => f.id);

/** Ensure a stored value only contains known page slugs. */
export function sanitizeWebPages(value: unknown): string[] {
  if (!Array.isArray(value)) return [...WEB_PAGE_SLUGS];
  return [...new Set(value.filter((x): x is string => typeof x === "string" && WEB_PAGE_SLUGS.includes(x)))];
}

/** Ensure a stored value only contains known web feature ids. */
export function sanitizeWebFeatures(value: unknown): string[] {
  if (!Array.isArray(value)) return [...WEB_FEATURE_IDS];
  return [...new Set(value.filter((x): x is string => typeof x === "string" && WEB_FEATURE_IDS.includes(x)))];
}