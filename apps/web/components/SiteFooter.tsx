"use client";

import Link from "next/link";
import { school as fallbackSchool, portalUrl } from "@/lib/content";
import { useSiteContent } from "@/lib/use-site";
import { Pin, Phone, Mail, Clock, ArrowRight } from "@/components/icons";

export default function SiteFooter() {
  const { content, school } = useSiteContent();

  const info = {
    name: school?.name ?? fallbackSchool.name,
    motto: content.contact.motto || fallbackSchool.motto,
    address: school?.address ?? fallbackSchool.address,
    phone: school?.phone ?? fallbackSchool.phone,
    email: school?.email ?? fallbackSchool.email,
    hours: content.contact.hours || "Mon – Fri · 7:30am – 4:00pm",
    about:
      content.footer.about ||
      "A co-educational Primary and Secondary school in Akwanga, Nasarawa State — building tomorrow's leaders with academic excellence and strong moral values.",
    tagline: content.footer.tagline || fallbackSchool.motto,
  };

  return (
    <footer className="mkt-footer">
      <div className="mkt-container">
        <div className="mkt-footer-grid">
          <div>
            <Link href="/" aria-label="De Ultimate Glory Academy home" className="mkt-logo">
              <span className="mkt-logo-badge">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/images/logo.png" alt="" />
              </span>
              <span>
                <span className="mkt-logo-name">De Ultimate Glory Academy</span>
                <span className="mkt-logo-sub">{info.motto}</span>
              </span>
            </Link>
            <p style={{ fontSize: 14, marginTop: 18, maxWidth: 320, lineHeight: 1.7 }}>
              {info.about}
            </p>
          </div>

          <div>
            <h4>Explore</h4>
            <Link href="/about">About Us</Link>
            <Link href="/academics">Academics</Link>
            <Link href="/admissions">Admissions</Link>
            <Link href="/gallery">Gallery</Link>
            <Link href="/news">News &amp; Events</Link>
          </div>

          <div>
            <h4>Quick Links</h4>
            <Link href="/apply">Apply Online</Link>
            <Link href={portalUrl}>Parent Portal</Link>
            <Link href={portalUrl}>Student Portal</Link>
            <Link href={portalUrl}>Staff Portal</Link>
            <Link href="/contact">Contact Us</Link>
          </div>

          <div>
            <h4>Contact</h4>
            <p style={{ fontSize: 13.5, display: "flex", gap: 9, alignItems: "flex-start" }}>
              <Pin size={15} style={{ marginTop: 2, flexShrink: 0 }} /> {info.address}
            </p>
            <p style={{ fontSize: 13.5, display: "flex", gap: 9, alignItems: "center", marginTop: 8 }}>
              <Phone size={15} /> {info.phone}
            </p>
            <p style={{ fontSize: 13.5, display: "flex", gap: 9, alignItems: "center", marginTop: 8 }}>
              <Mail size={15} /> {info.email}
            </p>
            <p style={{ fontSize: 13.5, display: "flex", gap: 9, alignItems: "center", marginTop: 8 }}>
              <Clock size={15} /> {info.hours}
            </p>
            <Link href="/apply" className="duga-btn mkt-btn--light duga-btn--sm duga-btn--arrow" style={{ marginTop: 18, display: "inline-flex" }}>
              Start Application <ArrowRight size={15} className="mkt-arrow" />
            </Link>
          </div>
        </div>

        <div className="mkt-footer-bottom">
          <span>
            © {new Date().getFullYear()} {info.name}. All rights reserved.
          </span>
          <span>{info.tagline}</span>
        </div>
      </div>
    </footer>
  );
}
