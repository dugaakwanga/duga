import Link from "next/link";
import { school, portalUrl } from "@/lib/content";
import { Pin, Phone, Mail, Clock, ArrowRight } from "@/components/icons";

export default function SiteFooter() {
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
                <span className="mkt-logo-sub">{school.motto}</span>
              </span>
            </Link>
            <p style={{ fontSize: 14, marginTop: 18, maxWidth: 320, lineHeight: 1.7 }}>
              A co-educational Primary and Secondary school in Akwanga, Nasarawa State — building
              tomorrow&apos;s leaders with academic excellence and strong moral values.
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
              <Pin size={15} style={{ marginTop: 2, flexShrink: 0 }} /> {school.address}
            </p>
            <p style={{ fontSize: 13.5, display: "flex", gap: 9, alignItems: "center", marginTop: 8 }}>
              <Phone size={15} /> {school.phone}
            </p>
            <p style={{ fontSize: 13.5, display: "flex", gap: 9, alignItems: "center", marginTop: 8 }}>
              <Mail size={15} /> {school.email}
            </p>
            <p style={{ fontSize: 13.5, display: "flex", gap: 9, alignItems: "center", marginTop: 8 }}>
              <Clock size={15} /> Mon – Fri · 7:30am – 4:00pm
            </p>
            <Link href="/apply" className="duga-btn mkt-btn--light duga-btn--sm duga-btn--arrow" style={{ marginTop: 18, display: "inline-flex" }}>
              Start Application <ArrowRight size={15} className="mkt-arrow" />
            </Link>
          </div>
        </div>

        <div className="mkt-footer-bottom">
          <span>
            © {new Date().getFullYear()} {school.name}. All rights reserved.
          </span>
          <span>Imparting the winning wisdom in Nasarawa State.</span>
        </div>
      </div>
    </footer>
  );
}
