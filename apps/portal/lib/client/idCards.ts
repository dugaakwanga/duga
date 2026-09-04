// Builds a printable student ID card PDF (front + back per student) on the
// client, styled as a portrait badge — diagonal two-tone corner accents,
// circular photo, bold name block — in the school's own brand colors.
// Card size is CR80 (54mm x 85.6mm), the standard ID-card/badge size that
// print shops and laminating pouches expect, rotated to portrait to suit a
// centered vertical layout.

export interface IdCardSchool {
  name: string;
  shortName: string;
  address: string | null;
  phone: string | null;
  logoUrl: string | null;
}

export interface IdCardStudent {
  studentId: string;
  firstName: string;
  lastName: string;
  admissionNumber: string;
  className: string | null;
  section: string;
  dateOfBirth: string | null;
  gender: string | null;
  photoUrl: string | null;
  code: string; // signed gate token, encoded into the QR
}

const CARD_W = 54;
const CARD_H = 85.6;

// Brand colors — falls back to DUGA's own navy/gold if a school hasn't set
// its own theme (no per-school color is stored yet; see note in the caller).
const INK = "#111827";
const MUTED = "#6b7280";

// Fetches an (often cross-origin, publicly-readable) image URL and returns it
// as a data URL jsPDF can embed. Never throws — a card should still render
// (with a placeholder) if a photo/logo fails to load.
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

