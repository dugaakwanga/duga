// Builds a printable, single-page A4 report card PDF on the client, laid out
// to match the school's real paper sheet (header/motto/section, town/state,
// class/term/session, name/age/adm no, attendance, a subjects grid with one
// column per CA/EXAM component from ResultConfig, a behavioral-assessment
// grid, a grading key, comments, signatures and fees) — honoring the
// school's ReportCardConfig for which parts print. Mirrors idCards.ts's
// client-PDF pattern.

import type { jsPDF as JsPDFType } from "jspdf";

export interface ReportCardPdfSchool {
  name: string;
  shortName: string;
  address: string | null;
  logoUrl: string | null;
}

export interface ReportCardPdfConfig {
  showCognitive: boolean;
  showPsychomotor: boolean;
  showAttendance: boolean;
  showFees: boolean;
  showLogo: boolean;
  showWatermark: boolean;
  motto: string | null;
  town: string | null;
  state: string | null;
  sectionLabel: string | null;
  signatureLabels: string[];
}

export interface ReportCardPdfComponent {
  name: string;
  category: "CA" | "EXAM";
  max: number;
  order: number;
}

export interface ReportCardPdfGradeBand {
  min: number;
  max: number;
  grade: string;
  remark: string;
}

export interface ReportCardPdfItem {
  subject: { name: string };
  ca: number | null;
  exam: number | null;
  total: number | null;
  grade: string | null;
  remark: string | null;
  position: number | null;
  classAverage?: number | null;
  componentScores?: Record<string, number> | null;
}

export interface ReportCardPdfData {
  student: { firstName: string; lastName: string; admissionNumber?: string };
  className?: string | null;
  term: { name: string; startDate?: string | null; endDate?: string | null } | null;
  sessionName?: string | null;
  average: number | null;
  position: number | null;
  classSize: number | null;
  gpa: number | null;
  items: ReportCardPdfItem[] | null;
  // Behavioral assessment: fixed trait name -> single-letter grade (A-E).
  psychomotor: Record<string, string> | null;
  attendanceRemark: string | null;
  studentAge?: number | null;
  schoolDaysOpened?: number | null;
  daysPresent?: number | null;
  feesOwed?: number | null;
  nextTermFees?: number | null;
  feesPayableBy?: string | null;
  remark: string | null;
  formMasterName?: string | null;
  principalComment?: string | null;
  principalName?: string | null;
}

const INK = "#111827";
const MUTED = "#6b7280";
const PRIMARY = "#1e3a5f";
const BORDER = "#9ca3af";

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

