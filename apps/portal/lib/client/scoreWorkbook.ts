import type { Workbook } from "exceljs";

type Sheet = {
  classSubject: { id: string };
  termId: string;
  config: { components: { name: string; max: number }[] };
  lockedComponents: string[];
  rows: { studentId: string; name: string; admissionNumber: string | null; blocked?: boolean }[];
};

async function workbook(): Promise<Workbook> {
  const { default: ExcelJS } = await import("exceljs");
  return new ExcelJS.Workbook();
}

function layout(sheet: Sheet) {
  const components = sheet.config.components.filter((c) => !sheet.lockedComponents.includes(c.name));
  const headers = ["Student", "Admission number", ...components.map((c) => `${c.name} (out of ${c.max})`)];
  const context = JSON.stringify([sheet.classSubject.id, sheet.termId, headers]);
  return { components, headers, context };
}

export async function downloadScoreWorkbook(sheet: Sheet) {
  const book = await workbook();
  const page = book.addWorksheet("Scores");
  const { headers, context } = layout(sheet);
  page.addRow([context]);
  page.getRow(1).hidden = true;
  page.addRow(headers).font = { bold: true };
  page.columns.forEach((column, index) => { column.width = index === 0 ? 30 : 23; });
  for (const row of sheet.rows) {
    if (!row.blocked && row.admissionNumber) page.addRow([row.name, row.admissionNumber]);
  }
  const bytes = await book.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "Score entry.xlsx";
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function readScoreWorkbook(file: File, sheet: Sheet) {
  if (!file.name.toLowerCase().endsWith(".xlsx") || file.size > 2 * 1024 * 1024) {
    throw new Error("Choose an Excel workbook (.xlsx) under 2 MB.");
  }
  const book = await workbook();
  await book.xlsx.load(await file.arrayBuffer());
  const page = book.getWorksheet("Scores");
  const { components, headers, context } = layout(sheet);
  if (!page || page.getCell("A1").value !== context || page.columnCount > headers.length ||
      headers.some((header, index) => page.getRow(2).getCell(index + 1).value !== header)) {
    throw new Error("Download a fresh template for this subject and term. Keep its columns in order.");
  }
  const roster = new Map(sheet.rows.filter((row) => !row.blocked && row.admissionNumber).map((row) => [row.admissionNumber, row]));
  const changes = new Map<string, Record<string, number>>();
  const seen = new Set<string>();
  page.eachRow((row, index) => {
    if (index < 3) return;
    const number = row.getCell(2).text.trim();
    const student = roster.get(number);
    if (!student || seen.has(number) || row.getCell(1).text.trim() !== student.name) {
      throw new Error(`Row ${index} has a duplicate or unmatched student. Keep the names and admission numbers from the template.`);
    }
    seen.add(number);
    const scores: Record<string, number> = Object.create(null);
    components.forEach((component, offset) => {
      const value = row.getCell(offset + 3).value;
      if (value === null || value === "") return;
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > component.max) {
        throw new Error(`Row ${index}: enter a number from 0 to ${component.max} for ${component.name}.`);
      }
      scores[component.name] = value;
    });
    if (Object.keys(scores).length) changes.set(student.studentId, scores);
  });
  if (!changes.size) throw new Error("The workbook contains no marks to upload.");
  return changes;
}
