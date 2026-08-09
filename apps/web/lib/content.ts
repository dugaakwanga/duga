export const school = {
  name: "De Ultimate Glory Academy",
  shortName: "DUGA",
  motto: "Imparting the Winning Wisdom",
  founded: 2006,
  address: "Akwanga, Nasarawa State, Nigeria",
  phone: "+234 803 000 0000",
  email: "info@deultimateglory.com",
};

export interface NewsPost {
  slug: string;
  title: string;
  date: string;
  category: string;
  excerpt: string;
  body: string[];
}

export const newsPosts: NewsPost[] = [
  {
    slug: "2025-2026-session-resumption",
    title: "Resumption Date for the 2025/2026 Academic Session",
    date: "2025-08-25",
    category: "Announcement",
    excerpt: "All students and parents are kindly informed that the new academic session begins on Monday, 8th September 2025.",
    body: [
      "The management of De Ultimate Glory Academy is pleased to announce that the 2025/2026 academic session will commence on Monday, 8th September 2025. All boarding students are expected to resume on Sunday, 7th September 2025.",
      "Parents are encouraged to complete fee payment and hostel clearance before the first day of school to avoid disruption to their wards' learning.",
      "New students and their parents/guardians should visit the admissions office with their required documents on or before resumption day.",
    ],
  },
  {
    slug: "jss3-basic-certificate-results",
    title: "JSS 3 Students Excel in 2025 Basic Education Examination",
    date: "2025-07-15",
    category: "Achievement",
    excerpt: "Our JSS 3 candidates recorded a 98% pass rate in the 2025 Basic Education Certificate Examination.",
    body: [
      "De Ultimate Glory Academy celebrates our JSS 3 candidates who sat for the 2025 Basic Education Certificate Examination (BECE). The school recorded a 98% credit pass rate, with several students scoring distinctions in Mathematics and English Language.",
      "This remarkable feat is a testament to the dedication of our teachers and the rigorous academic standards of the school.",
      "We congratulate the students and their parents, and we look forward to welcoming them back into our Senior Secondary School programme.",
    ],
  },
  {
    slug: "new-science-laboratory",
    title: "Commissioning of New Integrated Science Laboratory",
    date: "2025-06-02",
    category: "Facilities",
    excerpt: "DUGA has commissioned a modern integrated science laboratory to support hands-on learning in the sciences.",
    body: [
      "As part of our commitment to 21st-century education, De Ultimate Glory Academy has commissioned a new integrated science laboratory equipped for Biology, Chemistry and Physics practical work.",
      "The facility will enable our primary and secondary students to conduct experiments safely and deepen their understanding of scientific concepts.",
      "We thank the proprietors, staff, parents and friends of the school whose generosity made this project a reality.",
    ],
  },
  {
    slug: "inter-house-sports-festival",
    title: "Inter-House Sports Festival Holds in Grand Style",
    date: "2025-04-20",
    category: "Events",
    excerpt: "The annual inter-house sports festival brought together students, staff and parents for a day of athletics and fun.",
    body: [
      "The annual De Ultimate Glory Academy Inter-House Sports Festival took place on the school field with the Red, Blue, Green and Yellow houses competing in athletics, relay races and field events.",
      "Green House emerged as the overall champion. We commend all students for their sportsmanship and team spirit.",
      "Special thanks to the staff, parents and volunteers who ensured the event was a resounding success.",
    ],
  },
];

export interface GalleryItem {
  id: number;
  title: string;
  category: string;
  src: string;
  alt: string;
}

export const galleryItems: GalleryItem[] = [
  { id: 1, title: "Morning Assembly", category: "Students", src: "/images/group pupils.png", alt: "Primary pupils at morning assembly" },
  { id: 2, title: "Primary Learning", category: "Students", src: "/images/primarypupil.png", alt: "A primary pupil in uniform" },
  { id: 3, title: "Secondary Class", category: "Students", src: "/images/sec group 2.png", alt: "Secondary students in class" },
  { id: 4, title: "Campus Life", category: "Campus", src: "/images/group 1 sec.png", alt: "Secondary students on campus" },
  { id: 5, title: "A Day at School", category: "Students", src: "/images/single pupil.png", alt: "A pupil at their desk" },
  { id: 6, title: "Confidence", category: "Students", src: "/images/single sec girl.png", alt: "A secondary school girl" },
  { id: 7, title: "Pride & Character", category: "Students", src: "/images/single sec boy.png", alt: "A secondary school boy in uniform" },
];

