"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { PageHeader, Card, Button, Badge, Alert, Spinner, Icon } from "@duga/ui";

interface Question {
  id: string;
  type: string;
  question: string;
  options: string[];
  score: number;
  order: number;
}

interface TestDetail {
  id: string;
  title: string;
  instruction: string | null;
  durationMinutes: number;
  passMark: number | null;
  questions: Question[];
}

interface LoadResponse {
  applicantName: string;
  alreadySubmitted: boolean;
  test?: TestDetail;
  result?: { score: number; maxScore: number; percentage: number };
}

// Public, unauthenticated page — reached via a signed link, not the portal
// session. Deliberately uses plain fetch() against /api/public/* rather than
// the shared `api` client, which always targets the session-gated /api/v1
// dispatcher.
export default function ApplicationTestPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [applicantName, setApplicantName] = useState("");
  const [test, setTest] = useState<TestDetail | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ score: number; maxScore: number; percentage: number } | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const endRef = useRef<number | null>(null);
  const autoSubmitFired = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/public/admissions-test/${token}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Could not load the entrance test");
      const data = json.data as LoadResponse;
      setApplicantName(data.applicantName);
      if (data.alreadySubmitted && data.result) {
        setResult(data.result);
      } else if (data.test) {
        setTest(data.test);
        const dur = (data.test.durationMinutes || 30) * 60;
        endRef.current = Date.now() + dur * 1000;
        setSecondsLeft(dur);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = useCallback(async () => {
    if (submitting || result || !test) return;
    setSubmitting(true);
    setError(null);
    const body = { answers: Object.entries(answers).map(([questionId, selectedIndex]) => ({ questionId, selectedIndex })) };
    try {
      const res = await fetch(`/api/public/admissions-test/${token}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Could not submit the entrance test");
      setResult(json.data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers, submitting, result, test, token]);

  useEffect(() => {
    if (!endRef.current || result) return;
    const iv = setInterval(() => {
      const left = Math.max(0, Math.round((endRef.current! - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left === 0 && !autoSubmitFired.current) {
        autoSubmitFired.current = true;
        submit();
      }
    }, 1000);
    return () => clearInterval(iv);
  }, [test?.id, result, submit]);

  const mm = Math.floor(secondsLeft / 60);
  const ss = secondsLeft % 60;
  const answered = Object.keys(answers).length;

  if (loading) {
    return (
      <div style={{ maxWidth: 720, margin: "60px auto", padding: "0 16px" }}>
        <Spinner size={28} />
      </div>
    );
  }

  if (error && !test && !result) {
    return (
      <div style={{ maxWidth: 720, margin: "60px auto", padding: "0 16px" }}>
        <Alert tone="danger">{error}</Alert>
      </div>
    );
  }

  if (result) {
    const passed = test?.passMark != null ? result.percentage >= test.passMark : undefined;
    return (
      <div style={{ maxWidth: 720, margin: "60px auto", padding: "0 16px" }}>
        <Card>
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <h2 style={{ marginBottom: 4 }}>Entrance test submitted</h2>
            {applicantName && <p style={{ color: "var(--duga-muted)", marginBottom: 20 }}>Thank you, {applicantName}.</p>}
            <div style={{ fontSize: 40, fontWeight: 800 }}>{result.percentage}%</div>
            <div style={{ margin: "8px 0 18px", color: "var(--duga-muted)" }}>
              Score {result.score} / {result.maxScore}
            </div>
            {passed !== undefined && <Badge tone={passed ? "success" : "danger"}>{passed ? "You passed" : "Not a pass mark yet"}</Badge>}
            <p style={{ marginTop: 20, color: "var(--duga-muted)", fontSize: 13.5 }}>
              The school will be in touch about the next steps in your application.
            </p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 720, margin: "40px auto 60px", padding: "0 16px" }}>
      <PageHeader
        title={test?.title ?? "Entrance test"}
        subtitle={test?.instruction ?? "Answer all questions, then submit when you are done."}
        actions={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Badge tone={secondsLeft < 60 ? "danger" : "accent"}>{mm}:{String(ss).padStart(2, "0")} left</Badge>
            <Button onClick={submit} loading={submitting}>Submit</Button>
          </div>
        }
      />
      {applicantName && <p style={{ color: "var(--duga-muted)", marginTop: -8, marginBottom: 16 }}>Applicant: {applicantName}</p>}
      {error && <Alert tone="danger">{error}</Alert>}
      <div style={{ display: "grid", gap: 16 }}>
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, color: "var(--duga-muted)" }}>
            <span>Answered {answered} of {test?.questions.length ?? 0} questions</span>
            <span>{test?.durationMinutes ?? 0} minutes</span>
          </div>
        </Card>
        {test?.questions.map((q, qi) => (
          <Card key={q.id} title={`Question ${qi + 1}`} actions={<Badge tone="neutral">{q.score} pt{q.score !== 1 ? "s" : ""}</Badge>}>
            <p style={{ fontSize: 15, margin: "0 0 12px", lineHeight: 1.5 }}>{q.question}</p>
            <div style={{ display: "grid", gap: 8 }}>
              {q.options.map((opt, oi) => {
                const selected = answers[q.id] === oi;
                return (
                  <button
                    key={oi}
                    onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: oi }))}
                    className="duga-btn"
                    style={{
                      textAlign: "left",
                      justifyContent: "flex-start",
                      ...(selected ? { borderColor: "var(--duga-accent)", background: "color-mix(in srgb, var(--duga-accent) 12%, transparent)" } : {}),
                    }}
                  >
                    <Icon name={selected ? "check" : "more"} size={16} />
                    <span>{opt}</span>
                  </button>
                );
              })}
            </div>
          </Card>
        ))}
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 20 }}>
          <Button variant="accent" size="md" onClick={submit} loading={submitting}>
            Submit {answered < (test?.questions.length ?? 0) ? `(${answered}/${test?.questions.length ?? 0} answered)` : "test"}
          </Button>
        </div>
      </div>
    </div>
  );
}
