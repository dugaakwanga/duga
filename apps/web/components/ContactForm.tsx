"use client";

import { useState } from "react";
import { Field, Input, Textarea, Button } from "@duga/ui";

export default function ContactForm() {
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    setStatus("sending");
    setError("");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.get("name"),
          email: data.get("email"),
          phone: data.get("phone"),
          subject: data.get("subject"),
          message: data.get("message"),
        }),
      });
      if (!res.ok) throw new Error("Request failed");
      setStatus("sent");
      form.reset();
    } catch {
      setStatus("error");
      setError("Sorry, we could not send your message. Please try again or call us directly.");
    }
  }

  if (status === "sent") {
    return (
      <div className="duga-alert duga-alert--success">
        Thank you! Your message has been received. We will respond within 24 hours.
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit}>
      <Field label="Full name" required>
        <Input name="name" required placeholder="e.g. Mrs. Adaeze Okonkwo" />
      </Field>
      <Field label="Email address" required>
        <Input name="email" type="email" required placeholder="you@example.com" />
      </Field>
      <Field label="Phone number">
        <Input name="phone" placeholder="+234 800 000 0000" />
      </Field>
      <Field label="Subject" required>
        <Input name="subject" required placeholder="Enquiry about admissions" />
      </Field>
      <Field label="Message" required>
        <Textarea name="message" required placeholder="How can we help you?" />
      </Field>
      {status === "error" && <div className="duga-alert duga-alert--danger">{error}</div>}
      <Button type="submit" loading={status === "sending"} block>
        {status === "sending" ? "Sending..." : "Send Message"}
      </Button>
    </form>
  );
}