export const primaryPrograms = [
  {
    title: "Pre-School & Foundation",
    range: "Nursery – Primary 1",
    points: ["Early literacy & numeracy", "Phonics-based reading", "Play-based learning", "Character formation"],
  },
  {
    title: "Middle Primary",
    range: "Primary 2 – Primary 4",
    points: ["Strong English & Maths foundations", "Introduction to sciences", "Moral & civic education", "Creative arts & music"],
  },
  {
    title: "Upper Primary",
    range: "Primary 5 – Primary 6",
    points: ["Preparation for common entrance", "ICT & computer studies", "Project-based learning", "Leadership training"],
  },
];

export const secondaryPrograms = [
  {
    title: "Junior Secondary (JSS 1 – 3)",
    range: "JSS 1 – JSS 3",
    points: ["9-year basic education curriculum", "BECE preparation", "Clubs & societies", "Career exploration"],
  },
  {
    title: "Senior Secondary (SSS 1 – 3)",
    range: "SSS 1 – SSS 3",
    points: ["Preparation for national examinations", "Science, Arts & Commercial streams", "Mock examinations & tutorials", "University counselling"],
  },
  {
    title: "Boarding & Pastoral Care",
    range: "Optional boarding",
    points: ["Safe, supervised hostels", "Night study & tutorials", "Welfare & mentorship", "24/7 staff supervision"],
  },
];

export const admissionSteps = [
  { step: 1, title: "Fill the application form", text: "Complete the online application form or pick up a physical form at the school office." },
  { step: 2, title: "Submit required documents", text: "Birth certificate, previous school report card, passport photograph and guardian ID." },
  { step: 3, title: "Assessment / interview", text: "Candidates sit a short entrance assessment; parents meet with the admissions team." },
  { step: 4, title: "Acceptance & payment", text: "Successful applicants receive an acceptance letter and fee schedule." },
  { step: 5, title: "Resumption", text: "Confirm your admission on the portal and resume on the announced date." },
];

export const admissionRequirements = [
  "Completed application form",
  "Birth certificate or sworn affidavit",
  "Previous school transfer certificate / report card",
  "Four (4) recent passport photographs",
  "Parent / guardian identification",
  "Medical / immunization records",
  "BECE result (for JSS 1 & SSS 1 applicants, if available)",
];

export interface Graduate {
  id: number;
  name: string;
  class: string;
  year: number;
  achievement: string;
  university?: string;
}

export const graduateStats = [
  { label: "Years of excellence", value: "20+" },
  { label: "Graduates & counting", value: "1,500+" },
  { label: "National exam credit pass", value: "96%" },
  { label: "Furthering to higher education", value: "88%" },
];

export const graduates: Graduate[] = [
  { id: 1, name: "Grace Adama", class: "SSS 3", year: 2025, achievement: "8 distinctions in WAEC", university: "University of Jos" },
  { id: 2, name: "Emeka Okafor", class: "SSS 3", year: 2025, achievement: "Best student in Mathematics", university: "Ahmadu Bello University" },
  { id: 3, name: "Fatima Yusuf", class: "SSS 3", year: 2024, achievement: "School dux", university: "Nasarawa State University" },
  { id: 4, name: "David Musa", class: "SSS 3", year: 2024, achievement: "Outstanding in sciences", university: "University of Nigeria, Nsukka" },
  { id: 5, name: "Blessing Adewale", class: "SSS 3", year: 2023, achievement: "Head girl & JAMB merit award", university: "University of Lagos" },
  { id: 6, name: "Joseph Okon", class: "SSS 3", year: 2023, achievement: "National maths competition finalist", university: "Federal University of Technology, Minna" },
  { id: 7, name: "Sarah Ibrahim", class: "SSS 3", year: 2022, achievement: "Distinctions in all subjects", university: "Bayero University Kano" },
  { id: 8, name: "Peter Uche", class: "SSS 3", year: 2022, achievement: "Best in Physics", university: "University of Benin" },
  { id: 9, name: "Esther Danladi", class: "SSS 3", year: 2021, achievement: "School dux & model student", university: "University of Abuja" },
  { id: 10, name: "Samuel Nwosu", class: "SSS 3", year: 2021, achievement: "Top scorer in WAEC", university: "Covenant University" },
];

export const alumniVoices = [
  {
    name: "Grace Adama",
    role: "DUGA 2025 · University of Jos",
    text: "DUGA gave me more than grades — it gave me discipline and the confidence to dream bigger.",
  },
  {
    name: "Emeka Okafor",
    role: "DUGA 2025 · Ahmadu Bello University",
    text: "The teachers believed in me when I doubted myself. That support carried me through WAEC.",
  },
  {
    name: "Blessing Adewale",
    role: "DUGA 2023 · University of Lagos",
    text: "As head girl I learnt leadership early. DUGA's boarding life shaped my character for life.",
  },
];
