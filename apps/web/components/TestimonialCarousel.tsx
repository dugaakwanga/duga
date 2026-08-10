"use client";

import { useEffect, useState } from "react";

export interface TestimonialItem {
  quote: string;
  name: string;
  role: string;
}

const FALLBACK_TESTIMONIALS: TestimonialItem[] = [
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
];

function initials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function TestimonialCarousel({ items }: { items?: TestimonialItem[] }) {
  const testimonials = items && items.length > 0 ? items : FALLBACK_TESTIMONIALS;
  const [active, setActive] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setActive((a) => (a + 1) % testimonials.length), 6000);
    return () => clearInterval(id);
  }, [testimonials.length]);

  return (
    <div className="mkt-carousel">
      <div className="mkt-carousel-track">
        {testimonials.map((t, i) => (
          <div key={t.name || i} className={`mkt-carousel-slide${i === active ? " is-active" : ""}`}>
            <div className="mkt-quote">
              <span className="mkt-quote-mark">“</span>
              <p>{t.quote}</p>
              <footer>
                <span className="mkt-avatar">{initials(t.name)}</span>
                <div>
                  <strong>{t.name}</strong>
                  <span>{t.role}</span>
                </div>
              </footer>
            </div>
          </div>
        ))}
      </div>
      <div className="mkt-carousel-dots">
        {testimonials.map((t, i) => (
          <button
            key={t.name || i}
            type="button"
            aria-label={`Show testimonial ${i + 1}`}
            className={`mkt-carousel-dot${i === active ? " is-active" : ""}`}
            onClick={() => setActive(i)}
          />
        ))}
      </div>
    </div>
  );
}
