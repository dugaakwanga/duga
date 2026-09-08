// Builds a printable, single-page A4 report card PDF on the client, honoring
// the school's ReportCardConfig (which sections render, logo, watermark,
// signature lines) — mirrors the idCards.ts client-PDF pattern.

export interface ReportCardPdfSchool {
  name: string;
  shortName: string;
  address: string | null;
  logoUrl: string | null;
}

export interface ReportCardPdfConfig {
  showCognitive: boolean;
  showPsychomotor: boolean;
  showAffective: boolean;
  showAttendance: boolean;
  showLogo: boolean;
  showWatermark: boolean;
  signatureLabels: string[];
}

export interface ReportCardPdfItem {
  subject: { name: string };
  ca: number | null;
  exam: number | null;
  total: number | null;
  grade: string | null;
  remark: string | null;
  position: number | null;
}

export interface ReportCardPdfData {
  student: { firstName: string; lastName: string; admissionNumber?: string };
  className?: string | null;
  term: { name: string } | null;
  average: number | null;
  position: number | null;
  classSize: number | null;
  gpa: number | null;
  items: ReportCardPdfItem[] | null;
  psychomotor: Record<string, string> | null;
  coCurricular: Record<string, string> | null;
  attendanceRemark: string | null;
  remark: string | null;
}

const INK = "#111827";
const MUTED = "#6b7280";
const PRIMARY = "#1e3a5f";
const BORDER = "#d1d5db";

