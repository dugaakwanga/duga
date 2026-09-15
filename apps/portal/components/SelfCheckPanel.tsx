"use client";

import { useEffect, useState } from "react";
import { Button, Card, Textarea, Spinner, Alert } from "@duga/ui";
import { api } from "@/lib/client/api";

interface SelfCheckQuestion {
  question: string;
  modelAnswer: string;
}

interface AnswerState {
  text: string;
  checking: boolean;
  result: { correct: boolean; feedback: string } | null;
  // Distinct from `result` — the AI call itself failed (empty reply, rate
  // limit, network), which says nothing about whether the answer was right.
  // Must never be shown as if it were a "wrong answer" verdict.
  error: string | null;
}

// A "check yourself" study aid shown after a lesson note's content — the
// questions and model answers are generated fresh from the note's own text
// each time (never persisted, never shared between students), and a typed
// answer is judged by AI as correct/incorrect + a short encouraging line.
// Nothing here is graded or saved anywhere; a student can retry freely.
export default function SelfCheckPanel({ noteId }: { noteId: string }) {
  const [questions, setQuestions] = useState<SelfCheckQuestion[] | null>(null);
  const [answers, setAnswers] = useState<Record<number, AnswerState>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setQuestions(null);
    setAnswers({});
    api<{ questions: SelfCheckQuestion[] }>(`learning/${noteId}/selfCheck`, { method: "POST", body: {}, loading: false })
      .then((d) => {
        if (cancelled) return;
        setQuestions(d.questions);
        setAnswers(Object.fromEntries(d.questions.map((_, i) => [i, { text: "", checking: false, result: null, error: null }])));
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [noteId]);

  async function submitAnswer(i: number, question: SelfCheckQuestion) {
    const state = answers[i];
    if (!state || !state.text.trim()) return;
    setAnswers((prev) => ({ ...prev, [i]: { ...prev[i]!, checking: true, error: null } }));
    try {
      const res = await api<{ correct: boolean; feedback: string }>("learning/checkAnswer", {
        method: "POST",
        body: { question: question.question, modelAnswer: question.modelAnswer, answer: state.text },
        loading: false,
      });
      setAnswers((prev) => ({ ...prev, [i]: { ...prev[i]!, checking: false, result: res, error: null } }));
    } catch (e) {
      // The AI call itself failed — not a verdict on the answer, so keep
      // what they typed and let them just retry the same submit rather than
      // showing it as a (false) "incorrect" result.
      setAnswers((prev) => ({ ...prev, [i]: { ...prev[i]!, checking: false, error: (e as Error).message } }));
    }
  }

  function retry(i: number) {
    setAnswers((prev) => ({ ...prev, [i]: { text: "", checking: false, result: null, error: null } }));
  }

  if (loading) {
    return (
      <div style={{ marginTop: 22, display: "flex", alignItems: "center", gap: 8, color: "var(--duga-muted)", fontSize: 13 }}>
        <Spinner size={16} /> Preparing a few questions to check your understanding…
      </div>
    );
  }
  if (error) return null; // AI unavailable, rate-limited, etc. — fail quiet, the lesson content itself already loaded fine.
  if (!questions || questions.length === 0) return null;

  return (
    <div style={{ marginTop: 26, borderTop: "1px solid var(--duga-border)", paddingTop: 18 }}>
      <div style={{ fontWeight: 700, fontSize: 14.5, marginBottom: 4 }}>Check yourself</div>
      <div style={{ fontSize: 12.5, color: "var(--duga-muted)", marginBottom: 14 }}>
        Answer in your own words — you can select and copy from the note above if that helps.
      </div>
      <div style={{ display: "grid", gap: 12 }}>
        {questions.map((q, i) => {
          const state = answers[i];
          if (!state) return null;
          return (
            <Card key={i}>
              <div style={{ fontWeight: 600, fontSize: 13.5, marginBottom: 8 }}>{q.question}</div>
              {state.result ? (
                <Alert tone={state.result.correct ? "success" : "warning"}>
                  <div style={{ display: "grid", gap: 6 }}>
                    <div>
                      {state.result.correct ? "🎉 " : ""}
                      {state.result.feedback}
                    </div>
                    <div style={{ fontSize: 12.5, color: "var(--duga-muted)" }}>Model answer: {q.modelAnswer}</div>
                    <div>
                      <Button variant="ghost" size="sm" onClick={() => retry(i)}>
                        Try another answer
                      </Button>
                    </div>
                  </div>
                </Alert>
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  <Textarea
                    value={state.text}
                    onChange={(e) => setAnswers((prev) => ({ ...prev, [i]: { ...prev[i]!, text: e.target.value } }))}
                    placeholder="Type your answer here…"
                    rows={2}
                  />
                  {state.error && <Alert tone="info">Couldn't check that just now — {state.error}</Alert>}
                  <div>
                    <Button size="sm" onClick={() => submitAnswer(i, q)} loading={state.checking} disabled={!state.text.trim()}>
                      {state.error ? "Try again" : "Submit answer"}
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
