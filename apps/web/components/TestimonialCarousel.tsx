"use client";

import { useEffect, useState } from "react";

const TESTIMONIALS = [
  {
    quote:
      "What I love about De Ultimate Glory Academy is the way the teachers know my children by name and push them to be their best — academically and as people. The results speak for themselves.",
    name: "Mrs. A. Okonkwo",
    role: "Parent of two pupils",
    initials: "AO",
  },
  {
    quote:
      "The boarding house gives me total peace of mind. Night study, caring housemasters and regular updates from the portal — my daughter is safe, happy and focused.",
    name: "Mr. E. Ibrahim",
    role: "Parent of a boarding student",
    initials: "EI",
  },
  {
    quote:
      "From phonics to common entrance, the primary section laid a solid foundation. My son moved to secondary fully prepared and confident.",
    name: "Mrs. F. Dangana",
    role: "Alumna parent",
    initials: "FD",
  },
];

export default function TestimonialCarousel() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setActive((a) => (a + 1) % TESTIMONIALS.length), 6000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="mkt-carousel">
      <div className="mkt-carousel-track">
        {TESTIMONIALS.map((t, i) => (
          <div key={t.name} className={`mkt-carousel-slide${i === active ? " is-active" : ""}`}>
            <div className="mkt-quote">
              <span className="mkt-quote-mark">“</span>
              <p>{t.quote}</p>
              <footer>
                <span className="mkt-avatar">{t.initials}</span>
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
        {TESTIMONIALS.map((t, i) => (
          <button
            key={t.name}
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