async function toDataUrl(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function imageFormat(dataUrl: string): "PNG" | "JPEG" | "WEBP" {
  if (dataUrl.startsWith("data:image/png")) return "PNG";
  if (dataUrl.startsWith("data:image/webp")) return "WEBP";
  return "JPEG";
}

// Sample data for the report-card builder's live preview — lets an admin
// see exactly how a real card will look while adjusting toggles, before any
// real report card exists yet.
export const SAMPLE_REPORT_CARD: ReportCardPdfData = {
  student: { firstName: "Jane", lastName: "Doe", admissionNumber: "SAMPLE/001" },
  className: "JSS 2 A",
  term: { name: "First Term" },
  average: 78.4,
  position: 3,
  classSize: 28,
  gpa: 4.2,
  items: [
    { subject: { name: "Mathematics" }, ca: 32, exam: 51, total: 83, grade: "A1", remark: "Excellent", position: 1 },
    { subject: { name: "English Language" }, ca: 28, exam: 44, total: 72, grade: "B2", remark: "Very Good", position: 4 },
    { subject: { name: "Basic Science" }, ca: 25, exam: 40, total: 65, grade: "B3", remark: "Good", position: 6 },
  ],
  psychomotor: { Punctuality: "Excellent", Neatness: "Very Good", "Handling of tools": "Good" },
  coCurricular: { Sports: "Very Good", "Relationship with peers": "Excellent", Leadership: "Good" },
  attendanceRemark: "Present 58 out of 60 school days this term.",
  remark: "A hardworking and diligent student. Keep it up!",
};

async function buildReportCardDoc(
  school: ReportCardPdfSchool,
  config: ReportCardPdfConfig,
  card: ReportCardPdfData,
) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const W = 210;
  const M = 14;
  const contentW = W - M * 2;

  if (config.showWatermark) {
    doc.saveGraphicsState();
    doc.setGState(new (doc as unknown as { GState: new (o: object) => unknown }).GState({ opacity: 0.06 }) as never);
    doc.setTextColor(PRIMARY);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(70);
    doc.text((school.shortName || school.name).toUpperCase(), W / 2, 180, { align: "center", angle: 45 });
    doc.restoreGraphicsState();
  }

  let y = M;
  const logoDataUrl = config.showLogo ? await toDataUrl(school.logoUrl) : null;
  if (logoDataUrl) {
    try {
      // jsPDF embeds images uncompressed by default — a few-hundred-KB PNG
      // logo can balloon a single-page PDF to several MB without this.
      doc.addImage(logoDataUrl, imageFormat(logoDataUrl), W / 2 - 9, y, 18, 18, undefined, "FAST");
      y += 20;
    } catch {
      /* skip a logo image jsPDF can't decode */
    }
  }
  doc.setTextColor(PRIMARY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(school.name, W / 2, y + 5, { align: "center" });
  y += 7;
  if (school.address) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(MUTED);
    doc.text(school.address, W / 2, y, { align: "center" });
    y += 5;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(INK);
  doc.text("TERM REPORT CARD", W / 2, y + 4, { align: "center" });
  y += 10;
  doc.setDrawColor(PRIMARY);
  doc.setLineWidth(0.6);
  doc.line(M, y, W - M, y);
  y += 8;

  // Student / term summary block
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(INK);
  const name = `${card.student.firstName} ${card.student.lastName}`;
  const leftLines: Array<[string, string]> = [
    ["Student", name],
    ["Class", card.className ?? "—"],
    ["Term", card.term?.name ?? "—"],
  ];
  const rightLines: Array<[string, string]> = [
    ["Average", card.average !== null ? `${card.average}%` : "—"],
    ["Position", card.position !== null && card.classSize ? `${card.position} of ${card.classSize}` : "—"],
    ["GPA", card.gpa !== null && card.gpa !== undefined ? String(card.gpa) : "—"],
  ];
  let ly = y;
  for (const [label, value] of leftLines) {
    doc.setFont("helvetica", "bold");
    doc.text(`${label}:`, M, ly);
    doc.setFont("helvetica", "normal");
    doc.text(value, M + 22, ly);
    ly += 6;
  }
  let ry = y;
  for (const [label, value] of rightLines) {
    doc.setFont("helvetica", "bold");
    doc.text(`${label}:`, W / 2 + 5, ry);
    doc.setFont("helvetica", "normal");
    doc.text(value, W / 2 + 27, ry);
    ry += 6;
  }
  y = Math.max(ly, ry) + 4;

  function sectionTitle(title: string) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(PRIMARY);
    doc.text(title, M, y);
    y += 5;
  }

  function ratingsTable(entries: Array<[string, string]>) {
    if (!entries.length) return;
    const rowH = 6;
    doc.setFontSize(9);
    for (const [label, value] of entries) {
      doc.setFillColor("#f9fafb");
      doc.rect(M, y - 4.2, contentW, rowH, "F");
      doc.setFont("helvetica", "normal");
      doc.setTextColor(INK);
      doc.text(label, M + 2, y);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(PRIMARY);
      doc.text(String(value), W - M - 2, y, { align: "right" });
      y += rowH;
    }
    y += 3;
  }

  if (config.showCognitive && card.items?.length) {
    sectionTitle("Cognitive — Subject Scores");
    const headers = ["Subject", "CA", "Exam", "Total", "Grade", "Remark", "Pos."];
    const colW = [58, 16, 16, 16, 16, 40, contentW - (58 + 16 + 16 + 16 + 16 + 40)];
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "bold");
    doc.setFillColor(PRIMARY);
    doc.setTextColor("#ffffff");
    let x = M;
    doc.rect(M, y - 4.5, contentW, 6, "F");
    for (let i = 0; i < headers.length; i++) {
      const align = i === 0 || i === 5 ? "left" : "center";
      const hx = align === "left" ? x + 2 : x + colW[i]! / 2;
      doc.text(headers[i]!, hx, y, { align });
      x += colW[i]!;
    }
    y += 5;
    doc.setTextColor(INK);
    doc.setFont("helvetica", "normal");
    for (const item of card.items) {
      if (y > 265) {
        doc.addPage();
        y = M;
      }
      x = M;
      doc.setDrawColor(BORDER);
      doc.line(M, y + 1.5, W - M, y + 1.5);
      const cells = [item.subject.name, item.ca ?? "—", item.exam ?? "—", item.total ?? "—", item.grade ?? "—", item.remark ?? "—", item.position ?? "—"];
      for (let i = 0; i < cells.length; i++) {
        const align = i === 0 || i === 5 ? "left" : "center";
        const cx = align === "left" ? x + 2 : x + colW[i]! / 2;
        doc.text(String(cells[i]), cx, y, { align });
        x += colW[i]!;
      }
      y += 6;
    }
    y += 4;
  }

  if (config.showPsychomotor && card.psychomotor && Object.keys(card.psychomotor).length) {
    sectionTitle("Psychomotor Domain");
    ratingsTable(Object.entries(card.psychomotor));
  }

  if (config.showAffective && card.coCurricular && Object.keys(card.coCurricular).length) {
    sectionTitle("Affective Domain / Co-curricular");
    ratingsTable(Object.entries(card.coCurricular));
  }

  if (config.showAttendance && card.attendanceRemark) {
    sectionTitle("Attendance & Conduct");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(INK);
    const lines = doc.splitTextToSize(card.attendanceRemark, contentW);
    doc.text(lines, M, y);
    y += lines.length * 5 + 4;
  }

  if (card.remark) {
    sectionTitle("Teacher's Remark");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(INK);
    const lines = doc.splitTextToSize(card.remark, contentW);
    doc.text(lines, M, y);
    y += lines.length * 5 + 4;
  }

  // Signature lines
  const labels = config.signatureLabels.length ? config.signatureLabels : ["Class Teacher", "Principal"];
  const sigY = Math.max(y + 14, 260);
  const slotW = contentW / labels.length;
  doc.setDrawColor(INK);
  doc.setLineWidth(0.3);
  labels.forEach((label, i) => {
    const cx = M + slotW * i + slotW / 2;
    doc.line(cx - 30, sigY, cx + 30, sigY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(MUTED);
    doc.text(label, cx, sigY + 5, { align: "center" });
  });

  return { doc, name };
}

export async function downloadReportCardPdf(
  school: ReportCardPdfSchool,
  config: ReportCardPdfConfig,
  card: ReportCardPdfData,
): Promise<void> {
  const { doc, name } = await buildReportCardDoc(school, config, card);
  doc.save(`report-card-${(card.student.admissionNumber ?? name).replace(/\s+/g, "-")}-${(card.term?.name ?? "term").replace(/\s+/g, "-")}.pdf`);
}

// Renders the PDF and returns an object URL for it — used by the report-card
// builder to show an inline <iframe> preview rather than a new tab/window,
// which sidesteps popup blockers entirely (a new tab opened after an async
// logo fetch loses the "user gesture" and gets silently blocked by many
// browsers regardless of how it's opened). Callers should revoke the
// previous URL (URL.revokeObjectURL) before requesting a new one.
export async function renderReportCardPreviewUrl(
  school: ReportCardPdfSchool,
  config: ReportCardPdfConfig,
  card: ReportCardPdfData = SAMPLE_REPORT_CARD,
): Promise<string> {
  const { doc } = await buildReportCardDoc(school, config, card);
  return doc.output("bloburl") as unknown as string;
}
