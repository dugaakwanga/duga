type ScoreComponent = { name: string; category: "CA" | "EXAM"; max: number };

export function scoreMaximums(components: readonly ScoreComponent[]) {
  const caCap = components.filter((c) => c.category === "CA").reduce((sum, c) => sum + c.max, 0);
  const examCap = components.filter((c) => c.category === "EXAM").reduce((sum, c) => sum + c.max, 0);
  return { caCap, examCap };
}

export function computeScoreTotals(
  config: { components: readonly ScoreComponent[] },
  scores: Record<string, number | null | undefined>,
): { ca: number; exam: number; total: number } {
  const earned = { CA: 0, EXAM: 0 };
  for (const component of config.components) {
    const score = scores[component.name];
    if (typeof score === "number" && Number.isFinite(score)) {
      earned[component.category] += Math.max(0, Math.min(score, component.max));
    }
  }
  const round = (score: number) => Math.round(score * 100) / 100;
  const ca = round(earned.CA);
  const exam = round(earned.EXAM);
  return { ca, exam, total: round(ca + exam) };
}
