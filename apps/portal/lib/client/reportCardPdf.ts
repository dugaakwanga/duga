// Builds a printable A4 report card PDF that matches the school's printed
// termly result sheet EXACTLY — not an approximation drawn with jsPDF's
// shape primitives, but the sheet's real HTML/CSS (Georgia serif, navy
// header, circular crest, dotted-underline id fields, a Continuous
// Assessment/Exams-grouped subjects table, an SVG performance chart, green/
// orange domain grids, a colored grading key) rendered off-screen and
// snapshotted with html2canvas into the PDF page(s). Hand-drawn jsPDF shapes
// can't reproduce flexbox/grid layout or exact typography; a real browser
// render of the real CSS can.

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
  student: { firstName: string; lastName: string; admissionNumber?: string; photoUrl?: string | null; gender?: "MALE" | "FEMALE" | null };
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

const ROOT = "duga-rc-sheet";

// The sheet's own stylesheet, namespaced under .duga-rc-sheet so it can't
// bleed into the live app while the off-screen render is briefly attached to
// document.body (the reference design uses bare `body`/`table`/`th, td`
// selectors, which would otherwise apply document-wide).
const SHEET_CSS = `
.${ROOT}, .${ROOT} *{ box-sizing:border-box; }
.${ROOT}{
  font-family: Georgia, 'Times New Roman', serif;
  color:#000;
  background:#fff;
  width:210mm;
  min-height:297mm;
  padding:5mm 10mm;
  border:2px solid #000;
  position:relative;
}
.${ROOT} .header{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
  border-bottom:2px solid #1f3a5f;
  padding-bottom:6px;
  margin-bottom:6px;
}
.${ROOT} .logo-box, .${ROOT} .photo-box{
  width:70px;height:70px;
  border:1px solid #1f3a5f;
  display:flex;align-items:center;justify-content:center;
  text-align:center;font-size:9px;color:#555;
  flex-shrink:0;overflow:hidden;
}
.${ROOT} .photo-box{ height:84px; }
.${ROOT} .logo-box{ border-radius:50%; }
.${ROOT} .logo-box img, .${ROOT} .photo-box img{ width:100%;height:100%;object-fit:cover; }
.${ROOT} .school-name{ flex-grow:1; text-align:center; }
.${ROOT} .school-name h1{ margin:0; font-size:23px; letter-spacing:1px; color:#1f3a5f; }
.${ROOT} .school-name .motto{ font-style:italic; font-size:12px; margin:2px 0; }
.${ROOT} .school-name .section{ font-weight:bold; font-size:13.5px; letter-spacing:2px; margin-top:2px; }

.${ROOT} h2.section-title{
  text-align:center;
  font-size:13.5px;
  margin:6px 0 4px;
  font-weight:bold;
  color:#1f3a5f;
  /* html2canvas mismeasures word-space width for bold Georgia at small
     sizes and renders words with no gap between them ("ACADEMICREPORT") —
     a documented html2canvas quirk. A non-zero letter-spacing forces it
     onto its accurate per-glyph text path instead of the collapsed one. */
  letter-spacing:0.3px;
}
.${ROOT} h2.section-title .title-ul{
  border-bottom:1.5px solid #1f3a5f;
  padding-bottom:2px;
}

.${ROOT} .id-block{
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:2px 20px;
  font-size:11px;
  margin-bottom:4px;
}
.${ROOT} .field{ border-bottom:1px dotted #000; display:flex; gap:4px; line-height:1.35; padding-bottom:1px; }
.${ROOT} .field label{ font-weight:bold; white-space:nowrap; }
.${ROOT} .field span{ flex-grow:1; }

.${ROOT} table{ width:100%; border-collapse:collapse; font-size:10px; }
.${ROOT} th, .${ROOT} td{ border:1px solid #000; padding:1.5px 4px; text-align:center; line-height:1.3; }
.${ROOT} thead th{ background:#eaf0f6; color:#1f3a5f; }
.${ROOT} td.subject-name{ text-align:left; font-weight:bold; font-size:10.5px; }
.${ROOT} tr.total-row td{ font-weight:bold; background:#eaf0f6; }
.${ROOT} .domain-table tr:first-child th{ background:#e6f2ea; color:#2c6e49; }
.${ROOT} .behaviour-table tr:first-child th{ background:#fdf1de; color:#a1651a; }

.${ROOT} .two-col{ display:flex; gap:16px; margin-top:6px; }
.${ROOT} .two-col > div{ flex:1; }
.${ROOT} .mini-table th, .${ROOT} .mini-table td{ font-size:9.5px; padding:1.5px 3px; }

.${ROOT} .remarks{ margin-top:6px; font-size:10.5px; }
.${ROOT} .remarks .line{ border-bottom:1px dotted #000; min-height:12px; line-height:1.35; padding-bottom:1px; margin-bottom:3px; }
.${ROOT} .sig-row{ display:flex; justify-content:space-between; margin-top:2px; font-size:10.5px; gap:20px; }
.${ROOT} .sig-row .field{ flex:1; }

.${ROOT} .footer-note{
  margin-top:6px; font-size:10px;
  display:flex; justify-content:space-between; gap:16px;
  border-top:1px solid #000; padding-top:3px;
}

.${ROOT} .chart-wrap{ margin-top:6px; }
.${ROOT} .chart-note{ font-size:9px; margin-top:2px; }
.${ROOT} #chartSvg text{ font-family: Georgia, serif; }
`;

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

