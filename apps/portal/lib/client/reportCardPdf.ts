// Builds a printable, single-page A4 report card PDF on the client, styled to
// match the school's printed termly result sheet: navy/serif header with a
// circular crest and passport photo, dotted-underline id fields, a grouped
// (Continuous Assessment / Exams) subjects table, a performance chart, color-
// coded domain grids (Psychomotor & Affective in green, Behavioural in
// orange) and a colored grading key — honoring the school's ReportCardConfig
// for which parts print. Mirrors idCards.ts's client-PDF pattern.

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
  student: { firstName: string; lastName: string; admissionNumber?: string; photoUrl?: string | null };
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
  // Psychomotor & Affective Domain: same shape, separate grid.
  coCurricular?: Record<string, string> | null;
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

const INK = "#000000";
const MUTED = "#555555";
const NAVY = "#1f3a5f";
const HEADER_BG = "#eaf0f6";
const DOMAIN_GREEN_BG = "#e6f2ea";
const DOMAIN_GREEN_TEXT = "#2c6e49";
const DOMAIN_ORANGE_BG = "#fdf1de";
const DOMAIN_ORANGE_TEXT = "#a1651a";
const GRADE_GREEN = "#e5f3e8";
const GRADE_YELLOW = "#fbf3d9";
const GRADE_RED = "#f9e2e0";

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

// Manual dash simulation — jsPDF v4's own dashed-line API varies enough
// across versions that relying on it risks a silent no-op or a thrown
// error in a document real report cards depend on; drawing short segments
// by hand works the same everywhere.
function dashedHLine(doc: JsPDFType, x1: number, x2: number, y: number) {
  const dash = 1.4;
  const gap = 1;
  for (let cx = x1; cx < x2; cx += dash + gap) {
    doc.line(cx, y, Math.min(cx + dash, x2), y);
  }
}

// A bold-labeled field whose value sits on a dotted underline, matching the
// printed sheet's ".field { border-bottom: 1px dotted #000 }" styling.
function dottedField(doc: JsPDFType, x: number, y: number, w: number, label: string, value: string) {
  doc.setFont("times", "bold");
  doc.setFontSize(9);
  doc.setTextColor(INK);
  doc.text(`${label}:`, x, y);
  const labelW = doc.getTextWidth(`${label}: `);
  doc.setFont("times", "normal");
  doc.text(value || "", x + labelW, y);
  doc.setDrawColor(INK);
  doc.setLineWidth(0.15);
  dashedHLine(doc, x, x + w - 2, y + 1.3);
}

// Centered section title, underlined in navy — "ACADEMIC REPORT", the domain
// grid headings, etc. Returns the y position just below the underline.
function sectionTitle(doc: JsPDFType, text: string, centerX: number, y: number, size = 12.5): number {
  doc.setFont("times", "bold");
  doc.setFontSize(size);
  doc.setTextColor(NAVY);
  doc.text(text, centerX, y, { align: "center" });
  const w = doc.getTextWidth(text);
  doc.setDrawColor(NAVY);
  doc.setLineWidth(0.25);
  doc.line(centerX - w / 2, y + 1, centerX + w / 2, y + 1);
  return y + 1;
}

