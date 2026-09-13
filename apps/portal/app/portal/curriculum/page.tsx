"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader, Card, Select, Alert, Spinner, EmptyState, Badge } from "@duga/ui";
import { api } from "@/lib/client/api";
import { useSection } from "@/components/SectionContext";

interface Chunk {
  id: string;
  levelName: string | null;
  subjectName: string;
  term: string | null;
  text: string;
  pageStart: number | null;
  pageEnd: number | null;
}

interface BrowseResult {
  chunks: Chunk[];
  levels: string[];
  subjects: string[];
}

export default function CurriculumPage() {
  const [data, setData] = useState<BrowseResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [levelName, setLevelName] = useState("");
  const [subjectName, setSubjectName] = useState("");
  const { section } = useSection();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await api<BrowseResult>("scheme/browse", { query: { levelName: levelName || undefined, subjectName: subjectName || undefined } });
      setData(d);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levelName, subjectName, section]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <PageHeader title="Curriculum" subtitle="The school's official scheme of work — the same content the AI lesson-note generator reads from." />
      {error && <Alert tone="danger">{error}</Alert>}

      {!loading && data && data.levels.length === 0 ? (
        <EmptyState title="No scheme of work uploaded yet" hint="An admin can upload one in Settings → Scheme of Work." />
      ) : (
        <>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
            <Select value={levelName} onChange={(e) => setLevelName(e.target.value)} style={{ maxWidth: 220 }}>
              <option value="">All levels</option>
              {data?.levels.map((l) => <option key={l} value={l}>{l}</option>)}
            </Select>
            <Select value={subjectName} onChange={(e) => setSubjectName(e.target.value)} style={{ maxWidth: 260 }}>
              <option value="">All subjects</option>
              {data?.subjects.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </div>

          {loading ? (
            <Spinner size={28} />
          ) : !data || data.chunks.length === 0 ? (
            <EmptyState title="Nothing matches this filter" hint="Try a different level or subject." />
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {data.chunks.map((c) => (
                <Card key={c.id}>
                  <details>
                    <summary style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontWeight: 700, fontSize: 14 }}>
                      {c.subjectName}
                      {c.levelName && <Badge tone="info">{c.levelName}</Badge>}
                      {c.term && <Badge tone="neutral">{c.term} TERM</Badge>}
                    </summary>
                    <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 13, lineHeight: 1.6, marginTop: 12, color: "var(--duga-ink-2)" }}>
                      {c.text}
                    </pre>
                  </details>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
