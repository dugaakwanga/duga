// ---------------------------------------------------------------------------
// Per-page website content — shared by the portal editor and the public web.
// Each site page has a small set of editable text fields. The portal writes
// them; the web renders them with these defaults as fallbacks. Keeping the
// field definitions here (in the browser-safe core package) means both apps
// agree on keys and defaults without duplication.
// ---------------------------------------------------------------------------

export type PageFieldType = "text" | "area" | "list" | "image" | "cards";

/** One generic card shape, reused by every "cards" field across every page. */
export interface PageCard {
  id: string;
  title?: string;
  subtitle?: string;
  text?: string;
  image?: string;
  meta?: string;
  href?: string;
  list?: string[];
}

export type CardFieldKey = "title" | "subtitle" | "text" | "image" | "meta" | "href" | "list";

export interface CardFieldDef {
  key: CardFieldKey;
  label: string;
  type?: "text" | "area" | "image" | "list";
}

export interface PageFieldDef {
  key: string;
  label: string;
  type: PageFieldType;
  /** Only present when type === "cards" — which slots of PageCard this field exposes. */
  cardFields?: CardFieldDef[];
  /** Only present when type === "cards" — label for the "Add …" button. */
  cardLabel?: string;
}

export interface PageDef {
  slug: string;
  label: string;
  fields: PageFieldDef[];
}

