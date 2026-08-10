import { portalUrl } from "@/lib/content";

export interface SiteStat {
  value: number;
  suffix: string;
  label: string;
}
export interface SiteHighlight {
  title: string;
  text: string;
}
export interface SiteProgramme {
  img: string;
  tag: string;
  title: string;
  schedule: string;
  ages: string;
  text: string;
  href: string;
  cta: string;
}
export interface SiteOffer {
  title: string;
  sub: string;
  href: string;
}
export interface SiteSection {
  kicker: string;
  title: string;
  text: string;
  href: string;
  link: string;
  img: string;
  alt: string;
  caption: string;
}
export interface SiteTestimonial {
  quote: string;
  name: string;
  role: string;
}
export interface SiteContentData {
  tickerEnabled: boolean;
  ticker: string[];
  values: string[];
  hero: { eyebrow: string; lead: string };
  stats: SiteStat[];
  highlights: SiteHighlight[];
  programmes: SiteProgramme[];
  offers: SiteOffer[];
  sections: SiteSection[];
  testimonials: SiteTestimonial[];
  footer: { about: string; tagline: string };
  contact: { motto: string; founded: number; hours: string };
}
export interface SiteSchoolInfo {
  id: string;
  name: string;
  shortName: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  logoUrl: string | null;
}

export const FALLBACK_CONTENT: SiteContentData = {
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

export function mergeContent(data: Partial<SiteContentData> | null | undefined): SiteContentData {
  if (!data) return FALLBACK_CONTENT;
  return {
    ...FALLBACK_CONTENT,
    ...data,
    hero: { ...FALLBACK_CONTENT.hero, ...(data.hero ?? {}) },
    footer: { ...FALLBACK_CONTENT.footer, ...(data.footer ?? {}) },
    contact: { ...FALLBACK_CONTENT.contact, ...(data.contact ?? {}) },
  };
}

export async function getSiteData(): Promise<{ school: SiteSchoolInfo | null; content: SiteContentData | null }> {
  try {
    const res = await fetch(`${portalUrl}/api/public/site`, { cache: "no-store" });
    const json = await res.json();
    if (json?.ok && json.data) {
      return { school: json.data.school ?? null, content: json.data.content ?? null };
    }
  } catch {
    /* portal offline — caller falls back to defaults */
  }
  return { school: null, content: null };
}
