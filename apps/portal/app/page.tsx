"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "@/components/icons";
import { siteHomeUrl } from "@/lib/client/site";

interface RoleOption {
  role: string;
  section?: string;
  label: string;
  desc: string;
}

// Family portal: students (primary/secondary), parents and teachers.
// This page is a gate — picking a role leads to the email/password login.
const OPTIONS: RoleOption[] = [
  { role: "STUDENT", section: "PRIMARY", label: "Student — Primary", desc: "Results, timetable, assignments & learning" },
  { role: "STUDENT", section: "SECONDARY", label: "Student — Secondary", desc: "Results, timetable, assignments & learning" },
  { role: "PARENT", label: "Parent", desc: "Fees, results & communication" },
  { role: "TEACHER", label: "Teacher", desc: "Scores, classes & learning content" },
];

const FEATURED = [
  { src: "/images/group pupils.png", label: "Primary students" },
  { src: "/images/group 1 sec.png", label: "Secondary students" },
  { src: "/images/sec reading.png", label: "Learning in action" },
  { src: "/images/parent.png", label: "Parents & families" },
  { src: "/images/teacher.jpg", label: "Our teachers" },
  { src: "/images/single pupil.png", label: "Every child matters" },
];

export default function PortalLandingPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<RoleOption | null>(null);
  const [activeSlide, setActiveSlide] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => setActiveSlide((s) => (s + 1) % FEATURED.length), 3500);
    return () => window.clearInterval(interval);
  }, []);

  function onSelect(value: string) {
    const opt = OPTIONS.find((o) => `${o.role}:${o.section ?? ""}` === value);
    setSelected(opt ?? null);
  }

  const PORTAL_PATHS: Record<string, string> = {
    "STUDENT:PRIMARY": "/login/student/primary",
    "STUDENT:SECONDARY": "/login/student/secondary",
    "PARENT:": "/login/parent",
    "TEACHER:": "/login/teacher",
  };

  function choose() {
    if (!selected) return;
    const key = `${selected.role}:${selected.section ?? ""}`;
    router.push(PORTAL_PATHS[key] ?? `/login?role=${selected.role}&section=${selected.section ?? ""}`);
  }

  return (
    <div className="role-landing">
      <div className="role-stage">
        {FEATURED.map((s, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={s.src}
            src={s.src}
            alt={s.label}
            className={`role-stage-slide ${i === activeSlide ? "active" : ""}`}
          />
        ))}
        <div className="role-stage-scrim" />

        <div className="role-stage-caption">
          <span>School Portal</span>
          <p>For students, teachers &amp; parents</p>
        </div>

        <div className="role-stage-dots" aria-hidden="true">
          {FEATURED.map((s, i) => (
            <span key={s.src} title={s.label} className={i === activeSlide ? "active" : ""} />
          ))}
        </div>
      </div>

      <div className="role-card">
        <div className="role-card-head">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <Link href={siteHomeUrl} aria-label="De Ultimate Glory Academy home">
            <img src="/images/logo.png" alt="De Ultimate Glory Academy logo" />
          </Link>
          <h1>De Ultimate Glory Academy</h1>
          <p>Welcome. Choose who you are to open the student &amp; family portal.</p>
        </div>

        <div className="role-drop-field">
          <select
            className="role-drop-select"
            onChange={(e) => onSelect(e.target.value)}
            value={selected ? `${selected.role}:${selected.section ?? ""}` : ""}
          >
            <option value="" disabled>
              Select your role…
            </option>
            <optgroup label="Students">
              <option value="STUDENT:PRIMARY">Student — Primary</option>
              <option value="STUDENT:SECONDARY">Student — Secondary</option>
            </optgroup>
            <option value="PARENT:">Parent</option>
            <option value="TEACHER:">Teacher</option>
          </select>
        </div>

        {selected && (
          <div className="role-card-selected">
            <strong>{selected.label}</strong>
            <span>{selected.desc}</span>
            <button type="button" className="duga-btn duga-btn--primary duga-btn--lg duga-btn--arrow" onClick={choose}>
              Continue to sign in <ArrowRight size={16} className="mkt-arrow" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}