export async function downloadIdCardsPdf(
  school: IdCardSchool,
  students: IdCardStudent[],
  brand: { primary: string; accent: string } = { primary: "#1e3a5f", accent: "#c8a448" },
): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const QRCode = (await import("qrcode")).default;

  const doc = new jsPDF({ unit: "mm", format: [CARD_W, CARD_H], orientation: "portrait" });
  const logoDataUrl = await toDataUrl(school.logoUrl);
  const { primary, accent } = brand;

  // Two-tone diagonal triangle in one corner — the accent color forms a thin
  // border peeking out from behind the primary-color triangle.
  function cornerTriangle(corner: "tl" | "br") {
    const big = 20;
    const small = 15.5;
    doc.setDrawColor(accent);
    doc.setFillColor(accent);
    if (corner === "tl") {
      doc.triangle(0, 0, big, 0, 0, big, "F");
      doc.setFillColor(primary);
      doc.triangle(0, 0, small, 0, 0, small, "F");
    } else {
      doc.triangle(CARD_W, CARD_H, CARD_W - big, CARD_H, CARD_W, CARD_H - big, "F");
      doc.setFillColor(primary);
      doc.triangle(CARD_W, CARD_H, CARD_W - small, CARD_H, CARD_W, CARD_H - small, "F");
    }
  }

  // Returns the y position content can safely start below. Uses the short
  // name as the bold headline (mirrors the reference template's single-word
  // brand mark) since a school's full legal name routinely overflows a
  // 54mm-wide card — the full name still appears, in small print, wrapped
  // and measured dynamically so it can never overlap what follows it.
  function header() {
    cornerTriangle("tl");
    cornerTriangle("br");
    doc.setFillColor("#ffffff");
    let y = 6;
    if (logoDataUrl) {
      try {
        doc.addImage(logoDataUrl, imageFormat(logoDataUrl), CARD_W / 2 - 4, y, 8, 8);
        y += 10;
      } catch {
        /* skip a logo image jsPDF can't decode rather than failing the card */
      }
    }
    doc.setTextColor(primary);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text((school.shortName || school.name).toUpperCase(), CARD_W / 2, y + 3, { align: "center" });
    y += 6.5;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.2);
    doc.setTextColor(MUTED);
    const nameLines = doc.splitTextToSize(school.name, CARD_W - 12);
    doc.text(nameLines, CARD_W / 2, y, { align: "center" });
    y += nameLines.length * 2.3 + 2;
    return y;
  }

  function divider(y: number) {
    doc.setDrawColor(primary);
    doc.setLineWidth(0.5);
    doc.line(CARD_W / 2 - 9, y, CARD_W / 2 + 9, y);
  }

  let first = true;
  for (const s of students) {
    const [photoDataUrl, qrDataUrl] = await Promise.all([
      toDataUrl(s.photoUrl),
      QRCode.toDataURL(s.code, { width: 240, margin: 1, color: { dark: primary } }),
    ]);

    // ---- Front ----
    if (!first) doc.addPage([CARD_W, CARD_H], "portrait");
    first = false;

    let y = header();

    const photoR = 10;
    const photoCx = CARD_W / 2;
    const photoCy = y + photoR + 3;
    doc.setDrawColor(accent);
    doc.setLineWidth(1);
    doc.circle(photoCx, photoCy, photoR + 1.4, "S");
    doc.setDrawColor(primary);
    doc.setLineWidth(0.6);
    doc.circle(photoCx, photoCy, photoR + 0.6, "S");

    if (photoDataUrl) {
      try {
        doc.saveGraphicsState();
        doc.circle(photoCx, photoCy, photoR, null);
        doc.clip();
        doc.discardPath();
        doc.addImage(photoDataUrl, imageFormat(photoDataUrl), photoCx - photoR, photoCy - photoR, photoR * 2, photoR * 2);
        doc.restoreGraphicsState();
      } catch {
        /* fall through to the initials placeholder */
      }
    }
    if (!photoDataUrl) {
      doc.setFillColor("#e5e7eb");
      doc.circle(photoCx, photoCy, photoR, "F");
      doc.setTextColor(primary);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text(`${s.firstName[0] ?? ""}${s.lastName[0] ?? ""}`.toUpperCase(), photoCx, photoCy + 2.5, { align: "center" });
    }

    y = photoCy + photoR + 5;
    doc.setTextColor(INK);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    const nameLines = doc.splitTextToSize(`${s.firstName} ${s.lastName}`.toUpperCase(), CARD_W - 8);
    doc.text(nameLines, CARD_W / 2, y, { align: "center" });
    y += (nameLines.length - 1) * 4;

    y += 3;
    divider(y);

    y += 4;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(MUTED);
    doc.text(s.className ? `${s.className} · ${s.section}` : s.section, CARD_W / 2, y, { align: "center" });

    y += 4.5;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(primary);
    doc.text(`ID ${s.admissionNumber}`, CARD_W / 2, y, { align: "center" });

    // Flows right after the ID line rather than pinning to the card's bottom
    // edge — a fixed bottom offset collided with this text block on the
    // 85.6mm card once real spacing was checked against a rendered proof.
    y += 2.5;
    const qrSize = 12;
    doc.addImage(qrDataUrl, "PNG", CARD_W / 2 - qrSize / 2, y, qrSize, qrSize);

    // ---- Back ----
    doc.addPage([CARD_W, CARD_H], "portrait");
    let by = header();
    by += 4;
    doc.setTextColor(primary);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    const headingLines = doc.splitTextToSize("TERMS & CONDITIONS", CARD_W - 10);
    doc.text(headingLines, CARD_W / 2, by, { align: "center" });
    by += (headingLines.length - 1) * 4 + 3;
    divider(by);

    by += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.2);
    doc.setTextColor(INK);
    const lineH = 2.7;
    const p1 = doc.splitTextToSize("Carry this card at all times on school premises.", CARD_W - 10);
    doc.text(p1, CARD_W / 2, by, { align: "center" });
    by += p1.length * lineH + 3;

    const p2 = doc.splitTextToSize("If found, please return to the school address below.", CARD_W - 10);
    doc.text(p2, CARD_W / 2, by, { align: "center" });
    by += p2.length * lineH + 4;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(primary);
    doc.text(`ID ${s.admissionNumber}`, CARD_W / 2, by, { align: "center" });
    by += 2.5;
    const qrSize2 = 12;
    doc.addImage(qrDataUrl, "PNG", CARD_W / 2 - qrSize2 / 2, by, qrSize2, qrSize2);
    by += qrSize2 + 4;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.5);
    doc.setTextColor(MUTED);
    if (school.phone) {
      doc.text(school.phone, CARD_W / 2, by, { align: "center" });
      by += 2.8;
    }
    if (school.address) {
      const addr = doc.splitTextToSize(school.address, CARD_W - 10);
      doc.text(addr, CARD_W / 2, by, { align: "center" });
    }
  }

  doc.save(students.length === 1 ? `id-card-${students[0]!.admissionNumber}.pdf` : `id-cards-${new Date().toISOString().slice(0, 10)}.pdf`);
}