// One bar per subject showing its Total score (0-100), color-banded the
// same as the grading key (green/yellow/red), with a dashed pass-mark line
// at 50 — the "strengths & weaknesses at a glance" chart from the printed
// sheet. Subject labels stay horizontal and are shrunk/truncated to fit
// their own bar's width (fitSingleLine), rather than risking jsPDF's text
// rotation producing illegible output in a document nobody proofreads
// before it's handed to a parent.
function drawPerformanceChart(doc: JsPDFType, items: ReportCardPdfItem[], x: number, y: number, width: number, height: number) {
  const padL = 9;
  const padB = 14;
  const padT = 4;
  const padR = 2;
  const chartW = width - padL - padR;
  const chartH = height - padT - padB;
  const n = Math.max(items.length, 1);
  const barGap = 1.5;
  const barW = Math.max(2, chartW / n - barGap);

  doc.setDrawColor(INK);
  doc.setLineWidth(0.2);
  doc.line(x + padL, y + padT, x + padL, y + padT + chartH);
  doc.line(x + padL, y + padT + chartH, x + width - padR, y + padT + chartH);

  doc.setFont("times", "normal");
  doc.setFontSize(5.5);
  doc.setTextColor(MUTED);
  for (let v = 0; v <= 100; v += 20) {
    const gy = y + padT + chartH - (v / 100) * chartH;
    doc.setDrawColor("#dddddd");
    doc.setLineWidth(0.1);
    doc.line(x + padL, gy, x + width - padR, gy);
    doc.text(String(v), x + padL - 1.5, gy + 1, { align: "right" });
  }
  const passY = y + padT + chartH - 0.5 * chartH;
  doc.setDrawColor(INK);
  doc.setLineWidth(0.3);
  dashedHLine(doc, x + padL, x + width - padR, passY);

  items.forEach((item, i) => {
    const val = Math.max(0, Math.min(100, item.total ?? 0));
    const barH = (val / 100) * chartH;
    const bx = x + padL + i * (barW + barGap) + barGap / 2;
    const by = y + padT + chartH - barH;
    const fill = val >= 70 ? "#cfe9d6" : val >= 50 ? "#fbedb8" : val > 0 ? "#f6cfcb" : "#ffffff";
    doc.setFillColor(fill);
    doc.setDrawColor(INK);
    doc.setLineWidth(0.15);
    doc.rect(bx, by, barW, Math.max(barH, 0.3), val > 0 ? "FD" : "D");
    if (val > 0) {
      doc.setFont("times", "normal");
      doc.setFontSize(5.2);
      doc.setTextColor(INK);
      doc.text(String(Math.round(val)), bx + barW / 2, by - 1, { align: "center" });
    }
    const label = fitSingleLine(doc, item.subject.name, barW + barGap - 0.5, 5.4, 3.6);
    doc.setTextColor(INK);
    doc.text(label, bx + barW / 2, y + padT + chartH + 4, { align: "center" });
  });
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
  coCurricular: { Handwriting: "A", "Sports/Games": "B", "Verbal Fluency": "A", Leadership: "B", "Musical Skill": "C" },
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

// Strips a trailing ordinal number ("Assignment 1" -> "Assignment") so
// same-family components (Assignment 1/2, Test 1/2, ...) group together
// under one spanning header cell, the way the printed sheet does — while
// still working for a school with only one CA or EXAM component (no group
// to strip, it just becomes its own group of one).
function componentBaseName(name: string): string {
  return name.replace(/\s*\d+\s*$/, "").trim() || name;
}

function componentOrdinal(name: string): string {
  const m = name.match(/(\d+)\s*$/);
  if (!m) return name;
  const n = parseInt(m[1]!, 10);
  const suffix = n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th";
  return `${n}${suffix}`;
}

function groupComponents(comps: ReportCardPdfComponent[]): Array<{ label: string; comps: ReportCardPdfComponent[] }> {
  const groups: Array<{ label: string; comps: ReportCardPdfComponent[] }> = [];
  for (const c of comps) {
    const label = componentBaseName(c.name).toUpperCase();
    const existing = groups.find((g) => g.label === label);
    if (existing) existing.comps.push(c);
    else groups.push({ label, comps: [c] });
  }
  return groups;
}

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
    doc.setTextColor(NAVY);
    doc.setFont("times", "bold");
    doc.setFontSize(70);
    doc.text((school.shortName || school.name).toUpperCase(), W / 2, 180, { align: "center", angle: 45 });
    doc.restoreGraphicsState();
  }

  // Outer border, like the printed sheet's ruled page.
  doc.setDrawColor(INK);
  doc.setLineWidth(0.6);
  doc.rect(M, M, contentW, 277 - M);

  let y = M + 6;
  const headerLeft = M + 4;
  const logoSize = 20;
  const logoDataUrl = config.showLogo ? await toDataUrl(school.logoUrl) : null;
  if (logoDataUrl) {
    const cx = headerLeft + logoSize / 2;
    const cy = y - 2 + logoSize / 2;
    // A round crest, matching the printed sheet — but drawn as a navy ring
    // around a plain (inset) square image rather than a true pixel clip:
    // jsPDF's context2d rasterizes the whole clipped region at a much higher
    // internal resolution than addImage, which ballooned a single-page PDF
    // from ~85KB to ~6.8MB for a 500KB source logo. addImage stays cheap
    // regardless of the source image's resolution.
    const inset = logoSize * 0.8;
    try {
      // jsPDF embeds images uncompressed by default — a few-hundred-KB PNG
      // logo can balloon a single-page PDF to several MB without this.
      doc.addImage(logoDataUrl, imageFormat(logoDataUrl), cx - inset / 2, cy - inset / 2, inset, inset, undefined, "FAST");
      doc.setDrawColor(NAVY);
      doc.setLineWidth(0.3);
      doc.circle(cx, cy, logoSize / 2, "S");
    } catch {
      /* skip a logo image jsPDF can't decode */
    }
  }
  // Student passport photo, mirrored on the right of the header — the
  // printed sheet has one alongside the school logo.
  const photoDataUrl = await toDataUrl(card.student.photoUrl ?? null);
  if (photoDataUrl) {
    try {
      doc.addImage(photoDataUrl, imageFormat(photoDataUrl), W - M - 24, y - 2, 20, 24, undefined, "FAST");
      doc.setDrawColor(NAVY);
      doc.setLineWidth(0.3);
      doc.rect(W - M - 24, y - 2, 20, 24);
    } catch {
      /* skip a photo jsPDF can't decode */
    }
  } else {
    doc.setDrawColor(NAVY);
    doc.setLineWidth(0.2);
    doc.rect(W - M - 24, y - 2, 20, 24);
    doc.setFont("times", "normal");
    doc.setFontSize(6);
    doc.setTextColor(MUTED);
    doc.text("PASSPORT", W - M - 14, y + 9, { align: "center" });
  }
  doc.setTextColor(NAVY);
  doc.setFont("times", "bold");
  doc.setFontSize(19);
  doc.text(school.name.toUpperCase(), W / 2, y + 4, { align: "center", charSpace: 0.3 });
  y += 6;
  if (config.motto) {
    doc.setFont("times", "italic");
    doc.setFontSize(10.5);
    doc.setTextColor(MUTED);
    doc.text(config.motto, W / 2, y, { align: "center" });
    y += 5;
  }
  if (config.sectionLabel) {
    doc.setFont("times", "bold");
    doc.setFontSize(13);
    doc.setTextColor(INK);
    doc.text(config.sectionLabel.toUpperCase(), W / 2, y + 2, { align: "center", charSpace: 0.5 });
    y += 7;
  }
  y = Math.max(y, M + 22);
  doc.setDrawColor(NAVY);
  doc.setLineWidth(0.6);
  doc.line(M + 3, y, W - M - 3, y);
  y += 6;

  // Info rows, matching the printed sheet's bold-label/dotted-underline
  // fields.
  function infoRow(pairs: Array<[string, string]>) {
    const slotW = contentW / pairs.length;
    pairs.forEach(([label, value], i) => {
      const x = M + 4 + slotW * i;
      dottedField(doc, x, y, slotW - 4, label, value || "—");
    });
    y += 6.5;
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
  infoRow([
    ["No. in Class", card.classSize !== null && card.classSize !== undefined ? String(card.classSize) : ""],
    ["Position in Class", card.position !== null && card.position !== undefined ? String(card.position) : ""],
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
  y += 2;

  y = sectionTitle(doc, "ACADEMIC REPORT", W / 2, y + 4) + 5;

  // Subjects grid: one column per configured CA/EXAM component (grouped
  // under CONTINUOUS ASSESSMENT / EXAMS bands, the way the printed sheet
  // groups Assignment 1/2 and Test 1/2 under one heading), then Total,
  // Class Average, Grade, Remark, Signature.
  if (config.showCognitive && card.items?.length) {
    const caComponents = components.filter((c) => c.category === "CA").sort((a, b) => a.order - b.order);
    const examComponents = components.filter((c) => c.category === "EXAM").sort((a, b) => a.order - b.order);
    const compCols = [...caComponents, ...examComponents];
    const fixedColsW = 15 + 15 + 12 + 22 + 12; // Total, ClassAvg, Grade, Remark, Sign
    const subjectColW = 34;
    const compColW = Math.max(9, (contentW - subjectColW - fixedColsW) / Math.max(1, compCols.length));
    const fixedCols: Array<{ label: string; w: number }> = [
      { label: "TOTAL\nSCORE", w: 15 },
      { label: "CLASS\nAVERAGE", w: 15 },
      { label: "GRADE", w: 12 },
      { label: "REMARK", w: 22 },
      { label: "SIGNATURE", w: 12 },
    ];
    // Scale columns down proportionally if they overflow the page width.
    const rawTotalW = subjectColW + compColW * compCols.length + fixedCols.reduce((a, c) => a + c.w, 0);
    const scale = rawTotalW > contentW - 8 ? (contentW - 8) / rawTotalW : 1;
    const scaledSubjectColW = subjectColW * scale;
    const scaledCompColW = compColW * scale;
    for (const c of fixedCols) c.w *= scale;

    const headerH = 10.5;
    const row1H = 3.5;
    const row2H = 2.8;
    const tableLeft = M + 4;
    const tableRight = W - M - 4;

    doc.setDrawColor(INK);
    doc.setLineWidth(0.25);
    doc.setFillColor(HEADER_BG);
    doc.rect(tableLeft, y, tableRight - tableLeft, headerH, "FD");
    doc.setTextColor(NAVY);

    // SUBJECTS — full header height.
    doc.setFont("times", "bold");
    doc.setFontSize(7.5);
    doc.text("SUBJECTS", tableLeft + scaledSubjectColW / 2, y + headerH / 2 + 1.5, { align: "center" });
    let x = tableLeft + scaledSubjectColW;
    doc.line(x, y, x, y + headerH);

    // One category band (CONTINUOUS ASSESSMENT / EXAMS) per CA/EXAM group of
    // components, each subdivided into named sub-groups (Assignment, Test, ...)
    // and finally individual component columns (1st/10, 2nd/10, ...).
    function drawCategoryBand(comps: ReportCardPdfComponent[], bandLabel: string) {
      if (!comps.length) return;
      const bandW = scaledCompColW * comps.length;
      if (comps.length === 1) {
        // Nothing to subdivide — one cell spanning the full header height,
        // same treatment as the fixed columns (label + max, centered).
        const comp = comps[0]!;
        doc.setFont("times", "bold");
        const label = fitSingleLine(doc, bandLabel, bandW - 1.5, 7.2);
        doc.text(label, x + bandW / 2, y + headerH / 2 - 0.5, { align: "center" });
        doc.setFont("times", "normal");
        doc.setFontSize(6.4);
        doc.text(`(${comp.max})`, x + bandW / 2, y + headerH / 2 + 3.5, { align: "center" });
        x += bandW;
        doc.line(x, y, x, y + headerH);
        return;
      }
      doc.setFont("times", "bold");
      doc.setFontSize(7.2);
      doc.text(bandLabel, x + bandW / 2, y + row1H / 2 + 1.3, { align: "center" });
      doc.setLineWidth(0.2);
      doc.line(x, y + row1H, x + bandW, y + row1H);

      const groups = groupComponents(comps);
      let gx = x;
      groups.forEach((g, gi) => {
        const gw = scaledCompColW * g.comps.length;
        if (g.comps.length === 1) {
          const comp = g.comps[0]!;
          doc.setFont("times", "bold");
          const label = fitSingleLine(doc, g.label, gw - 1, 6.6);
          doc.text(label, gx + gw / 2, y + row1H + (headerH - row1H) / 2 - 0.3, { align: "center" });
          doc.setFont("times", "normal");
          doc.setFontSize(6);
          doc.text(`(${comp.max})`, gx + gw / 2, y + row1H + (headerH - row1H) / 2 + 3, { align: "center" });
        } else {
          doc.setFont("times", "bold");
          doc.setFontSize(6.6);
          doc.text(g.label, gx + gw / 2, y + row1H + row2H / 2 + 1, { align: "center" });
          doc.setLineWidth(0.15);
          doc.line(gx, y + row1H + row2H, gx + gw, y + row1H + row2H);
          let cx = gx;
          g.comps.forEach((comp) => {
            doc.setFont("times", "normal");
            doc.setFontSize(6.2);
            doc.text(componentOrdinal(comp.name), cx + scaledCompColW / 2, y + row1H + row2H + 2.1, { align: "center" });
            doc.setFontSize(5.8);
            doc.text(`(${comp.max})`, cx + scaledCompColW / 2, y + headerH - 0.8, { align: "center" });
            cx += scaledCompColW;
            if (cx < gx + gw - 0.01) {
              doc.setDrawColor(INK);
              doc.setLineWidth(0.1);
              doc.line(cx, y + row1H + row2H, cx, y + headerH);
            }
          });
        }
        gx += gw;
        if (gi < groups.length - 1) {
          doc.setDrawColor(INK);
          doc.setLineWidth(0.15);
          doc.line(gx, y + row1H, gx, y + headerH);
        }
      });
      x += bandW;
      doc.setDrawColor(INK);
      doc.setLineWidth(0.25);
      doc.line(x, y, x, y + headerH);
    }

    drawCategoryBand(caComponents, "CONTINUOUS ASSESSMENT");
    drawCategoryBand(examComponents, "EXAMS");

    // Fixed trailing columns — Total, Class Average, Grade, Remark, Signature.
    doc.setTextColor(NAVY);
    for (const c of fixedCols) {
      const lines = c.label.split("\n");
      doc.setFont("times", "bold");
      const label0 = fitSingleLine(doc, lines[0]!, c.w - 1.5, 7.2);
      doc.text(label0, x + c.w / 2, y + headerH / 2 - (lines.length > 1 ? 1.5 : -1.5), { align: "center" });
      if (lines[1]) {
        doc.setFontSize(6.4);
        const label1 = fitSingleLine(doc, lines[1], c.w - 1.5, 6.4);
        doc.text(label1, x + c.w / 2, y + headerH / 2 + 3, { align: "center" });
      }
      x += c.w;
      doc.line(x, y, x, y + headerH);
    }
    y += headerH;

    doc.setFont("times", "normal");
    doc.setFontSize(8);
    doc.setTextColor(INK);
    const rowH = 7;
    const bodyCols = [
      { w: scaledSubjectColW },
      ...compCols.map(() => ({ w: scaledCompColW })),
      ...fixedCols,
    ];
    for (const item of card.items) {
      if (y > 265) {
        doc.addPage();
        y = M + 6;
      }
      doc.setDrawColor(INK);
      doc.rect(tableLeft, y, tableRight - tableLeft, rowH);
      let cx = tableLeft;
      doc.setFont("times", "bold");
      const subjectLabel = fitSingleLine(doc, item.subject.name, bodyCols[0]!.w - 3, 8, 6);
      doc.text(subjectLabel, cx + 1.5, y + 4.8);
      doc.setFontSize(8);
      doc.line(cx + bodyCols[0]!.w, y, cx + bodyCols[0]!.w, y + rowH);
      cx += bodyCols[0]!.w;
      doc.setFont("times", "normal");
      compCols.forEach((c, i) => {
        const v = item.componentScores?.[c.name];
        doc.text(v === undefined || v === null ? "—" : String(v), cx + bodyCols[i + 1]!.w / 2, y + 4.8, { align: "center" });
        doc.line(cx + bodyCols[i + 1]!.w, y, cx + bodyCols[i + 1]!.w, y + rowH);
        cx += bodyCols[i + 1]!.w;
      });
      const totalIdx = compCols.length + 1;
      doc.setFont("times", "bold");
      doc.text(String(item.total ?? "—"), cx + bodyCols[totalIdx]!.w / 2, y + 4.8, { align: "center" });
      doc.line(cx + bodyCols[totalIdx]!.w, y, cx + bodyCols[totalIdx]!.w, y + rowH);
      cx += bodyCols[totalIdx]!.w;
      doc.setFont("times", "normal");
      const classAvgIdx = totalIdx + 1;
      doc.text(item.classAverage !== null && item.classAverage !== undefined ? item.classAverage.toFixed(1) : "—", cx + bodyCols[classAvgIdx]!.w / 2, y + 4.8, { align: "center" });
      doc.line(cx + bodyCols[classAvgIdx]!.w, y, cx + bodyCols[classAvgIdx]!.w, y + rowH);
      cx += bodyCols[classAvgIdx]!.w;
      const gradeIdx = classAvgIdx + 1;
      const gradeLabel = fitSingleLine(doc, item.grade ?? "—", bodyCols[gradeIdx]!.w - 1, 8, 5.5);
      doc.text(gradeLabel, cx + bodyCols[gradeIdx]!.w / 2, y + 4.8, { align: "center" });
      doc.setFontSize(8);
      doc.line(cx + bodyCols[gradeIdx]!.w, y, cx + bodyCols[gradeIdx]!.w, y + rowH);
      cx += bodyCols[gradeIdx]!.w;
      const remarkIdx = gradeIdx + 1;
      const remarkLabel = fitSingleLine(doc, item.remark ?? "—", bodyCols[remarkIdx]!.w - 1, 7, 5.5);
      doc.text(remarkLabel, cx + bodyCols[remarkIdx]!.w / 2, y + 4.8, { align: "center" });
      doc.setFontSize(8);
      doc.line(cx + bodyCols[remarkIdx]!.w, y, cx + bodyCols[remarkIdx]!.w, y + rowH);
      cx += bodyCols[remarkIdx]!.w;
      y += rowH;
    }

    // Total / Average summary row.
    y += 3;
    doc.setFont("times", "bold");
    doc.setFontSize(9);
    doc.setTextColor(INK);
    const studentTotalSum = card.items.reduce((a, i) => a + (i.total ?? 0), 0);
    const avgVal = card.items.length ? Math.round((studentTotalSum / card.items.length) * 10) / 10 : 0;
    doc.setFillColor(HEADER_BG);
    doc.setDrawColor(INK);
    doc.rect(M + 4, y, 30, 9, "FD");
    doc.rect(M + 34, y, 30, 9, "FD");
    doc.setFontSize(7.5);
    doc.text("TOTAL", M + 4 + 15, y + 3.5, { align: "center" });
    doc.text("AVERAGE", M + 34 + 15, y + 3.5, { align: "center" });
    doc.setFontSize(9);
    doc.text(String(Math.round(studentTotalSum)), M + 4 + 15, y + 7.5, { align: "center" });
    doc.text(String(avgVal), M + 34 + 15, y + 7.5, { align: "center" });
    y += 14;

    // Performance chart — one bar per subject's Total score, so a strength
    // or a weak spot shows at a glance instead of only as numbers in a row.
    if (card.items.length > 0) {
      y = sectionTitle(doc, "PERFORMANCE CHART — STRENGTHS & WEAKNESSES", W / 2, y + 3, 9) + 4;
      const chartH = 34;
      drawPerformanceChart(doc, card.items, M + 4, y, contentW - 8, chartH);
      y += chartH + 3;
      doc.setFont("times", "italic");
      doc.setFontSize(6.5);
      doc.setTextColor(MUTED);
      doc.text("Each bar is the subject's Total Score out of 100. The dashed line marks the pass mark (50).", M + 4, y);
      y += 6;
    }
  }

  // Domain grids (Psychomotor & Affective in green, Behavioural in orange)
  // and a colored grading key, side by side.
  const gridTop = y;
  const leftW = contentW * 0.56;
  const gradeLetters = ["A", "B", "C", "D", "E"];

  function drawTraitGrid(title: string, traits: Array<[string, string]>, top: number, headerBg: string, headerText: string): number {
    const traitColW = leftW * 0.5;
    const letterColW = (leftW - traitColW) / gradeLetters.length;
    let ly = top;
    doc.setDrawColor(INK);
    doc.setLineWidth(0.25);
    doc.setFillColor(headerBg);
    doc.rect(M + 4, ly, leftW, 6, "FD");
    doc.setFont("times", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(headerText);
    doc.text(title, M + 4 + 2, ly + 4);
    gradeLetters.forEach((l, i) => {
      doc.text(l, M + 4 + traitColW + letterColW * i + letterColW / 2, ly + 4, { align: "center" });
    });
    ly += 6;
    doc.setFont("times", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(INK);
    for (const [trait, grade] of traits) {
      doc.setDrawColor(INK);
      doc.rect(M + 4, ly, leftW, 5.5);
      doc.text(trait, M + 4 + 1.5, ly + 3.8, { maxWidth: traitColW - 3 });
      gradeLetters.forEach((l, i) => {
        const cx = M + 4 + traitColW + letterColW * i + letterColW / 2;
        if (grade === l) doc.text("✓", cx, ly + 3.8, { align: "center" });
      });
      ly += 5.5;
    }
    return ly;
  }

  let leftBottom = gridTop;
  let rightBottom = gridTop;
  if (config.showPsychomotor) {
    if (card.coCurricular && Object.keys(card.coCurricular).length) {
      leftBottom = drawTraitGrid("PSYCHOMOTOR & AFFECTIVE DOMAIN", Object.entries(card.coCurricular), leftBottom, DOMAIN_GREEN_BG, DOMAIN_GREEN_TEXT);
      leftBottom += 3;
    }
    if (card.psychomotor && Object.keys(card.psychomotor).length) {
      leftBottom = drawTraitGrid("BEHAVIOURAL ASSESSMENT", Object.entries(card.psychomotor), leftBottom, DOMAIN_ORANGE_BG, DOMAIN_ORANGE_TEXT);
    }
  }

  {
    const rightX = M + 4 + leftW + 6;
    const rightW = contentW - leftW - 6;
    let ry = gridTop;
    doc.setFont("times", "bold");
    doc.setFontSize(9);
    doc.setTextColor(NAVY);
    doc.text("GRADING KEY", rightX, ry + 4);
    ry += 7;
    const rowH = 4.8;
    const scoreColW = rightW * 0.34;
    const gradeColW = rightW * 0.32;
    doc.setFont("times", "bold");
    doc.setFontSize(7);
    doc.setDrawColor(INK);
    doc.setFillColor(HEADER_BG);
    doc.rect(rightX, ry, rightW, rowH, "FD");
    doc.setTextColor(NAVY);
    doc.text("SCORE", rightX + scoreColW / 2, ry + 3.3, { align: "center" });
    doc.text("GRADE", rightX + scoreColW + gradeColW / 2, ry + 3.3, { align: "center" });
    doc.text("REMARK", rightX + scoreColW + gradeColW + (rightW - scoreColW - gradeColW) / 2, ry + 3.3, { align: "center" });
    ry += rowH;
    doc.setFont("times", "normal");
    doc.setFontSize(7);
    for (const band of gradeBands) {
      const bg = band.min >= 70 ? GRADE_GREEN : band.min >= 50 ? GRADE_YELLOW : GRADE_RED;
      doc.setFillColor(bg);
      doc.setDrawColor(INK);
      doc.rect(rightX, ry, rightW, rowH, "FD");
      doc.setTextColor(INK);
      doc.text(`${band.min} - ${band.max}`, rightX + scoreColW / 2, ry + 3.3, { align: "center" });
      doc.text(fitSingleLine(doc, band.grade, gradeColW - 1, 7, 5), rightX + scoreColW + gradeColW / 2, ry + 3.3, { align: "center" });
      doc.text(fitSingleLine(doc, band.remark, rightW - scoreColW - gradeColW - 1, 7, 5), rightX + scoreColW + gradeColW + (rightW - scoreColW - gradeColW) / 2, ry + 3.3, { align: "center" });
      ry += rowH;
    }
    rightBottom = ry;
  }
  y = Math.max(leftBottom, rightBottom) + 5;

  function commentLine(label: string, value: string | null | undefined) {
    doc.setFont("times", "bold");
    doc.setFontSize(9);
    doc.setTextColor(INK);
    doc.text(`${label}:`, M + 4, y);
    const labelW = doc.getTextWidth(`${label}: `);
    doc.setFont("times", "normal");
    const lines = doc.splitTextToSize(value ?? "", contentW - 8 - labelW);
    doc.text(lines, M + 4 + labelW, y);
    doc.setDrawColor(INK);
    doc.setLineWidth(0.15);
    dashedHLine(doc, M + 4 + labelW + (lines[0] ? doc.getTextWidth(lines[0]) + 1 : 0), W - M - 4, y + 1.3);
    y += Math.max(lines.length, 1) * 5;
  }

  function nameSignRow(nameLabel: string, nameValue: string | null | undefined, signLabel = "Sign/Date") {
    doc.setFont("times", "bold");
    doc.setFontSize(9);
    doc.setTextColor(INK);
    doc.text(`${nameLabel}:`, M + 4, y);
    const labelW = doc.getTextWidth(`${nameLabel}: `);
    doc.setFont("times", "normal");
    doc.text(nameValue ?? "", M + 4 + labelW, y);
    doc.text(`${signLabel}: `, W - M - 55, y);
    doc.setDrawColor(INK);
    doc.setLineWidth(0.15);
    doc.line(W - M - 40, y + 0.5, W - M - 4, y + 0.5);
    y += 6;
  }

  commentLine("Form Master's Comment", card.remark);
  nameSignRow("Form Master's Name", card.formMasterName);
  commentLine("Principal's Comment", card.principalComment);
  nameSignRow("Principal's Name", card.principalName);

  if (config.showFees) {
    doc.setDrawColor(INK);
    doc.setLineWidth(0.3);
    doc.line(M + 4, y, W - M - 4, y);
    y += 5;
    doc.setFont("times", "bold");
    doc.setFontSize(9);
    doc.setTextColor(INK);
    doc.text("Fees Owed:", M + 4, y);
    doc.setFont("times", "normal");
    doc.text(fmtMoney(card.feesOwed) || "—", M + 4 + doc.getTextWidth("Fees Owed: "), y);
    doc.setFont("times", "bold");
    doc.text("Next Term's Fees:", M + 4 + contentW / 3, y);
    doc.setFont("times", "normal");
    doc.text(fmtMoney(card.nextTermFees) || "—", M + 4 + contentW / 3 + doc.getTextWidth("Next Term's Fees: "), y);
    doc.setFont("times", "bold");
    doc.text("Payable On Or Before:", M + 4 + (contentW / 3) * 2, y);
    doc.setFont("times", "normal");
    doc.text(fmtDate(card.feesPayableBy) || "—", M + 4 + (contentW / 3) * 2 + doc.getTextWidth("Payable On Or Before: "), y);
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
