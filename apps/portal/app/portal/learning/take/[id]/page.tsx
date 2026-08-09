"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PageHeader, Card, Button, Badge, Alert, Spinner, Icon } from "@duga/ui";
import { api } from "@/lib/client/api";

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
  description: string | null;
  instruction: string | null;
  durationMinutes: number;
  passMark: number | null;
  status: string;
  questions: Question[];
  classSubject?: { subject: { name: string }; classGroup?: { level: { name: string }; name: string } | null } | null;
}

export default function TakeTestPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const testId = params.id;

  const [test, setTest] = useState<TestDetail | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ score: number; maxScore: number; percentage: number } | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const endRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const t = await api<TestDetail>(`learning/${testId}?kind=tests`);
      if (t.status !== "PUBLISHED") {
        setError("This test is not open.");
        setLoading(false);
        return;
      }
      setTest(t);
      const dur = (t.durationMinutes || 30) * 60;
      const deadline = Date.now() + dur * 1000;
      endRef.current = deadline;
      setSecondsLeft(dur);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [testId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!endRef.current) return;
    const iv = setInterval(() => {
      const left = Math.max(0, Math.round((endRef.current! - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left === 0) submit();
    }, 1000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [test?.id]);

  async function submit() {
    if (submitting || result) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await api<{ attemptId: string; score: number; maxScore: number; percentage: number }>(`learning/${testId}/submitTest`, {
        method: "POST",
        body: { answers: Object.entries(answers).map(([questionId, selectedIndex]) => ({ questionId, selectedIndex })) },
      });
      setResult(res);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  const mm = Math.floor(secondsLeft / 60);
  const ss = secondsLeft % 60;
  const answered = Object.keys(answers).length;

  if (result) {
    const passed = test?.passMark != null ? result.percentage >= test.passMark : undefined;
    return (
      <div>
        <PageHeader title="Test submitted" />
        <Card>
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: 40, fontWeight: 800 }}>{result.percentage}%</div>
            <div style={{ margin: "8px 0 18px", color: "var(--duga-muted)" }}>
              Score {result.score} / {result.maxScore}
            </div>
            {passed !== undefined && <Badge tone={passed ? "success" : "danger"}>{passed ? "You passed" : "Not a pass mark yet"}</Badge>}
            <div style={{ marginTop: 20 }}>
              <Button onClick={() => router.push("/portal/student")}>Back to my home</Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={test?.title ?? "Test"}
        subtitle={test?.instruction ?? "Answer all questions, then submit when you are done."}
        actions={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Badge tone={secondsLeft < 60 ? "danger" : "accent"}>{mm}:{String(ss).padStart(2, "0")} left</Badge>
            <Button onClick={submit} loading={submitting} disabled={loading}>Submit test</Button>
          </div>
        }
      />
      {error && <Alert tone="danger">{error}</Alert>}
      {loading ? (
        <Spinner size={28} />
      ) : (
        <div style={{ display: "grid", gap: 16 }}>
          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, color: "var(--duga-muted)" }}>
              <span>Answered {answered} of {test?.questions.length ?? 0} questions</span>
              <span>{test?.durationMinutes ?? 0} minutes · {test?.classSubject?.subject?.name ?? ""}</span>
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
      )}
    </div>
  );
}
