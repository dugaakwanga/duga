"use client";

import { useState } from "react";
import { ArrowRight, Check } from "@/components/icons";

const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL ?? "http://localhost:3001";

export default function NewsletterSignup() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!email.trim()) return;
    setSending(true);
    setError("");
    try {
      const res = await fetch(`${portalUrl}/api/public/newsletter`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Subscribe failed");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not subscribe right now.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mkt-newsletter">
      <span className="mkt-kicker mkt-kicker--light">Don&rsquo;t Miss Out</span>
      <h2 className="mkt-h2" style={{ color: "#fff" }}>
        Stay <em style={{ color: "#f0e2ae" }}>in the loop</em>
      </h2>
      <p>
        Sign up with your email address to receive school news, event invites and important
        announcements before anyone else.
      </p>
      {done ? (
        <p className="mkt-newsletter-done">
          <Check size={16} /> Thank you — you&rsquo;re subscribed!
        </p>
      ) : (
        <form className="mkt-newsletter-form" onSubmit={onSubmit}>
          <input
            type="email"
            required
            placeholder="Enter your email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button type="submit" className="duga-btn mkt-btn--light duga-btn--lg" disabled={sending}>
            {sending ? "Subscribing…" : "Subscribe"} <ArrowRight size={16} className="mkt-arrow" />
          </button>
        </form>
      )}
      {error && <p className="mkt-newsletter-error">{error}</p>}
    </div>
  );
}
