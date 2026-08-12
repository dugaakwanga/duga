"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { school as fallbackSchool, portalUrl } from "@/lib/content";
import { useSiteContent } from "@/lib/use-site";
import { Menu, Close, Phone, Mail, ArrowRight } from "@/components/icons";

const NAV = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About" },
  { href: "/academics", label: "Academics" },
  { href: "/admissions", label: "Admissions" },
  { href: "/graduates", label: "Graduates" },
  { href: "/testimonials", label: "Testimonials" },
  { href: "/pta", label: "PTA" },
  { href: "/gallery", label: "Gallery" },
  { href: "/news", label: "News" },
  { href: "/contact", label: "Contact" },
];

const FALLBACK_TICKER = [
  "Admissions open for the 2025/2026 session",
  "BECE 2025 — 98% credit pass",
  "New integrated science laboratory commissioned",
  "Boarding & day enrolment available",
  "Inter-house sports festival — Green House champions",
  "National examination preparation at accredited centres",
];

export default function SiteHeader() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [progress, setProgress] = useState(0);
  const { content, school, website } = useSiteContent();

  const schoolInfo = {
    name: school?.name ?? fallbackSchool.name,
    motto: content.contact.motto || fallbackSchool.motto,
    phone: school?.phone ?? fallbackSchool.phone,
    email: school?.email ?? fallbackSchool.email,
  };

  const enabledPages = new Set(website.pages.length ? website.pages : NAV.map((n) => n.href.slice(1)));
  const navLinks = NAV.filter((n) => n.href === "/" || enabledPages.has(n.href.slice(1)));
  const tickerOn = website.features.length ? website.features.includes("ticker") : true;

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled(y > 12);
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(max > 0 ? (y / max) * 100 : 0);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const tickerItems = content?.ticker && content.ticker.length > 0 ? content.ticker : FALLBACK_TICKER;
  const tickerLine = tickerItems.join("   ✦   ");

  return (
    <>
      {tickerOn && content.tickerEnabled !== false && (
        <div className="mkt-announce">
          <div className="mkt-announce-track">
            <span>{tickerLine}</span>
            <span aria-hidden="true">{tickerLine}</span>
          </div>
        </div>
      )}

      <header className={`mkt-header${scrolled ? " is-scrolled" : ""}`}>
        <div className="mkt-scroll-progress" style={{ width: `${progress}%` }} />
        <div className="mkt-container">
          <div className="mkt-header-top">
            <button className="mkt-burger" onClick={() => setOpen((v) => !v)} aria-label="Toggle menu" aria-expanded={open}>
              {open ? <Close size={20} /> : <Menu size={20} />}
            </button>

            <Link href="/" className="mkt-logo mkt-logo--brand" aria-label={schoolInfo.name}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/logo.png" alt="" />
              <span>
                <span className="mkt-logo-name">
                  De <em>Ultimate</em> Glory <span className="mkt-logo-academy">Academy</span>
                </span>
                <span className="mkt-logo-sub">{schoolInfo.motto}</span>
              </span>
            </Link>

            <div className="mkt-header-actions">
              <a className="mkt-icon-link" href={`mailto:${schoolInfo.email}`} aria-label={`Email ${schoolInfo.email}`}>
                <Mail size={16} />
              </a>
              <a
                className="mkt-icon-link"
                href={`tel:${schoolInfo.phone.replace(/\s/g, "")}`}
                aria-label={`Call ${schoolInfo.phone}`}
              >
                <Phone size={16} />
              </a>
              <Link className="duga-btn duga-btn--outline duga-btn--sm" href={portalUrl}>
                Portal
              </Link>
              <Link className="duga-btn duga-btn--primary duga-btn--arrow" href="/apply">
                Apply Now <ArrowRight size={15} className="mkt-arrow" />
              </Link>
            </div>
          </div>

          <nav className="mkt-nav" aria-label="Primary">
            {navLinks.map((n) => (
              <Link key={n.href} href={n.href}>
                {n.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className={`mkt-mobile-menu${open ? " open" : ""}`}>
          {navLinks.map((n) => (
            <Link key={n.href} href={n.href} onClick={() => setOpen(false)}>
              {n.label}
            </Link>
          ))}
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10, marginTop: 10 }}>
            <Link className="duga-btn duga-btn--primary duga-btn--block" href="/apply" onClick={() => setOpen(false)}>
              Apply Now
            </Link>
            <Link className="duga-btn duga-btn--outline duga-btn--block" href={portalUrl} onClick={() => setOpen(false)}>
              Portal Login
            </Link>
          </div>
        </div>
      </header>
    </>
  );
}
