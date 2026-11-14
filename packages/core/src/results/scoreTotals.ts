export function computeScoreTotals(
  config: { caCap: number; examCap: number; components: ReadonlyArray<{ name: string; category: "CA" | "EXAM"; max: number }> },
  scores: Record<string, number | null | undefined>,
): { ca: number; exam: number; total: number } {
  const earned = { CA: 0, EXAM: 0 };
  const possible = { CA: 0, EXAM: 0 };
  for (const component of config.components) {
    const score = scores[component.name];
    possible[component.category] += component.max;
    if (typeof score === "number" && Number.isFinite(score)) {
      earned[component.category] += Math.max(0, Math.min(score, component.max));
    }
  }
  const round = (score: number) => Math.round(score * 100) / 100;
  const ca = possible.CA ? round(earned.CA / possible.CA * config.caCap) : 0;
  const exam = possible.EXAM ? round(earned.EXAM / possible.EXAM * config.examCap) : 0;
  return { ca, exam, total: round(ca + exam) };
}
