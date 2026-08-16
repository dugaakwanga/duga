"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { hasPermission, type Permission, type Role } from "@duga/core";
import { Icon, Avatar } from "@duga/ui";
import { api, getActiveSection } from "@/lib/client/api";
import { siteHomeUrl } from "@/lib/client/site";
import { SectionProvider, useSection } from "@/components/SectionContext";
import type { Section } from "@/lib/sections";

interface NavItem {
  href: string;
  label: string;
  icon: Parameters<typeof Icon>[0]["name"];
  perm?: Permission;
  roles?: Role[];
  finance?: boolean;
  feature?: string;
  subfeature?: string;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

// Staff-facing navigation (teachers, admins, owner).
const STAFF_NAV: NavSection[] = [
  {
    title: "Overview",
    items: [
      { href: "/portal/dashboard", label: "Dashboard", icon: "dashboard" },
      { href: "/portal/progress", label: "School Progress", icon: "reports" },
    ],
  },
  {
    title: "Academics",
    items: [
      { href: "/portal/students", label: "Students", icon: "students", perm: "students:view", feature: "students" },
      { href: "/portal/classes", label: "Classes", icon: "classes", perm: "classes:view", feature: "classes" },
      { href: "/portal/timetable", label: "Timetable", icon: "timetable", perm: "timetable:view", feature: "timetable" },
      { href: "/portal/learning", label: "Learning", icon: "notes", perm: "learning:view", feature: "learning" },
      { href: "/portal/attendance", label: "Attendance", icon: "attendance", perm: "attendance:view", feature: "attendance" },
      { href: "/portal/results", label: "Results", icon: "results", perm: "results:view", feature: "results" },
      { href: "/portal/elearn", label: "E-Learning & Rewards", icon: "notes", perm: "elearn:view", feature: "elearn" },
      { href: "/portal/games", label: "Educational Games", icon: "quiz", perm: "games:play", feature: "games" },
    ],
  },
  {
    title: "My Teaching",
    items: [
      { href: "/portal/teacher", label: "Teaching Overview", icon: "home", perm: "learning:manage", feature: "learning" },
      { href: "/portal/teacher/subjects", label: "My Subjects", icon: "classes", perm: "learning:manage", feature: "learning" },
      { href: "/portal/teacher/notes", label: "Lesson Notes", icon: "notes", perm: "learning:manage", feature: "learning", subfeature: "learning:notes" },
      { href: "/portal/teacher/assignments", label: "Assignments", icon: "assignment", perm: "learning:manage", feature: "learning", subfeature: "learning:assignments" },
      { href: "/portal/teacher/cbt", label: "CBT Exams", icon: "quiz", perm: "learning:manage", feature: "learning", subfeature: "learning:cbt" },
      { href: "/portal/teacher/attendance", label: "Take Attendance", icon: "attendance", perm: "attendance:take", feature: "attendance" },
    ],
  },
  {
    title: "Attendance",
    items: [
      { href: "/portal/attendance/clock", label: "Clock In / Out", icon: "clock", perm: "staff:clock", feature: "attendance" },
      { href: "/portal/attendance/records", label: "Staff Clock Records", icon: "attendance", perm: "staff:attendance:view", feature: "attendance" },
    ],
  },
  {
    title: "Operations",
    items: [
      { href: "/portal/fees", label: "Fees & Payments", icon: "fees", perm: "fees:view", feature: "fees", subfeature: "finance" },
      { href: "/portal/payroll", label: "Payroll", icon: "fees", perm: "payroll:view", feature: "payroll", subfeature: "finance" },
      { href: "/portal/hostel", label: "Hostel", icon: "hostel", perm: "hostel:view", feature: "hostel" },
      { href: "/portal/transport", label: "Transport", icon: "bus", perm: "transport:view", feature: "transport" },
      { href: "/portal/applications", label: "Admissions", icon: "applications", perm: "applications:view", feature: "applications" },
      { href: "/portal/pta", label: "PTA", icon: "announcements", perm: "pta:view", feature: "pta" },
      { href: "/portal/library", label: "Library", icon: "notes", perm: "library:view", feature: "library" },
      { href: "/portal/reports", label: "Reports", icon: "reports", finance: true, feature: "reports", subfeature: "finance" },
    ],
  },
  {
    title: "Communication",
    items: [
      { href: "/portal/announcements", label: "Announcements", icon: "announcements", perm: "announcements:view", feature: "messaging" },
      { href: "/portal/messages", label: "Messages", icon: "messages", perm: "messaging:use", feature: "messaging" },
      { href: "/portal/notifications", label: "Notifications", icon: "notifications", feature: "messaging" },
    ],
  },
  {
    title: "Website",
    items: [
      { href: "/portal/content", label: "Website Content", icon: "announcements", perm: "content:manage", feature: "content" },
      { href: "/portal/gallery", label: "Gallery", icon: "applications", perm: "gallery:manage", feature: "content" },
      { href: "/portal/news", label: "News & Events", icon: "announcements", perm: "news:manage", feature: "content" },
    ],
  },
  {
    title: "Administration",
    items: [
      { href: "/portal/staff", label: "Staff", icon: "staff", perm: "staff:view", feature: "staff" },
      { href: "/portal/settings", label: "School Settings", icon: "settings", perm: "settings:manage", feature: "settings" },
      { href: "/portal/audit", label: "Audit Log", icon: "audit", perm: "audit:view", feature: "audit" },
    ],
  },
];

// Student-facing navigation — a portal built for pupils, not staff.
const STUDENT_NAV: NavSection[] = [
  {
    title: "Overview",
    items: [
      { href: "/portal/student", label: "My Home", icon: "home" },
      { href: "/portal/progress", label: "My Progress", icon: "reports" },
    ],
  },
  {
    title: "My Learning",
    items: [
      { href: "/portal/learning?kind=tests", label: "My CBT Exams", icon: "quiz", perm: "tests:take", feature: "learning", subfeature: "learning:cbt" },
      { href: "/portal/learning?kind=assignments", label: "My Assignments", icon: "assignment", perm: "assignments:submit", feature: "learning", subfeature: "learning:assignments" },
      { href: "/portal/learning?kind=notes", label: "Lesson Notes", icon: "notes", perm: "learning:view", feature: "learning", subfeature: "learning:notes" },
      { href: "/portal/elearn", label: "E-Learning & Rewards", icon: "notes", perm: "elearn:view", feature: "elearn" },
      { href: "/portal/games", label: "Educational Games", icon: "quiz", perm: "games:play", feature: "games" },
    ],
  },
  {
    title: "My School",
    items: [
      { href: "/portal/results", label: "My Results", icon: "results", perm: "results:view", feature: "results" },
      { href: "/portal/attendance", label: "My Attendance", icon: "attendance", perm: "attendance:view", feature: "attendance" },
      { href: "/portal/timetable", label: "My Timetable", icon: "timetable", perm: "timetable:view", feature: "timetable" },
      { href: "/portal/fees", label: "My Fees", icon: "fees", perm: "fees:view", feature: "fees", subfeature: "finance" },
      { href: "/portal/pta", label: "PTA", icon: "announcements", perm: "pta:view", feature: "pta" },
      { href: "/portal/library", label: "Library", icon: "notes", perm: "library:view", feature: "library" },
      { href: "/portal/hostel", label: "Hostel", icon: "hostel", perm: "hostel:view", feature: "hostel" },
      { href: "/portal/transport", label: "Transport", icon: "bus", perm: "transport:view", feature: "transport" },
    ],
  },
  {
    title: "Communication",
    items: [
      { href: "/portal/announcements", label: "Announcements", icon: "announcements", perm: "announcements:view", feature: "messaging" },
      { href: "/portal/messages", label: "Messages", icon: "messages", perm: "messaging:use", feature: "messaging" },
      { href: "/portal/notifications", label: "Notifications", icon: "notifications", feature: "messaging" },
    ],
  },
];

// Parent-facing navigation — a portal for guardians, not staff or students.
const PARENT_NAV: NavSection[] = [
  {
    title: "Overview",
    items: [
      { href: "/portal/parent", label: "My Family Home", icon: "home" },
      { href: "/portal/progress", label: "Children's Progress", icon: "reports" },
    ],
  },
  {
    title: "My Children",
    items: [
      { href: "/portal/results", label: "Results & Report Cards", icon: "results", perm: "results:view", feature: "results" },
      { href: "/portal/attendance", label: "Attendance", icon: "attendance", perm: "attendance:view", feature: "attendance" },
      { href: "/portal/timetable", label: "Timetable", icon: "timetable", perm: "timetable:view", feature: "timetable" },
      { href: "/portal/fees", label: "Fees & Payments", icon: "fees", perm: "fees:view", feature: "fees", subfeature: "finance" },
    ],
  },
  {
    title: "School Life",
    items: [
      { href: "/portal/learning", label: "Assignments & Exams", icon: "quiz", perm: "learning:view", feature: "learning" },
      { href: "/portal/pta", label: "PTA", icon: "announcements", perm: "pta:view", feature: "pta" },
      { href: "/portal/library", label: "Library", icon: "notes", perm: "library:view", feature: "library" },
      { href: "/portal/hostel", label: "Hostel", icon: "hostel", perm: "hostel:view", feature: "hostel" },
      { href: "/portal/transport", label: "Transport", icon: "bus", perm: "transport:view", feature: "transport" },
    ],
  },
  {
    title: "Communication",
    items: [
      { href: "/portal/announcements", label: "Announcements", icon: "announcements", perm: "announcements:view", feature: "messaging" },
      { href: "/portal/messages", label: "Messages", icon: "messages", perm: "messaging:use", feature: "messaging" },
      { href: "/portal/notifications", label: "Notifications", icon: "notifications", feature: "messaging" },
    ],
  },
];

// Context-aware AI suggestions: they follow where the user is in the portal
// and what they are trying to do, instead of a one-size-fits-all list.
function aiSuggestionsFor(path: string, role: string): Array<{ label: string; prompt: string }> {
  const isStaff = role === "TEACHER" || role === "ADMIN" || role === "OWNER" || role === "BURSAR";
  const isStudent = role === "STUDENT";
  const isParent = role === "PARENT";

  const byPage: Array<{ match: string; suggestions: Array<{ label: string; prompt: string }> }> = [
    {
      match: "/portal/students",
      suggestions: [
        { label: "Welcome a new student", prompt: "Draft a warm welcome message for a newly enrolled student and their family." },
        { label: "Set up student accounts", prompt: "What should I prepare when creating a new student account and parent login?" },
      ],
    },
    {
      match: "/portal/classes",
      suggestions: [
        { label: "Timetable tips", prompt: "Suggest a sensible weekly timetable for a Nigerian secondary school with JSS and SSS classes." },
        { label: "Periods per subject", prompt: "How many weekly periods should core subjects like Mathematics and English get?" },
      ],
    },
    {
      match: "/portal/teacher/notes",
      suggestions: [{ label: "Draft a lesson note", prompt: "Draft a lesson note on 'Photosynthesis' for Basic 5 Science." }],
    },
    {
      match: "/portal/teacher/assignments",
      suggestions: [{ label: "Assignment idea", prompt: "Suggest a homework assignment on Nigeria's independence for JSS 1." }],
    },
    {
      match: "/portal/teacher/cbt",
      suggestions: [{ label: "Create a quiz", prompt: "Create 5 multiple-choice questions on fractions for Primary 4." }],
    },
    {
      match: "/portal/results",
      suggestions: isStaff
        ? [{ label: "Report card remark", prompt: "Write a report card remark for a student doing well in most subjects but needing improvement in mathematics." }]
        : isParent
          ? [{ label: "Understand results", prompt: "Help me understand what my child's report card results mean." }]
          : [{ label: "Improve my results", prompt: "How can I improve my grades before the next exam?" }],
    },
    {
      match: "/portal/fees",
      suggestions: isParent
        ? [{ label: "Fees explained", prompt: "Explain how school fees work and what my balance means." }]
        : isStudent
          ? [{ label: "My fees balance", prompt: "Help me understand my school fees balance and payment." }]
          : [{ label: "Fees summary", prompt: "How should I follow up on outstanding school fees politely?" }],
    },
    {
      match: "/portal/progress",
      suggestions: [{ label: "Understand progress", prompt: "What does this progress data tell us and how can we improve it?" }],
    },
    {
      match: "/portal/parent",
      suggestions: [
        { label: "Support my child", prompt: "How can I help my child improve their reading at home?" },
        { label: "School–parent teamwork", prompt: "How can parents and teachers work together to improve a child's performance?" },
      ],
    },
    {
      match: "/portal/student",
      suggestions: [
        { label: "Explain a topic", prompt: "Explain fractions simply to a primary school student." },
        { label: "Practice questions", prompt: "Give me 5 practice questions on photosynthesis with answers." },
      ],
    },
    {
      match: "/portal/learning",
      suggestions: isStudent
        ? [{ label: "Study tips", prompt: "Give me tips for studying for my exams." }]
        : [{ label: "Set up learning", prompt: "How should I organise lesson notes, assignments and CBT exams for a term?" }],
    },
  ];

  for (const p of byPage) {
    if (path.startsWith(p.match)) return p.suggestions;
  }

  if (isStaff)
    return [
      { label: "Report card comment", prompt: "Write a report card remark for a student doing well in most subjects but needing improvement in mathematics." },
      { label: "Draft a lesson note", prompt: "Draft a lesson note on the topic 'Photosynthesis' for Basic 5 Science." },
      { label: "Create a quiz", prompt: "Create 5 multiple-choice questions on fractions for Primary 4." },
      { label: "Assignment idea", prompt: "Suggest a homework assignment on Nigeria's independence for JSS 1." },
    ];
  if (isStudent)
    return [
      { label: "Explain a topic", prompt: "Explain fractions simply to a primary school student." },
      { label: "Practice questions", prompt: "Give me 5 practice questions on photosynthesis with answers." },
      { label: "Study tips", prompt: "Give me tips for studying for my exams." },
    ];
  return [
    { label: "Help my child", prompt: "How can I help my child improve their reading at home?" },
    { label: "Understand progress", prompt: "What should a good report card look like? Help me understand my child's progress." },
  ];
}

const TITLES: Array<{ match: string; title: string }> = [
  { match: "/portal/dashboard", title: "Dashboard" },
  { match: "/portal/progress", title: "Progress" },
  { match: "/portal/student", title: "My Home" },
  { match: "/portal/parent", title: "My Family Home" },
  { match: "/portal/attendance/clock", title: "Clock In / Out" },
  { match: "/portal/attendance/records", title: "Staff Clock Records" },
  { match: "/portal/students", title: "Students" },
  { match: "/portal/classes", title: "Classes" },
  { match: "/portal/timetable", title: "Timetable" },
  { match: "/portal/learning", title: "Learning" },
  { match: "/portal/attendance", title: "Attendance" },
  { match: "/portal/results", title: "Results" },
  { match: "/portal/elearn", title: "E-Learning & Rewards" },
  { match: "/portal/games", title: "Educational Games" },
  { match: "/portal/teacher", title: "Teaching Overview" },
  { match: "/portal/teacher/subjects", title: "My Subjects" },
  { match: "/portal/teacher/notes", title: "Lesson Notes" },
  { match: "/portal/teacher/assignments", title: "Assignments" },
  { match: "/portal/teacher/cbt", title: "CBT Exams" },
  { match: "/portal/teacher/attendance", title: "Take Attendance" },
  { match: "/portal/fees", title: "Fees & Payments" },
  { match: "/portal/hostel", title: "Hostel" },
  { match: "/portal/transport", title: "Transport" },
  { match: "/portal/applications", title: "Admissions" },
  { match: "/portal/pta", title: "PTA" },
  { match: "/portal/library", title: "Library" },
  { match: "/portal/reports", title: "Reports" },
  { match: "/portal/messages", title: "Messages" },
    { match: "/portal/announcements", title: "Announcements" },
  { match: "/portal/notifications", title: "Notifications" },
  { match: "/portal/gallery", title: "Website Gallery" },
  { match: "/portal/news", title: "News & Events" },
  { match: "/portal/content", title: "Website Content" },
  { match: "/portal/staff", title: "Staff" },
  { match: "/portal/settings", title: "School Settings" },
  { match: "/portal/audit", title: "Audit Log" },
  { match: "/portal/profile", title: "My Profile" },
];

interface ShellUser {
  id: string;
  name: string;
  role: Role;
  schoolId: string;
  photoUrl?: string | null;
  designation?: string | null;
  financeAccess?: boolean;
  features?: string[];
  subfeatures?: string[];
  sections?: Section[];
  canSwitchSection?: boolean;
}

// Primary | Secondary switcher shown to admins/bursars; auto-scoped pill for
// teachers (based on the classes assigned to them).
function SectionSwitcher() {
  const { section, available, canSwitch, setSection } = useSection();
  if (available.length === 0) return null;
  if (canSwitch) {
    return (
      <div className="duga-seg" aria-label="School section">
        {available.map((s) => (
          <button
            key={s}
            className={section === s ? "active" : ""}
            onClick={() => setSection(s)}
            aria-pressed={section === s}
          >
            {s === "SECONDARY" ? "Secondary" : "Primary"}
          </button>
        ))}
      </div>
    );
  }
  return (
    <div className="duga-seg duga-seg--locked" title="Auto-scoped to your assigned classes">
      <span>{available[0] === "SECONDARY" ? "Secondary" : "Primary"}</span>
    </div>
  );
}

export function PortalShell({ user, children }: { user: ShellUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifs, setNotifs] = useState<Array<{ id: string; title: string; body: string; read: boolean; link?: string | null; createdAt: string }>>([]);
  const [notifCount, setNotifCount] = useState(0);

  const [aiOpen, setAiOpen] = useState(false);
  const [aiMessages, setAiMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [aiInput, setAiInput] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiPreset, setAiPreset] = useState<string | null>(null);
  const aiScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (aiOpen && aiScrollRef.current) aiScrollRef.current.scrollTop = aiScrollRef.current.scrollHeight;
  }, [aiMessages, aiOpen]);

  // Allow any page to open the assistant with a suggested prompt.
  useEffect(() => {
    const onAiPrompt = (e: Event) => {
      const detail = (e as CustomEvent).detail as string | undefined;
      if (detail) {
        setAiPreset(detail);
        setAiInput(detail);
        setAiOpen(true);
      }
    };
    window.addEventListener("duga-ai-prompt", onAiPrompt);
    return () => window.removeEventListener("duga-ai-prompt", onAiPrompt);
  }, []);

  async function sendAi(text: string) {
    const prompt = text.trim();
    if (!prompt || aiBusy) return;
    setAiMessages((prev) => [...prev, { role: "user", content: prompt }]);
    setAiInput("");
    setAiPreset(null);
    setAiBusy(true);
    try {
      const d = await api<{ reply: string }>("ai/chat", { method: "POST", body: { messages: [...aiMessages, { role: "user", content: prompt }], page: pathname, section: getActiveSection() ?? undefined }, loading: false });
      setAiMessages((prev) => [...prev, { role: "assistant", content: d.reply }]);
    } catch (e) {
      setAiMessages((prev) => [...prev, { role: "assistant", content: (e as Error).message }]);
    } finally {
      setAiBusy(false);
    }
  }

  const aiSuggestions = aiSuggestionsFor(pathname, user.role);

  const loadNotifs = useCallback(async () => {
    try {
      const data = await api<{ items: Array<{ id: string; title: string; body: string; read: boolean; link?: string | null; createdAt: string }> }>("messages/notifications", { loading: false });
      setNotifs(data.items);
      setNotifCount(data.items.filter((n) => !n.read).length);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    loadNotifs();
    const t = setInterval(loadNotifs, 45000);
    return () => clearInterval(t);
  }, [loadNotifs]);

  async function markAllRead() {
    try {
      await api("messages/notificationsRead", { method: "POST", loading: false });
      setNotifs((prev) => prev.map((n) => ({ ...n, read: true })));
      setNotifCount(0);
    } catch {
      /* ignore */
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const baseNav = user.role === "STUDENT" ? STUDENT_NAV : user.role === "PARENT" ? PARENT_NAV : STAFF_NAV;
  const sections = baseNav
    .map((s) => ({
      ...s,
      items: s.items.filter(
        (i) =>
          (!i.finance || user.role === "OWNER" || ((user.role === "ADMIN" || user.role === "BURSAR") && user.financeAccess)) &&
          (!i.perm || hasPermission(user.role, i.perm)) &&
          (!i.roles || i.roles.includes(user.role)) &&
          (!i.feature || !user.features || user.features.includes(i.feature)) &&
          (!i.subfeature || !user.subfeatures || user.subfeatures.includes(i.subfeature)),
      ),
    }))
    .filter((s) => s.items.length > 0);

  const pageTitle = TITLES.find((t) => pathname === t.match || pathname.startsWith(t.match + "/"))?.title ?? "Portal";

  return (
    <SectionProvider available={user.sections ?? []} canSwitch={user.canSwitchSection ?? false}>
      <div className="portal-shell">
      {sidebarOpen && <div className="portal-sidebar-scrim" onClick={() => setSidebarOpen(false)} />}
      <aside className={`portal-sidebar${sidebarOpen ? " open" : ""}`}>
        <div className="portal-sidebar__brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <Link href={siteHomeUrl} aria-label="De Ultimate Glory Academy home">
            <img src="/images/logo.png" alt="De Ultimate Glory Academy" />
          </Link>
          <div>
            <div className="portal-sidebar__name">De Ultimate Glory</div>
            <div className="portal-sidebar__sub">Academy Portal</div>
          </div>
        </div>
        <nav className="portal-nav">
          {sections.map((section) => (
            <div key={section.title}>
              <div className="portal-nav__section">{section.title}</div>
              {section.items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <Link key={item.href} href={item.href} className={active ? "active" : ""} onClick={() => setSidebarOpen(false)}>
                    <Icon name={item.icon} size={18} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
          <div className="portal-nav__section">Account</div>
          <Link href="/portal/profile" className={pathname === "/portal/profile" ? "active" : ""} onClick={() => setSidebarOpen(false)}>
            <Icon name="settings" size={18} />
            My Profile
          </Link>
        </nav>
        <div className="portal-sidebar__foot">De Ultimate Glory Academy · Akwanga</div>
      </aside>

      <div className="portal-main">
        <header className="portal-topbar">
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <button className="duga-btn duga-btn--ghost duga-btn--sm portal-mobile-toggle" onClick={() => setSidebarOpen((v) => !v)} aria-label="Toggle menu">
              <Icon name="menu" size={18} />
            </button>
            <div className="portal-topbar__title">{pageTitle}</div>
          </div>

          <div className="portal-topbar__actions">
            <SectionSwitcher />
            <div className="portal-topbar__user">
              <Avatar name={user.name} src={user.photoUrl} size={38} />
              <div className="portal-topbar__user-details">
                <div className="portal-topbar__user-name">{user.name}</div>
                <div className="portal-topbar__user-role">{user.role.toLowerCase()}{user.designation ? ` · ${user.designation}` : ""}</div>
              </div>
            </div>

            <div className="portal-bell">
              <button className="duga-btn duga-btn--ghost duga-btn--sm" onClick={() => { setNotifOpen((v) => !v); if (!notifOpen) loadNotifs(); }}>
                <Icon name="notifications" size={20} />
              </button>
              {notifCount > 0 && <span className="portal-bell__dot" />}
              {notifOpen && (
                <div className="portal-notif">
                  <div className="duga-card__header">
                    <div className="duga-card__title">Notifications</div>
                    <button className="duga-btn duga-btn--ghost duga-btn--sm" onClick={markAllRead}>Mark all read</button>
                  </div>
                  {notifs.length === 0 && <div className="duga-card__pad" style={{ color: "var(--duga-muted)", fontSize: 13 }}>You&apos;re all caught up.</div>}
                  {notifs.map((n) => (
                    <div
                      key={n.id}
                      className={`portal-notif-item${n.read ? "" : " unread"}`}
                      onClick={() => {
                        if (n.link) router.push(n.link);
                        setNotifOpen(false);
                      }}
                    >
                      <div style={{ fontWeight: n.read ? 500 : 700, fontSize: 13.5 }}>{n.title}</div>
                      <div style={{ fontSize: 12.5, color: "var(--duga-muted)" }}>{n.body}</div>
                      <div style={{ fontSize: 11, color: "var(--duga-muted)", marginTop: 4 }}>
                        {new Date(n.createdAt).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button className="duga-btn duga-btn--ghost duga-btn--sm portal-topbar__signout" onClick={logout} title="Sign out" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Icon name="logout" size={18} />
              <span>Sign out</span>
            </button>
          </div>
        </header>

        <main className="portal-content">{children}</main>
      </div>

      {/* AI assistant floating panel */}
      {aiOpen && (
        <div className="duga-ai-scrim" onClick={() => setAiOpen(false)} />
      )}
      <div className={`duga-ai${aiOpen ? " open" : ""}`}>
        {aiOpen && (
          <>
            <div className="duga-ai__head">
              <div>
                <div className="duga-ai__title">AI Assistant</div>
                <div className="duga-ai__sub">Helping with {pageTitle}</div>
              </div>
              <button className="duga-btn duga-btn--ghost duga-btn--sm" onClick={() => setAiOpen(false)} aria-label="Close assistant">
                <Icon name="back" size={16} />
              </button>
            </div>
            <div className="duga-ai__body" ref={aiScrollRef}>
              {aiMessages.length === 0 ? (
                <div className="duga-ai__empty">
                  <div className="duga-ai__logo">AI</div>
                  <p>
                    I can see you&apos;re on <strong>{pageTitle}</strong>. Ask me anything about it — homework help, lesson
                    notes, report card comments or study tips.
                  </p>
                  <div className="duga-ai__chips">
                    {aiSuggestions.map((s) => (
                      <button key={s.label} className="duga-btn duga-btn--outline duga-btn--sm" onClick={() => sendAi(s.prompt)}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="duga-ai__msgs">
                  {aiMessages.map((m, i) => (
                    <div key={i} className={`duga-ai__msg ${m.role}`}>
                      <div className="duga-ai__bubble">{m.content}</div>
                    </div>
                  ))}
                  {aiBusy && (
                    <div className="duga-ai__msg assistant">
                      <div className="duga-ai__bubble">
                        <span className="duga-ai__typing" aria-label="AI is typing">
                          <span />
                          <span />
                          <span />
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {aiPreset && !aiBusy && (
                <div className="duga-ai__preset">
                  Suggested: <button className="duga-btn duga-btn--ghost duga-btn--sm" onClick={() => sendAi(aiPreset)}>{aiPreset}</button>
                </div>
              )}
            </div>
            <form
              className="duga-ai__input"
              onSubmit={(e) => {
                e.preventDefault();
                sendAi(aiInput);
              }}
            >
              <input
                value={aiInput}
                onChange={(e) => setAiInput(e.target.value)}
                placeholder="Ask the AI assistant…"
                aria-label="Ask the AI assistant"
              />
              <button className="duga-btn duga-btn--accent duga-btn--md" type="submit" disabled={aiBusy || !aiInput.trim()}>
                Send
              </button>
            </form>
          </>
        )}
        {!aiOpen && (
          <button className="duga-ai__fab" onClick={() => setAiOpen(true)} aria-label="Open AI assistant">
            <Icon name="notes" size={20} /> AI
          </button>
        )}
      </div>
      </div>
    </SectionProvider>
  );
}
