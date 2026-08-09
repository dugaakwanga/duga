"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "@/components/icons";
import { siteHomeUrl } from "@/lib/client/site";

interface RoleOption {
  role: string;
  label: string;
  desc: string;
  img: string;
}

// Admin console: administrators and the proprietor only.
const OPTIONS: RoleOption[] = [
  { role: "ADMIN", label: "Admin / Staff", desc: "Register, hostels, transport & reporting", img: "/images/logo.png" },
  { role: "OWNER", label: "Proprietor", desc: "Full control & oversight", img: "/images/logo.png" },
];

export default function AdminLandingPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<RoleOption | null>(null);

  function onSelect(value: string) {
    setSelected(OPTIONS.find((o) => o.role === value) ?? null);
  }

  function choose() {
    if (!selected) return;
    router.push(`/admin/login?role=${selected.role}`);
  }

  return (
    <div className="role-landing">
      <div className="role-stage">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/logo.png" alt="" className="role-stage-slide active" />
        <div className="role-stage-scrim" />
      </div>

      <div className="role-card">
        <div className="role-card-head">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <Link href={siteHomeUrl} aria-label="De Ultimate Glory Academy home">
            <img src="/images/logo.png" alt="De Ultimate Glory Academy logo" />
          </Link>
          <h1>School Administration</h1>
          <p>Restricted portal for administrators and the proprietor.</p>
        </div>

        <div className="role-drop-field">
          <select
            className="role-drop-select"
            onChange={(e) => onSelect(e.target.value)}
            value={selected ? selected.role : ""}
          >
            <option value="" disabled>
              Select your role…
            </option>
            <option value="ADMIN">Admin / Staff</option>
            <option value="OWNER">Proprietor</option>
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