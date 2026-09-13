// Builds one combined, printable scheme-of-work PDF for a subject — every
// class/term section laid out as a real row/column table, generated fully
// on the client (no server round trip beyond whatever already produced the
// table data). Mirrors reportCardPdf.ts's manual jsPDF table-drawing
// pattern (no autotable plugin in this project).

const INK = "#111827";
const MUTED = "#6b7280";
const PRIMARY = "#1e3a5f";
const BORDER = "#9ca3af";
const HEADER_FILL = "#eef2f7";

export interface SchemePdfTable {
  columns: string[];
  rows: string[][];
}

export interface SchemePdfSection {
  levelName: string | null;
  term: string | null;
  table: SchemePdfTable | null;
  text: string;
}

export async function downloadSchemePdf(subjectName: string, sectionLabel: string, sections: SchemePdfSection[]): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const W = 210;
  const H = 297;
  const M = 14;
  const contentW = W - M * 2;
  const bottomLimit = H - M;

  let y = M;

  doc.setTextColor(INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(subjectName, M, y + 4);
  y += 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(MUTED);
  doc.text(`${sectionLabel} — Scheme of Work`, M, y);
  y += 5;
  doc.setDrawColor(BORDER);
  doc.setLineWidth(0.3);
  doc.line(M, y, M + contentW, y);
  y += 8;

  function ensureRoom(need: number) {
    if (y + need > bottomLimit) {
      doc.addPage();
      y = M;
    }
  }

  function drawHeading(text: string) {
    ensureRoom(12);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(PRIMARY);
    doc.text(text, M, y + 4);
    y += 9;
  }

  function drawParagraph(text: string) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(INK);
    const lines = doc.splitTextToSize(text, contentW) as string[];
    for (const line of lines) {
      ensureRoom(5);
      doc.text(line, M, y + 3.5);
      y += 5;
    }
    y += 4;
  }

  function colWidths(n: number): number[] {
    if (n <= 1) return [contentW];
    const weekW = Math.min(16, contentW * 0.1);
    const remaining = contentW - weekW;
    const others = n - 1;
    if (others === 2) return [weekW, remaining * 0.32, remaining * 0.68];
    return [weekW, ...Array(others).fill(remaining / others)];
  }

  function drawTableHeader(columns: string[], widths: number[]) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    const pad = 1.6;
    const lineArrays = columns.map((c, i) => doc.splitTextToSize(c, widths[i]! - pad * 2) as string[]);
    const rowH = Math.max(...lineArrays.map((l) => l.length)) * 4.2 + pad * 2;
    ensureRoom(rowH + 6);
    let cx = M;
    doc.setFillColor(HEADER_FILL);
    doc.setDrawColor(BORDER);
    for (let i = 0; i < columns.length; i++) {
      doc.rect(cx, y, widths[i]!, rowH, "FD");
      doc.setTextColor(INK);
      lineArrays[i]!.forEach((line, li) => doc.text(line, cx + pad, y + pad + 3 + li * 4.2));
      cx += widths[i]!;
    }
    y += rowH;
  }

  function drawTable(table: SchemePdfTable) {
    const widths = colWidths(table.columns.length);
    drawTableHeader(table.columns, widths);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.8);
    const pad = 1.6;
    for (const row of table.rows) {
      const lineArrays = table.columns.map((_, i) => doc.splitTextToSize(row[i] ?? "", widths[i]! - pad * 2) as string[]);
      const rowH = Math.max(...lineArrays.map((l) => l.length), 1) * 4 + pad * 2;
      if (y + rowH > bottomLimit) {
        doc.addPage();
        y = M;
        drawTableHeader(table.columns, widths);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.8);
      }
      let cx = M;
      doc.setDrawColor(BORDER);
      for (let i = 0; i < table.columns.length; i++) {
        doc.rect(cx, y, widths[i]!, rowH);
        doc.setTextColor(INK);
        lineArrays[i]!.forEach((line, li) => doc.text(line, cx + pad, y + pad + 3 + li * 4));
        cx += widths[i]!;
      }
      y += rowH;
    }
    y += 6;
  }

  for (const section of sections) {
    const heading = `${section.levelName ?? "General"} — ${section.term ? `${section.term} Term` : "Term not specified"}`;
    drawHeading(heading);
    if (section.table && section.table.rows.length > 0) {
      drawTable(section.table);
    } else {
      drawParagraph(section.text);
    }
  }

  const pages = doc.getNumberOfPages();
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(MUTED);
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.text(`Page ${p} of ${pages}`, W - M, H - 6, { align: "right" });
  }

  doc.save(`${subjectName.replace(/\s+/g, "-")}-scheme-of-work.pdf`);
}