export type PageFields = Record<string, string | string[] | PageCard[]>;
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
      { key: "storyImage", label: "Story photo", type: "image" },
      { key: "teamImage", label: "Leadership team photo", type: "image" },
      {
        key: "valuesCards",
        label: "Core values",
        type: "cards",
        cardLabel: "value",
        cardFields: [
          { key: "title", label: "Title", type: "text" },
          { key: "text", label: "Text", type: "area" },
        ],
      },
      {
        key: "timelineCards",
        label: "Milestones",
        type: "cards",
        cardLabel: "milestone",
        cardFields: [
          { key: "meta", label: "Year", type: "text" },
          { key: "title", label: "Milestone", type: "text" },
          { key: "text", label: "Description", type: "area" },
        ],
      },
      {
        key: "leadershipCards",
        label: "Leadership team",
        type: "cards",
        cardLabel: "leader",
        cardFields: [
          { key: "title", label: "Name / title", type: "text" },
          { key: "subtitle", label: "Role", type: "text" },
          { key: "image", label: "Photo", type: "image" },
        ],
      },
      {
        key: "accreditCards",
        label: "Accreditation",
        type: "cards",
        cardLabel: "accreditation",
        cardFields: [
          { key: "title", label: "Accreditation", type: "text" },
          { key: "image", label: "Badge / logo (optional)", type: "image" },
        ],
      },
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
      { key: "primaryImage1", label: "Primary section photo 1", type: "image" },
      { key: "primaryImage2", label: "Primary section photo 2", type: "image" },
      { key: "secondaryImage1", label: "Secondary section photo 1", type: "image" },
      { key: "secondaryImage2", label: "Secondary section photo 2", type: "image" },
      { key: "extraImage1", label: "Beyond-the-classroom photo 1", type: "image" },
      { key: "extraImage2", label: "Beyond-the-classroom photo 2", type: "image" },
      {
        key: "primaryProgramCards",
        label: "Primary programmes",
        type: "cards",
        cardLabel: "programme",
        cardFields: [
          { key: "title", label: "Title", type: "text" },
          { key: "subtitle", label: "Age range", type: "text" },
          { key: "list", label: "Highlights (one per line)", type: "list" },
        ],
      },
      {
        key: "secondaryProgramCards",
        label: "Secondary programmes",
        type: "cards",
        cardLabel: "programme",
        cardFields: [
          { key: "title", label: "Title", type: "text" },
          { key: "subtitle", label: "Age range", type: "text" },
          { key: "list", label: "Highlights (one per line)", type: "list" },
        ],
      },
      {
        key: "extraCards",
        label: "Beyond the classroom",
        type: "cards",
        cardLabel: "item",
        cardFields: [
          { key: "title", label: "Title", type: "text" },
          { key: "text", label: "Text", type: "area" },
        ],
      },
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
      { key: "feesImage1", label: "Fees section photo 1", type: "image" },
      { key: "feesImage2", label: "Fees section photo 2", type: "image" },
      {
        key: "stepsCards",
        label: "How to apply — steps",
        type: "cards",
        cardLabel: "step",
        cardFields: [
          { key: "title", label: "Step title", type: "text" },
          { key: "text", label: "Step text", type: "area" },
        ],
      },
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
      { key: "image1", label: "Photo 1", type: "image" },
      { key: "image2", label: "Photo 2", type: "image" },
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
      {
        key: "statsCards",
        label: "Stat band",
        type: "cards",
        cardLabel: "stat",
        cardFields: [
          { key: "title", label: "Value (e.g. 20+)", type: "text" },
          { key: "subtitle", label: "Label", type: "text" },
        ],
      },
      {
        key: "graduateCards",
        label: "Recent graduates",
        type: "cards",
        cardLabel: "graduate",
        cardFields: [
          { key: "title", label: "Name", type: "text" },
          { key: "subtitle", label: "Class & year (e.g. SSS 3 · 2025)", type: "text" },
          { key: "text", label: "Achievement", type: "area" },
          { key: "meta", label: "University (optional)", type: "text" },
        ],
      },
      {
        key: "voiceCards",
        label: "Alumni voices",
        type: "cards",
        cardLabel: "voice",
        cardFields: [
          { key: "title", label: "Name", type: "text" },
          { key: "subtitle", label: "Role", type: "text" },
          { key: "text", label: "Quote", type: "area" },
        ],
      },
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
    storyImage: "/images/group pupils.png",
    teamImage: "/images/staff.png",
    valuesCards: [
      { id: "values-1", title: "Academic Excellence", text: "We set high standards and support every learner to meet them." },
      { id: "values-2", title: "Integrity", text: "We teach honesty, fairness and accountability in all things." },
      { id: "values-3", title: "Character", text: "Discipline, respect and godly values shape our daily life." },
      { id: "values-4", title: "Service", text: "We raise leaders who serve their communities and nation." },
    ],
    timelineCards: [
      { id: "timeline-1", meta: "2006", title: "Foundation", text: "De Ultimate Glory Academy opens its gates with a small nursery/primary class." },
      { id: "timeline-2", meta: "2013", title: "Secondary Section Launched", text: "The JSS arm begins, expanding the school into full primary and secondary education." },
      { id: "timeline-3", meta: "2018", title: "Boarding & Laboratories", text: "Hostel facilities and an integrated science laboratory are commissioned." },
      { id: "timeline-4", meta: "2024", title: "Digital Transformation", text: "Launch of the school portal with online results, fees and communication." },
      { id: "timeline-5", meta: "Today", title: "1,200+ Students", text: "A growing family of students, staff and alumni whose results speak for themselves." },
    ],
    leadershipCards: [
      { id: "leader-1", title: "Proprietor", subtitle: "Founder & Owner", image: "" },
      { id: "leader-2", title: "Principal", subtitle: "Head of School", image: "" },
      { id: "leader-3", title: "Registrar", subtitle: "Admissions & Records", image: "" },
      { id: "leader-4", title: "ICT Officer", subtitle: "Digital & e-learning", image: "" },
    ],
    accreditCards: [
      { id: "accredit-1", title: "Ministry of Education — Nasarawa State", image: "" },
      { id: "accredit-2", title: "Nigerian Basic Education Curriculum (BEC)", image: "" },
      { id: "accredit-3", title: "Accredited NECO & WAEC Candidate School", image: "" },
      { id: "accredit-4", title: "National Examinations Registration", image: "" },
    ],
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
    primaryImage1: "/images/pupil hands up.png",
    primaryImage2: "/images/single pupil.png",
    secondaryImage1: "/images/sec reading.png",
    secondaryImage2: "/images/single sec girl.png",
    extraImage1: "/images/single sec boy.png",
    extraImage2: "/images/sec reading.png",
    primaryProgramCards: [
      { id: "pp-1", title: "Pre-School & Foundation", subtitle: "Nursery – Primary 1", list: ["Early literacy & numeracy", "Phonics-based reading", "Play-based learning", "Character formation"] },
      { id: "pp-2", title: "Middle Primary", subtitle: "Primary 2 – Primary 4", list: ["Strong English & Maths foundations", "Introduction to sciences", "Moral & civic education", "Creative arts & music"] },
      { id: "pp-3", title: "Upper Primary", subtitle: "Primary 5 – Primary 6", list: ["Preparation for common entrance", "ICT & computer studies", "Project-based learning", "Leadership training"] },
    ],
    secondaryProgramCards: [
      { id: "sp-1", title: "Junior Secondary (JSS 1 – 3)", subtitle: "JSS 1 – JSS 3", list: ["9-year basic education curriculum", "BECE preparation", "Clubs & societies", "Career exploration"] },
      { id: "sp-2", title: "Senior Secondary (SSS 1 – 3)", subtitle: "SSS 1 – SSS 3", list: ["Preparation for national examinations", "Science, Arts & Commercial streams", "Mock examinations & tutorials", "University counselling"] },
      { id: "sp-3", title: "Boarding & Pastoral Care", subtitle: "Optional boarding", list: ["Safe, supervised hostels", "Night study & tutorials", "Welfare & mentorship", "24/7 staff supervision"] },
    ],
    extraCards: [
      { id: "extra-1", title: "Science Laboratory", text: "Hands-on practical work in biology, chemistry and physics." },
      { id: "extra-2", title: "ICT & Computer Studies", text: "Digital literacy from primary through senior secondary." },
      { id: "extra-3", title: "Library & Reading Culture", text: "A well-stocked library and weekly reading periods." },
      { id: "extra-4", title: "Clubs & Societies", text: "Debate, press, JETS, sports, literary and drama clubs." },
      { id: "extra-5", title: "Quizzes & Competitions", text: "Abacus, spelling bees, science fairs and maths olympiads." },
      { id: "extra-6", title: "Sports & Athletics", text: "Inter-house sports, football, athletics and PE." },
    ],
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
    feesImage1: "/images/group pupils.png",
    feesImage2: "/images/group 1 sec.png",
    stepsCards: [
      { id: "step-1", title: "Fill the application form", text: "Complete the online application form or pick up a physical form at the school office." },
      { id: "step-2", title: "Submit required documents", text: "Birth certificate, previous school report card, passport photograph and guardian ID." },
      { id: "step-3", title: "Assessment / interview", text: "Candidates sit a short entrance assessment; parents meet with the admissions team." },
      { id: "step-4", title: "Acceptance & payment", text: "Successful applicants receive an acceptance letter and fee schedule." },
      { id: "step-5", title: "Resumption", text: "Confirm your admission on the portal and resume on the announced date." },
    ],
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
    image1: "/images/primarypupil.png",
    image2: "/images/single sec girl.png",
  },
  graduates: {
    heroTitle: "Proud of every single one",
    heroSubtitle:
      "Two decades of young people who passed through DUGA and went on to great things. This is their story.",
    alumniKicker: "Alumni Voices",
    alumniHeading: "What our alumni say",
    statsCards: [
      { id: "stat-1", title: "20+", subtitle: "Years of excellence" },
      { id: "stat-2", title: "1,500+", subtitle: "Graduates & counting" },
      { id: "stat-3", title: "96%", subtitle: "National exam credit pass" },
      { id: "stat-4", title: "88%", subtitle: "Furthering to higher education" },
    ],
    graduateCards: [
      { id: "grad-1", title: "Grace Adama", subtitle: "SSS 3 · 2025", text: "8 distinctions in WAEC", meta: "University of Jos" },
      { id: "grad-2", title: "Emeka Okafor", subtitle: "SSS 3 · 2025", text: "Best student in Mathematics", meta: "Ahmadu Bello University" },
      { id: "grad-3", title: "Fatima Yusuf", subtitle: "SSS 3 · 2024", text: "School dux", meta: "Nasarawa State University" },
      { id: "grad-4", title: "David Musa", subtitle: "SSS 3 · 2024", text: "Outstanding in sciences", meta: "University of Nigeria, Nsukka" },
      { id: "grad-5", title: "Blessing Adewale", subtitle: "SSS 3 · 2023", text: "Head girl & JAMB merit award", meta: "University of Lagos" },
      { id: "grad-6", title: "Joseph Okon", subtitle: "SSS 3 · 2023", text: "National maths competition finalist", meta: "Federal University of Technology, Minna" },
      { id: "grad-7", title: "Sarah Ibrahim", subtitle: "SSS 3 · 2022", text: "Distinctions in all subjects", meta: "Bayero University Kano" },
      { id: "grad-8", title: "Peter Uche", subtitle: "SSS 3 · 2022", text: "Best in Physics", meta: "University of Benin" },
      { id: "grad-9", title: "Esther Danladi", subtitle: "SSS 3 · 2021", text: "School dux & model student", meta: "University of Abuja" },
      { id: "grad-10", title: "Samuel Nwosu", subtitle: "SSS 3 · 2021", text: "Top scorer in WAEC", meta: "Covenant University" },
    ],
    voiceCards: [
      { id: "voice-1", title: "Grace Adama", subtitle: "DUGA 2025 · University of Jos", text: "DUGA gave me more than grades — it gave me discipline and the confidence to dream bigger." },
      { id: "voice-2", title: "Emeka Okafor", subtitle: "DUGA 2025 · Ahmadu Bello University", text: "The teachers believed in me when I doubted myself. That support carried me through WAEC." },
      { id: "voice-3", title: "Blessing Adewale", subtitle: "DUGA 2023 · University of Lagos", text: "As head girl I learnt leadership early. DUGA's boarding life shaped my character for life." },
    ],
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

function randomId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function sanitizeCardRow(row: unknown, cardFields: CardFieldDef[]): PageCard {
  const src = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
  const card: Record<string, unknown> = { id: typeof src.id === "string" && src.id ? src.id : randomId() };
  for (const cf of cardFields) {
    const v = src[cf.key];
    if (cf.type === "list") {
      card[cf.key] = Array.isArray(v)
        ? v.map(String).filter(Boolean)
        : typeof v === "string"
          ? v.split("\n").map((s) => s.trim()).filter(Boolean)
          : [];
    } else {
      card[cf.key] = typeof v === "string" ? v : "";
    }
  }
  return card as unknown as PageCard;
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
    } else if (f.type === "cards") {
      page[f.key] = Array.isArray(val)
        ? val.map((row) => sanitizeCardRow(row, f.cardFields ?? []))
        : (DEFAULT_PAGES[def.slug]?.[f.key] as PageCard[] | undefined) ?? [];
    } else {
      // "text", "area" and "image" all persist as a plain string.
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