function fmtDate(v: string | null | undefined): string {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

// Component names and subject names come from admin-entered config/data of
// arbitrary length, so table cells can't assume they'll fit — wrapping onto
// a second line just overflows the fixed row height instead. This shrinks
// the font (down to `minSize`) to keep text on one line, falling back to a
// truncated ellipsis only if it's still too wide at the floor size. Caller
// must set font family/weight first; leaves the doc's font size changed.
function fitSingleLine(doc: JsPDFType, text: string, maxWidth: number, baseSize: number, minSize = 5.5): string {
  let size = baseSize;
  doc.setFontSize(size);
  while (size > minSize && doc.getTextWidth(text) > maxWidth) {
    size -= 0.4;
    doc.setFontSize(size);
  }
  if (doc.getTextWidth(text) <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && doc.getTextWidth(`${t}…`) > maxWidth) t = t.slice(0, -1);
  return `${t}…`;
}

function fmtMoney(v: number | null | undefined): string {
  if (v === null || v === undefined) return "";
  return `₦${Math.round(v).toLocaleString()}`;
}

// Sample data for the report-card builder's live preview — lets an admin
// see exactly how a real card will look while adjusting toggles, before any
// real report card exists yet.
export const SAMPLE_REPORT_COMPONENTS: ReportCardPdfComponent[] = [
  { name: "Assignment 1", category: "CA", max: 10, order: 0 },
  { name: "Assignment 2", category: "CA", max: 10, order: 1 },
  { name: "Test 1", category: "CA", max: 20, order: 2 },
  { name: "Test 2", category: "CA", max: 20, order: 3 },
  { name: "Exam", category: "EXAM", max: 40, order: 4 },
];

export const SAMPLE_GRADE_BANDS: ReportCardPdfGradeBand[] = [
  { min: 80, max: 100, grade: "Excellent", remark: "Excellent" },
  { min: 70, max: 79, grade: "Very Good", remark: "Very Good" },
  { min: 60, max: 69, grade: "Good", remark: "Good" },
  { min: 50, max: 59, grade: "Fair", remark: "Fair" },
  { min: 40, max: 49, grade: "Poor", remark: "Poor" },
  { min: 0, max: 39, grade: "Very Poor", remark: "Very Poor" },
];

export const SAMPLE_REPORT_CARD: ReportCardPdfData = {
  student: { firstName: "Jane", lastName: "Doe", admissionNumber: "SAMPLE/001" },
  className: "JSS 2 A",
  term: { name: "First Term", startDate: "2026-09-01", endDate: "2026-12-12" },
  sessionName: "2026/2027",
  average: 78.4,
  position: 3,
  classSize: 28,
  gpa: 4.2,
  items: [
    { subject: { name: "Mathematics" }, ca: 32, exam: 51, total: 83, grade: "Excellent", remark: "Excellent", position: 1, classAverage: 68.2, componentScores: { "Assignment 1": 9, "Assignment 2": 8, "Test 1": 17, "Test 2": 18, Exam: 51 } },
    { subject: { name: "English Language" }, ca: 28, exam: 44, total: 72, grade: "Very Good", remark: "Very Good", position: 4, classAverage: 61.5, componentScores: { "Assignment 1": 8, "Assignment 2": 7, "Test 1": 15, "Test 2": 18, Exam: 44 } },
    { subject: { name: "Basic Science" }, ca: 25, exam: 40, total: 65, grade: "Good", remark: "Good", position: 6, classAverage: 58.9, componentScores: { "Assignment 1": 7, "Assignment 2": 6, "Test 1": 14, "Test 2": 18, Exam: 40 } },
  ],
  psychomotor: { Neatness: "A", Punctuality: "B", Honesty: "A", "Self Control": "B", Obedience: "A", Politeness: "A", "Relationship with Others": "B" },
  attendanceRemark: null,
  studentAge: 12,
  schoolDaysOpened: 60,
  daysPresent: 58,
  feesOwed: 0,
  nextTermFees: 85000,
  feesPayableBy: "2027-01-12",
  remark: "A hardworking and diligent student. Keep it up!",
  formMasterName: "Mrs. Grace Adebayo",
  principalComment: "A pleasure to have in school. Well done.",
  principalName: "Mr. Emmanuel Okafor",
};

async function buildReportCardDoc(
  school: ReportCardPdfSchool,
  config: ReportCardPdfConfig,
  card: ReportCardPdfData,
  components: ReportCardPdfComponent[],
  gradeBands: ReportCardPdfGradeBand[],
) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const W = 210;
  const M = 10;
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

  // Outer border, like the printed sheet's ruled page.
  doc.setDrawColor(INK);
  doc.setLineWidth(0.4);
  doc.rect(M, M, contentW, 277 - M);

  let y = M + 6;
  const headerLeft = M + 4;
  const logoDataUrl = config.showLogo ? await toDataUrl(school.logoUrl) : null;
  if (logoDataUrl) {
    try {
      // jsPDF embeds images uncompressed by default — a few-hundred-KB PNG
      // logo can balloon a single-page PDF to several MB without this.
      doc.addImage(logoDataUrl, imageFormat(logoDataUrl), headerLeft, y - 2, 20, 20, undefined, "FAST");
    } catch {
      /* skip a logo image jsPDF can't decode */
    }
  }
  doc.setTextColor(INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(19);
  doc.text(school.name.toUpperCase(), W / 2 + 8, y + 4, { align: "center" });
  y += 6;
  if (config.motto) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(10.5);
    doc.setTextColor(MUTED);
    doc.text(config.motto, W / 2 + 8, y, { align: "center" });
    y += 5;
  }
  if (config.sectionLabel) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(INK);
    doc.text(config.sectionLabel.toUpperCase(), W / 2 + 8, y + 2, { align: "center" });
    y += 7;
  }
  y = Math.max(y, M + 22);
  doc.setDrawColor(INK);
  doc.setLineWidth(0.3);
  doc.line(M + 3, y, W - M - 3, y);
  y += 6;

  // Info rows, matching the printed sheet's dotted-line fields.
  doc.setFontSize(9.5);
  function infoRow(pairs: Array<[string, string]>) {
    const slotW = contentW / pairs.length;
    doc.setFont("helvetica", "italic");
    doc.setTextColor(INK);
    pairs.forEach(([label, value], i) => {
      const x = M + 4 + slotW * i;
      const text = `${label}: ${value || "—"}`;
      doc.text(text, x, y);
    });
    y += 6;
  }
  const name = `${card.student.firstName} ${card.student.lastName}`;
  infoRow([
    ["Town", config.town ?? ""],
    ["State", config.state ?? ""],
  ]);
  infoRow([
    ["Class", card.className ?? ""],
    ["Term", card.term?.name ?? ""],
    ["Session", card.sessionName ?? ""],
  ]);
  infoRow([
    ["Name of Student", name],
    ["Age", card.studentAge !== null && card.studentAge !== undefined ? String(card.studentAge) : ""],
    ["Adm No", card.student.admissionNumber ?? ""],
  ]);
  if (config.showAttendance) {
    infoRow([
      ["No. of Times School Opened", card.schoolDaysOpened !== null && card.schoolDaysOpened !== undefined ? String(card.schoolDaysOpened) : ""],
      ["Total Att.", card.daysPresent !== null && card.daysPresent !== undefined ? String(card.daysPresent) : ""],
      [
        "% Att.",
        card.schoolDaysOpened ? `${Math.round(((card.daysPresent ?? 0) / card.schoolDaysOpened) * 100)}%` : "",
      ],
    ]);
  }
  infoRow([
    ["This Term Ends On", fmtDate(card.term?.endDate)],
    // Next term's start date doubles as "payable on or before" below, per
    // the school's standard fee policy.
    ["Next Term Begins On", fmtDate(card.feesPayableBy)],
  ]);
  y += 1;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12.5);
  doc.setTextColor(PRIMARY);
  doc.text("ACADEMIC REPORT", W / 2, y + 4, { align: "center" });
  y += 9;

  // Subjects grid: one column per configured CA/EXAM component, then Total,
  // Class Average, Grade, Remark, Signature.
  if (config.showCognitive && card.items?.length) {
    const caComponents = components.filter((c) => c.category === "CA").sort((a, b) => a.order - b.order);
    const examComponents = components.filter((c) => c.category === "EXAM").sort((a, b) => a.order - b.order);
    const compCols = [...caComponents, ...examComponents];
    const fixedColsW = 15 + 15 + 12 + 22 + 12; // Total, ClassAvg, Grade, Remark, Sign
    const subjectColW = 34;
    const compColW = Math.max(9, (contentW - subjectColW - fixedColsW) / Math.max(1, compCols.length));
    const cols: Array<{ label: string; sub?: string; w: number }> = [
      { label: "SUBJECTS", w: subjectColW },
      ...compCols.map((c) => ({ label: c.name, sub: `(${c.max})`, w: compColW })),
      { label: "TOTAL", w: 15 },
      { label: "CLASS AVG", w: 15 },
      { label: "GRADE", w: 12 },
      { label: "REMARK", w: 22 },
      { label: "SIGN", w: 12 },
    ];
    // Scale columns down proportionally if they overflow the page width.
    const totalW = cols.reduce((a, c) => a + c.w, 0);
    if (totalW > contentW - 8) {
      const scale = (contentW - 8) / totalW;
      for (const c of cols) c.w *= scale;
    }

    const headerH = 9;
    let x = M + 4;
    doc.setDrawColor(INK);
    doc.setLineWidth(0.25);
    doc.setFillColor("#eef2f7");
    doc.rect(M + 4, y, contentW - 8, headerH, "FD");
    doc.setFont("helvetica", "bold");
    doc.setTextColor(INK);
    for (const c of cols) {
      const label = fitSingleLine(doc, c.label, c.w - 1.5, 7.2);
      doc.text(label, x + c.w / 2, y + 4, { align: "center" });
      if (c.sub) {
        doc.setFontSize(6.4);
        doc.text(c.sub, x + c.w / 2, y + 7.5, { align: "center" });
      }
      doc.line(x, y, x, y + headerH);
      x += c.w;
    }
    doc.line(x, y, x, y + headerH);
    y += headerH;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    const rowH = 7;
    const compTotals: number[] = compCols.map(() => 0);
    let studentTotalSum = 0;
    for (const item of card.items) {
      if (y > 265) {
        doc.addPage();
        y = M + 6;
      }
      x = M + 4;
      doc.rect(M + 4, y, contentW - 8, rowH);
      let cx = x;
      doc.setFont("helvetica", "bold");
      const subjectLabel = fitSingleLine(doc, item.subject.name, cols[0]!.w - 3, 8, 6);
      doc.text(subjectLabel, cx + 1.5, y + 4.8);
      doc.setFontSize(8);
      doc.line(cx + cols[0]!.w, y, cx + cols[0]!.w, y + rowH);
      cx += cols[0]!.w;
      doc.setFont("helvetica", "normal");
      compCols.forEach((c, i) => {
        const v = item.componentScores?.[c.name];
        doc.text(v === undefined || v === null ? "—" : String(v), cx + cols[i + 1]!.w / 2, y + 4.8, { align: "center" });
        if (typeof v === "number") compTotals[i] = (compTotals[i] ?? 0) + v;
        doc.line(cx + cols[i + 1]!.w, y, cx + cols[i + 1]!.w, y + rowH);
        cx += cols[i + 1]!.w;
      });
      const totalIdx = compCols.length + 1;
      doc.setFont("helvetica", "bold");
      doc.text(String(item.total ?? "—"), cx + cols[totalIdx]!.w / 2, y + 4.8, { align: "center" });
      studentTotalSum += item.total ?? 0;
      doc.line(cx + cols[totalIdx]!.w, y, cx + cols[totalIdx]!.w, y + rowH);
      cx += cols[totalIdx]!.w;
      doc.setFont("helvetica", "normal");
      const classAvgIdx = totalIdx + 1;
      doc.text(item.classAverage !== null && item.classAverage !== undefined ? item.classAverage.toFixed(1) : "—", cx + cols[classAvgIdx]!.w / 2, y + 4.8, { align: "center" });
      doc.line(cx + cols[classAvgIdx]!.w, y, cx + cols[classAvgIdx]!.w, y + rowH);
      cx += cols[classAvgIdx]!.w;
      const gradeIdx = classAvgIdx + 1;
      const gradeLabel = fitSingleLine(doc, item.grade ?? "—", cols[gradeIdx]!.w - 1, 8, 5.5);
      doc.text(gradeLabel, cx + cols[gradeIdx]!.w / 2, y + 4.8, { align: "center" });
      doc.setFontSize(8);
      doc.line(cx + cols[gradeIdx]!.w, y, cx + cols[gradeIdx]!.w, y + rowH);
      cx += cols[gradeIdx]!.w;
      const remarkIdx = gradeIdx + 1;
      const remarkLabel = fitSingleLine(doc, item.remark ?? "—", cols[remarkIdx]!.w - 1, 7, 5.5);
      doc.text(remarkLabel, cx + cols[remarkIdx]!.w / 2, y + 4.8, { align: "center" });
      doc.setFontSize(8);
      doc.line(cx + cols[remarkIdx]!.w, y, cx + cols[remarkIdx]!.w, y + rowH);
      cx += cols[remarkIdx]!.w;
      y += rowH;
    }

    // Total / Average summary row.
    y += 3;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(INK);
    const avgVal = card.items.length ? Math.round((studentTotalSum / card.items.length) * 10) / 10 : 0;
    doc.rect(M + 4, y, 30, 9);
    doc.rect(M + 34, y, 30, 9);
    doc.setFontSize(7.5);
    doc.text("TOTAL", M + 4 + 15, y + 3.5, { align: "center" });
    doc.text("AVERAGE", M + 34 + 15, y + 3.5, { align: "center" });
    doc.setFontSize(9);
    doc.text(String(Math.round(studentTotalSum)), M + 4 + 15, y + 7.5, { align: "center" });
    doc.text(String(avgVal), M + 34 + 15, y + 7.5, { align: "center" });
    y += 14;
  }

  // Behavioral assessment grid (A-E per trait) and grading key, side by side.
  const gridTop = y;
  let leftBottom = gridTop;
  let rightBottom = gridTop;
  if (config.showPsychomotor && card.psychomotor && Object.keys(card.psychomotor).length) {
    const traits = Object.entries(card.psychomotor);
    const leftW = contentW * 0.56;
    const gradeLetters = ["A", "B", "C", "D", "E"];
    const traitColW = leftW * 0.5;
    const letterColW = (leftW - traitColW) / gradeLetters.length;
    let ly = gridTop;
    doc.setDrawColor(INK);
    doc.setLineWidth(0.25);
    doc.setFillColor("#eef2f7");
    doc.rect(M + 4, ly, leftW, 6, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(INK);
    doc.text("Behavioral Assessment", M + 4 + 2, ly + 4);
    gradeLetters.forEach((l, i) => {
      doc.text(l, M + 4 + traitColW + letterColW * i + letterColW / 2, ly + 4, { align: "center" });
    });
    ly += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    for (const [trait, grade] of traits) {
      doc.rect(M + 4, ly, leftW, 5.5);
      doc.text(trait, M + 4 + 1.5, ly + 3.8, { maxWidth: traitColW - 3 });
      gradeLetters.forEach((l, i) => {
        const cx = M + 4 + traitColW + letterColW * i + letterColW / 2;
        if (grade === l) doc.text("✓", cx, ly + 3.8, { align: "center" });
      });
      ly += 5.5;
    }
    leftBottom = ly;
  }

  {
    const leftW = contentW * 0.56;
    const rightX = M + 4 + leftW + 6;
    const rightW = contentW - leftW - 6;
    let ry = gridTop;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(PRIMARY);
    doc.text("Grading Key", rightX, ry + 4);
    ry += 7;
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7.8);
    doc.setTextColor(INK);
    for (const band of gradeBands) {
      doc.text(`${band.min} - ${band.max}  =  ${band.remark}`, rightX, ry, { maxWidth: rightW });
      ry += 4.6;
    }
    rightBottom = ry;
  }
  y = Math.max(leftBottom, rightBottom) + 5;

  function commentLine(label: string, value: string | null | undefined) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(INK);
    const text = `${label}: ${value ?? ""}`;
    const lines = doc.splitTextToSize(text, contentW - 8);
    doc.text(lines, M + 4, y);
    // Fill the rest of the line with a dotted rule if there's room left.
    y += Math.max(lines.length, 1) * 5;
  }

  function nameSignRow(nameLabel: string, nameValue: string | null | undefined, signLabel = "Sign/Date") {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(INK);
    doc.text(`${nameLabel}: ${nameValue ?? ""}`, M + 4, y);
    doc.text(`${signLabel}: `, W - M - 55, y);
    doc.setDrawColor(MUTED);
    doc.line(W - M - 40, y + 0.5, W - M - 4, y + 0.5);
    y += 6;
  }

  commentLine("Form Master's Comment", card.remark);
  nameSignRow("Form Master's Name", card.formMasterName);
  commentLine("Principal's Comment", card.principalComment);
  nameSignRow("Principal's Name", card.principalName);

  if (config.showFees) {
    doc.setDrawColor(BORDER);
    doc.setLineWidth(0.2);
    doc.line(M + 4, y, W - M - 4, y);
    y += 5;
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(INK);
    doc.text(`Fees Owed: ${fmtMoney(card.feesOwed) || "—"}`, M + 4, y);
    doc.text(`Next Term's Fees: ${fmtMoney(card.nextTermFees) || "—"}`, M + 4 + contentW / 3, y);
    doc.text(`Payable On Or Before: ${fmtDate(card.feesPayableBy) || "—"}`, M + 4 + (contentW / 3) * 2, y);
    y += 6;
  }

  return { doc, name };
}

export async function downloadReportCardPdf(
  school: ReportCardPdfSchool,
  config: ReportCardPdfConfig,
  card: ReportCardPdfData,
  components: ReportCardPdfComponent[] = SAMPLE_REPORT_COMPONENTS,
  gradeBands: ReportCardPdfGradeBand[] = SAMPLE_GRADE_BANDS,
): Promise<void> {
  const { doc, name } = await buildReportCardDoc(school, config, card, components, gradeBands);
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
  components: ReportCardPdfComponent[] = SAMPLE_REPORT_COMPONENTS,
  gradeBands: ReportCardPdfGradeBand[] = SAMPLE_GRADE_BANDS,
): Promise<string> {
  const { doc } = await buildReportCardDoc(school, config, card, components, gradeBands);
  return doc.output("bloburl") as unknown as string;
}