// A section title with its navy underline drawn via border-bottom on an
// inner <span> rather than CSS text-decoration — html2canvas's text layout
// silently collapses the space between words in bold text-decoration:underline
// headings (confirmed: "PERFORMANCE CHART" rendered as "PERFORMANCECHART"),
// but a border-bottom on a wrapping span doesn't touch text layout at all.
function titleHtml(text: string, fontSize?: string): string {
  const style = fontSize ? ` style="font-size:${fontSize};"` : "";
  return `<h2 class="section-title"${style}><span class="title-ul">${text}</span></h2>`;
}

function esc(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmtDate(v: string | null | undefined): string {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtMoney(v: number | null | undefined): string {
  if (v === null || v === undefined) return "";
  return `₦${Math.round(v).toLocaleString()}`;
}

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

function bandColorFor(total: number | null | undefined): string {
  const v = total ?? 0;
  if (v <= 0) return "";
  if (v >= 70) return "#e5f3e8";
  if (v >= 50) return "#fbf3d9";
  return "#f9e2e0";
}

function keyRowColor(min: number): string {
  return min >= 70 ? "#e5f3e8" : min >= 50 ? "#fbf3d9" : "#f9e2e0";
}

// Builds the "SUBJECTS | CONTINUOUS ASSESSMENT | EXAMS | TOTAL | ..." table,
// with Assignment 1/2, Test 1/2, ... grouped under their own spanning header
// cell exactly like the printed sheet — generically, from whatever CA/EXAM
// components this school's ResultConfig defines, not hardcoded to one shape.
function buildAcademicTableHtml(components: ReportCardPdfComponent[], items: ReportCardPdfItem[]): string {
  const caComponents = components.filter((c) => c.category === "CA").sort((a, b) => a.order - b.order);
  const examComponents = components.filter((c) => c.category === "EXAM").sort((a, b) => a.order - b.order);
  const compCols = [...caComponents, ...examComponents];

  function categoryHeaderCells(comps: ReportCardPdfComponent[], literalLabel: string): { row1: string; row2: string; row3: string } {
    if (!comps.length) return { row1: "", row2: "", row3: "" };
    if (comps.length === 1) {
      const c = comps[0]!;
      return { row1: `<th rowspan="3">${esc(literalLabel)}<br>${c.max}</th>`, row2: "", row3: "" };
    }
    const row1 = `<th colspan="${comps.length}">${esc(literalLabel)}</th>`;
    let row2 = "";
    let row3 = "";
    for (const g of groupComponents(comps)) {
      if (g.comps.length === 1) {
        const c = g.comps[0]!;
        row2 += `<th rowspan="2">${esc(g.label)}<br>${c.max}</th>`;
      } else {
        row2 += `<th colspan="${g.comps.length}">${esc(g.label)}</th>`;
        for (const c of g.comps) row3 += `<th>${esc(componentOrdinal(c.name))}<br>${c.max}</th>`;
      }
    }
    return { row1, row2, row3 };
  }

  const ca = categoryHeaderCells(caComponents, "CONTINUOUS ASSESSMENT");
  const exam = categoryHeaderCells(examComponents, "EXAMS");

  const thead = `
    <tr>
      <th rowspan="3">SUBJECTS</th>
      ${ca.row1}${exam.row1}
      <th rowspan="3">TOTAL<br>SCORE</th>
      <th rowspan="3">CLASS<br>AVERAGE</th>
      <th rowspan="3">GRADE</th>
      <th rowspan="3">REMARK</th>
      <th rowspan="3">SIGNATURE</th>
    </tr>
    <tr>${ca.row2}${exam.row2}</tr>
    <tr>${ca.row3}${exam.row3}</tr>
  `;

  const bodyRows = items
    .map((item) => {
      const compCells = compCols
        .map((c) => {
          const v = item.componentScores?.[c.name];
          return `<td>${v === undefined || v === null ? "—" : v}</td>`;
        })
        .join("");
      const bg = bandColorFor(item.total);
      return `<tr>
        <td class="subject-name">${esc(item.subject.name)}</td>
        ${compCells}
        <td class="readonly total-cell" style="font-weight:bold;${bg ? ` background:${bg};` : ""}">${item.total ?? "—"}</td>
        <td>${item.classAverage !== null && item.classAverage !== undefined ? item.classAverage.toFixed(1) : "—"}</td>
        <td>${esc(item.grade) || "—"}</td>
        <td>${esc(item.remark) || "—"}</td>
        <td></td>
      </tr>`;
    })
    .join("");

  const totalSum = items.reduce((a, i) => a + (i.total ?? 0), 0);
  const avg = items.length ? Math.round((totalSum / items.length) * 10) / 10 : 0;
  const totalRow = `<tr class="total-row">
    <td class="subject-name">TOTAL / AVERAGE</td>
    ${compCols.length ? `<td colspan="${compCols.length}"></td>` : ""}
    <td>${Math.round(totalSum)}</td>
    <td>${avg}</td>
    <td colspan="3"></td>
  </tr>`;

  return `<table id="academicTable"><thead>${thead}</thead><tbody>${bodyRows}${totalRow}</tbody></table>`;
}

// One bar per subject's Total score (0-100), color-banded the same as the
// grading key, with a dashed pass-mark line at 50 — a direct port of the
// reference sheet's own drawChart(), using real subject totals instead of a
// static demo array.
function buildChartSvg(items: ReportCardPdfItem[]): string {
  const w = 700;
  const h = 118;
  const padL = 30;
  const padB = 42;
  const padT = 10;
  const padR = 10;
  const chartW = w - padL - padR;
  const chartH = h - padT - padB;
  const n = Math.max(items.length, 1);
  const barGap = 10;
  const barW = chartW / n - barGap;

  let svg = `<svg id="chartSvg" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:${h}px;border:1px solid #000;background:#fff;">`;
  svg += `<line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + chartH}" stroke="#000"/>`;
  svg += `<line x1="${padL}" y1="${padT + chartH}" x2="${w - padR}" y2="${padT + chartH}" stroke="#000"/>`;
  for (let v = 0; v <= 100; v += 20) {
    const y = padT + chartH - (v / 100) * chartH;
    svg += `<line x1="${padL}" y1="${y}" x2="${w - padR}" y2="${y}" stroke="#ccc" stroke-width="0.5"/>`;
    svg += `<text x="${padL - 6}" y="${y + 3}" font-size="8" text-anchor="end">${v}</text>`;
  }
  const passY = padT + chartH - 0.5 * chartH;
  svg += `<line x1="${padL}" y1="${passY}" x2="${w - padR}" y2="${passY}" stroke="#000" stroke-width="1" stroke-dasharray="4,3"/>`;

  items.forEach((item, i) => {
    const val = Math.max(0, Math.min(100, item.total ?? 0));
    const barH = (val / 100) * chartH;
    const x = padL + i * (barW + barGap) + barGap / 2;
    const y = padT + chartH - barH;
    const fill = val >= 70 ? "#cfe9d6" : val >= 50 ? "#fbedb8" : val > 0 ? "#f6cfcb" : "#fff";
    svg += `<rect x="${x}" y="${y}" width="${barW}" height="${Math.max(barH, 0)}" fill="${fill}" stroke="#000" stroke-width="1.2"/>`;
    if (val > 0) svg += `<text x="${x + barW / 2}" y="${y - 4}" font-size="9" text-anchor="middle">${Math.round(val)}</text>`;
    const shortName = item.subject.name.length > 14 ? `${item.subject.name.slice(0, 13)}.` : item.subject.name;
    svg += `<text x="${x + barW / 2}" y="${padT + chartH + 10}" font-size="8" text-anchor="end" transform="rotate(-40 ${x + barW / 2} ${padT + chartH + 10})">${esc(shortName)}</text>`;
  });
  svg += `</svg>`;
  return svg;
}

// Canonical trait order — mirrors DEFAULT_PSYCHOMOTOR_TRAITS/
// DEFAULT_BEHAVIORAL_TRAITS in packages/core/src/server/reportCard.ts. The
// traits are stored as a JSON object on the report card, so their key order
// depends on how Postgres/Prisma happened to serialize it (often
// alphabetical) rather than the printed sheet's intended order — this puts
// them back in the right order for display, unknown traits sorted last.
const DEFAULT_PSYCHOMOTOR_TRAITS = ["Handwriting", "Sports/Games", "Verbal Fluency", "Leadership", "Musical Skill"];
const DEFAULT_BEHAVIORAL_TRAITS = ["Neatness", "Punctuality", "Honesty", "Self Control", "Obedience", "Politeness", "Relationship with Others"];

function sortTraitEntries(entries: Array<[string, string]>, order: string[]): Array<[string, string]> {
  return [...entries].sort((a, b) => {
    const ia = order.indexOf(a[0]);
    const ib = order.indexOf(b[0]);
    return (ia === -1 ? order.length : ia) - (ib === -1 ? order.length : ib);
  });
}

function buildTraitTableHtml(entries: Array<[string, string]>, tableClass: string): string {
  const letters = ["A", "B", "C", "D", "E"];
  const rows = entries
    .map(
      ([trait, grade]) =>
        `<tr><td class="subject-name">${esc(trait)}</td>${letters.map((l) => `<td>${grade === l ? "✓" : ""}</td>`).join("")}</tr>`,
    )
    .join("");
  return `<table class="mini-table ${tableClass}">
    <tr><th style="text-align:left;">Trait</th>${letters.map((l) => `<th>${l}</th>`).join("")}</tr>
    ${rows}
  </table>`;
}

function buildGradingKeyHtml(gradeBands: ReportCardPdfGradeBand[]): string {
  const rows = gradeBands
    .map(
      (b) =>
        `<tr style="background:${keyRowColor(b.min)};"><td>${b.min} - ${b.max}</td><td>${esc(b.grade)}</td><td>${esc(b.remark)}</td></tr>`,
    )
    .join("");
  return `<table class="mini-table">
    <tr><th>Score</th><th>Grade</th><th>Remark</th></tr>
    ${rows}
  </table>
  <p style="margin-top:8px;font-size:11px;"><strong>Rating Key (Domains):</strong><br>A = Excellent&nbsp;&nbsp;B = Very Good&nbsp;&nbsp;C = Good&nbsp;&nbsp;D = Fair&nbsp;&nbsp;E = Poor</p>`;
}

function buildSheetHtml(
  school: ReportCardPdfSchool,
  config: ReportCardPdfConfig,
  card: ReportCardPdfData,
  components: ReportCardPdfComponent[],
  gradeBands: ReportCardPdfGradeBand[],
  logoDataUrl: string | null,
  photoDataUrl: string | null,
): string {
  const genderLabel = card.student.gender === "MALE" ? "Male" : card.student.gender === "FEMALE" ? "Female" : "";
  const pctAttendance =
    config.showAttendance && card.schoolDaysOpened ? `${Math.round(((card.daysPresent ?? 0) / card.schoolDaysOpened) * 100)}%` : "";

  const fields: Array<[string, string]> = [
    ["Town", config.town ?? ""],
    ["State", config.state ?? ""],
    ["Class", card.className ?? ""],
    ["Term", card.term?.name ?? ""],
    ["Session", card.sessionName ?? ""],
    ["Admission No", card.student.admissionNumber ?? ""],
    ["Name of Student", `${card.student.firstName} ${card.student.lastName}`],
    ["Age", card.studentAge !== null && card.studentAge !== undefined ? String(card.studentAge) : ""],
    ["Sex", genderLabel],
    ["No. in Class", card.classSize !== null && card.classSize !== undefined ? String(card.classSize) : ""],
    ["Position in Class", card.position !== null && card.position !== undefined ? String(card.position) : ""],
  ];
  if (config.showAttendance) {
    fields.push(
      ["No. of Times School Opened", card.schoolDaysOpened !== null && card.schoolDaysOpened !== undefined ? String(card.schoolDaysOpened) : ""],
      ["Total Attendance", card.daysPresent !== null && card.daysPresent !== undefined ? String(card.daysPresent) : ""],
      ["% Attendance", pctAttendance],
    );
  }
  fields.push(["This Term Ends", fmtDate(card.term?.endDate)], ["Next Term Begins", fmtDate(card.feesPayableBy)]);
  const idBlockHtml = fields.map(([l, v]) => `<div class="field"><label>${esc(l)}:</label><span>${esc(v)}</span></div>`).join("");

  const academicSection =
    config.showCognitive && card.items?.length
      ? `
    ${titleHtml("ACADEMIC REPORT")}
    ${buildAcademicTableHtml(components, card.items)}
    <div class="chart-wrap">
      ${titleHtml("PERFORMANCE CHART &mdash; STRENGTHS &amp; WEAKNESSES")}
      ${buildChartSvg(card.items)}
      <div class="chart-note">Each bar is the subject's Total Score out of 100. The dashed line marks the pass mark (50).</div>
    </div>`
      : "";

  const domainGridsHtml = config.showPsychomotor
    ? `${card.coCurricular && Object.keys(card.coCurricular).length ? `${titleHtml("PSYCHOMOTOR &amp; AFFECTIVE DOMAIN", "12.5px")}${buildTraitTableHtml(sortTraitEntries(Object.entries(card.coCurricular), DEFAULT_PSYCHOMOTOR_TRAITS), "domain-table")}` : ""}
    ${card.psychomotor && Object.keys(card.psychomotor).length ? `${titleHtml("BEHAVIOURAL ASSESSMENT", "12.5px")}${buildTraitTableHtml(sortTraitEntries(Object.entries(card.psychomotor), DEFAULT_BEHAVIORAL_TRAITS), "behaviour-table")}` : ""}`
    : "";

  const feesHtml = config.showFees
    ? `<div class="footer-note">
      <div class="field"><label>Fees Owed:</label><span>${esc(fmtMoney(card.feesOwed) || "—")}</span></div>
      <div class="field"><label>Next Term's Fees:</label><span>${esc(fmtMoney(card.nextTermFees) || "—")}</span></div>
      <div class="field"><label>Payable On or Before:</label><span>${esc(fmtDate(card.feesPayableBy) || "—")}</span></div>
    </div>`
    : "";

  const watermarkHtml = config.showWatermark
    ? `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;overflow:hidden;pointer-events:none;">
      <div style="transform:rotate(-30deg);font-size:90px;font-weight:bold;color:#1f3a5f;opacity:0.07;white-space:nowrap;">${esc((school.shortName || school.name).toUpperCase())}</div>
    </div>`
    : "";

  return `<div class="${ROOT}">
    ${watermarkHtml}
    <div style="position:relative;">
      <div class="header">
        <div class="logo-box">${logoDataUrl ? `<img src="${logoDataUrl}" alt="LOGO">` : "SCHOOL LOGO"}</div>
        <div class="school-name">
          <h1>${esc(school.name.toUpperCase())}</h1>
          ${config.motto ? `<div class="motto">Motto: ${esc(config.motto)}</div>` : ""}
          ${config.sectionLabel ? `<div class="section">${esc(config.sectionLabel.toUpperCase())}</div>` : ""}
        </div>
        <div class="photo-box">${photoDataUrl ? `<img src="${photoDataUrl}" alt="PASSPORT">` : "STUDENT PASSPORT"}</div>
      </div>

      <div class="id-block">${idBlockHtml}</div>

      ${academicSection}

      <div class="two-col">
        <div>${domainGridsHtml}</div>
        <div>
          ${titleHtml("GRADING KEY", "12.5px")}
          ${buildGradingKeyHtml(gradeBands)}
        </div>
      </div>

      <div class="remarks">
        <div class="field"><label>Form Master's Comment:</label></div>
        <div class="line">${esc(card.remark)}</div>
        <div class="sig-row">
          <div class="field"><label>Form Master's Name:</label><span>${esc(card.formMasterName)}</span></div>
          <div class="field"><label>Sign/Date:</label><span></span></div>
        </div>
        <div class="field" style="margin-top:8px;"><label>Principal's Comment:</label></div>
        <div class="line">${esc(card.principalComment)}</div>
        <div class="sig-row">
          <div class="field"><label>Principal's Name:</label><span>${esc(card.principalName)}</span></div>
          <div class="field"><label>Sign/Date:</label><span></span></div>
        </div>
      </div>

      ${feesHtml}
    </div>
  </div>`;
}

// Renders the sheet's real HTML/CSS off-screen (attached to document.body so
// it actually lays out, positioned far outside the viewport so nobody sees
// it flash by) and snapshots it with html2canvas. scale:2 keeps the raster
// crisp enough for print without ballooning file size the way a naive high-
// DPI render would.
async function renderSheetCanvas(html: string): Promise<HTMLCanvasElement> {
  const html2canvas = (await import("html2canvas")).default;
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-10000px";
  container.style.top = "0";
  container.innerHTML = `<style>${SHEET_CSS}</style>${html}`;
  document.body.appendChild(container);
  try {
    const target = container.querySelector<HTMLElement>(`.${ROOT}`)!;
    const imgs = Array.from(target.querySelectorAll("img"));
    await Promise.all(imgs.map((img) => (img.decode ? img.decode().catch(() => {}) : Promise.resolve())));
    return await html2canvas(target, { scale: 2, backgroundColor: "#ffffff", useCORS: true, logging: false });
  } finally {
    document.body.removeChild(container);
  }
}

// Slices a (possibly page-tall-or-taller) canvas into as many A4 pages as it
// needs, each page just an image of that horizontal strip — the standard
// html2canvas+jsPDF recipe for turning an arbitrary-height DOM snapshot into
// a paginated PDF.
async function canvasToPdf(canvas: HTMLCanvasElement): Promise<JsPDFType> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageWidth = 210;
  const pageHeight = 297;
  const imgData = canvas.toDataURL("image/jpeg", 0.93);
  const imgHeight = (canvas.height * pageWidth) / canvas.width;
  let heightLeft = imgHeight;
  let position = 0;
  doc.addImage(imgData, "JPEG", 0, position, pageWidth, imgHeight);
  heightLeft -= pageHeight;
  while (heightLeft > 0.5) {
    position = heightLeft - imgHeight;
    doc.addPage();
    doc.addImage(imgData, "JPEG", 0, position, pageWidth, imgHeight);
    heightLeft -= pageHeight;
  }
  return doc;
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
  student: { firstName: "Jane", lastName: "Doe", admissionNumber: "SAMPLE/001", gender: "FEMALE" },
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

async function buildReportCardDoc(
  school: ReportCardPdfSchool,
  config: ReportCardPdfConfig,
  card: ReportCardPdfData,
  components: ReportCardPdfComponent[],
  gradeBands: ReportCardPdfGradeBand[],
) {
  const [logoDataUrl, photoDataUrl] = await Promise.all([
    config.showLogo ? toDataUrl(school.logoUrl) : Promise.resolve(null),
    toDataUrl(card.student.photoUrl ?? null),
  ]);
  const html = buildSheetHtml(school, config, card, components, gradeBands, logoDataUrl, photoDataUrl);
  const canvas = await renderSheetCanvas(html);
  const doc = await canvasToPdf(canvas);
  const name = `${card.student.firstName} ${card.student.lastName}`;
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
