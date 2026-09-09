// Builds a printable student ID card PDF (front + back per student) on the
// client, styled as a portrait badge — diagonal two-tone corner accents,
// circular photo, bold name block. Every visual aspect (size, colors, which
// fields show) is driven by IdCardConfig, set by the admin.

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

// The QR encodes a public verify link, not the bare token — scanned by any
// ordinary camera/QR app it opens a page confirming the student is a genuine,
// currently active enrollment (see app/verify/[token]). Scanned by DUGA's own
// in-app gate scanner, the same link is recognized and used for clock-in/out
// instead of being opened (see findStudentByCodeOrAdmission in security.ts).
function verifyUrl(token: string): string {
  const base = (process.env.NEXT_PUBLIC_PORTAL_URL || "").replace(/\/$/, "");
  return `${base}/verify/${token}`;
}

export type IdCardSize = "SMALL" | "STANDARD" | "LARGE";

export interface IdCardConfig {
  primary: string;
  accent: string;
  inkColor: string;
  mutedColor: string;
  showBackground: boolean;
  size: IdCardSize;
  showLogo: boolean;
  showClassSection: boolean;
  showAdmissionNumber: boolean;
  showDateOfBirth: boolean;
  showGender: boolean;
  showQrCode: boolean;
}

export const DEFAULT_ID_CARD_CONFIG: IdCardConfig = {
  primary: "#1e3a5f",
  accent: "#c8a448",
  inkColor: "#111827",
  mutedColor: "#6b7280",
  showBackground: true,
  size: "STANDARD",
  showLogo: true,
  // Off by default per school policy — a card doesn't need to disclose a
  // student's class/section on its face.
  showClassSection: false,
  showAdmissionNumber: true,
  showDateOfBirth: false,
  showGender: false,
  showQrCode: true,
};

// Base card is CR80 (54mm x 85.6mm), the standard ID-card/badge size that
// print shops and laminating pouches expect. SMALL/LARGE scale every
// dimension (card size, photo, fonts, QR) by the same factor so the
// carefully-tuned proportions hold at any size.
const SCALE: Record<IdCardSize, number> = { SMALL: 0.85, STANDARD: 1, LARGE: 1.2 };
const BASE_W = 54;
const BASE_H = 85.6;

export async function downloadIdCardsPdf(
  school: IdCardSchool,
  students: IdCardStudent[],
  config: IdCardConfig = DEFAULT_ID_CARD_CONFIG,
): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const QRCode = (await import("qrcode")).default;

  const scale = SCALE[config.size];
  const CARD_W = BASE_W * scale;
  const CARD_H = BASE_H * scale;
  const s = (n: number) => n * scale; // scale a mm/pt value

  const doc = new jsPDF({ unit: "mm", format: [CARD_W, CARD_H], orientation: "portrait" });
  const logoDataUrl = config.showLogo ? await toDataUrl(school.logoUrl) : null;
  const { primary, accent, inkColor, mutedColor } = config;

  // Subtle faceted-glass background — a handful of large, low-contrast
  // triangles layered behind the content, echoing the reference badge's
  // geometric texture without competing with the text on top of it.
  function backgroundTexture() {
    doc.setFillColor("#ffffff");
    doc.rect(0, 0, CARD_W, CARD_H, "F");
    if (!config.showBackground) return;
    const light1 = "#f4f5f7";
    const light2 = "#ececf0";
    doc.setFillColor(light1);
    doc.triangle(0, CARD_H * 0.34, CARD_W, CARD_H * 0.18, CARD_W, CARD_H * 0.52, "F");
    doc.setFillColor(light2);
    doc.triangle(0, CARD_H * 0.34, 0, CARD_H * 0.66, CARD_W * 0.58, CARD_H * 0.52, "F");
    doc.setFillColor(light1);
    doc.triangle(CARD_W * 0.58, CARD_H * 0.52, CARD_W, CARD_H * 0.52, CARD_W * 0.72, CARD_H * 0.86, "F");
    doc.setFillColor(light2);
    doc.triangle(0, CARD_H * 0.66, CARD_W * 0.42, CARD_H, 0, CARD_H, "F");
  }

  // Two-tone diagonal triangle in one corner — the accent color forms a thin
  // border peeking out from behind the primary-color triangle.
  function cornerTriangle(corner: "tl" | "br") {
    const big = s(20);
    const small = s(15.5);
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
  // narrow card — the full name still appears, in small print, wrapped and
  // measured dynamically so it can never overlap what follows it.
  function header() {
    backgroundTexture();
    cornerTriangle("tl");
    cornerTriangle("br");
    let y = s(6);
    if (logoDataUrl) {
      try {
        // jsPDF embeds images uncompressed by default, which can balloon a
        // batch of ID cards to tens of MB — "FAST" keeps a real photo/logo
        // file's size in the same ballpark in the output PDF.
        doc.addImage(logoDataUrl, imageFormat(logoDataUrl), CARD_W / 2 - s(4), y, s(8), s(8), undefined, "FAST");
        y += s(10);
      } catch {
        /* skip a logo image jsPDF can't decode rather than failing the card */
      }
    }
    doc.setTextColor(primary);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(s(10));
    doc.text((school.shortName || school.name).toUpperCase(), CARD_W / 2, y + s(3), { align: "center" });
    y += s(6.5);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(s(5.2));
    doc.setTextColor(mutedColor);
    const nameLines = doc.splitTextToSize(school.name, CARD_W - s(12));
    doc.text(nameLines, CARD_W / 2, y, { align: "center" });
    y += nameLines.length * s(2.3) + s(2);
    return y;
  }

  function divider(y: number) {
    doc.setDrawColor(primary);
    doc.setLineWidth(s(0.5));
    doc.line(CARD_W / 2 - s(9), y, CARD_W / 2 + s(9), y);
  }

  let first = true;
  for (const st of students) {
    const [photoDataUrl, qrDataUrl] = await Promise.all([
      toDataUrl(st.photoUrl),
      config.showQrCode ? QRCode.toDataURL(verifyUrl(st.code), { width: 240, margin: 1, color: { dark: primary } }) : Promise.resolve(null),
    ]);

    // ---- Front ----
    if (!first) doc.addPage([CARD_W, CARD_H], "portrait");
    first = false;

    let y = header();

    const photoR = s(10);
    const photoCx = CARD_W / 2;
    const photoCy = y + photoR + s(3);
    doc.setDrawColor(accent);
    doc.setLineWidth(s(1));
    doc.circle(photoCx, photoCy, photoR + s(1.4), "S");
    doc.setDrawColor(primary);
    doc.setLineWidth(s(0.6));
    doc.circle(photoCx, photoCy, photoR + s(0.6), "S");

    if (photoDataUrl) {
      try {
        doc.saveGraphicsState();
        doc.circle(photoCx, photoCy, photoR, null);
        doc.clip();
        doc.discardPath();
        doc.addImage(photoDataUrl, imageFormat(photoDataUrl), photoCx - photoR, photoCy - photoR, photoR * 2, photoR * 2, undefined, "FAST");
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
      doc.setFontSize(s(16));
      doc.text(`${st.firstName[0] ?? ""}${st.lastName[0] ?? ""}`.toUpperCase(), photoCx, photoCy + s(2.5), { align: "center" });
    }

    y = photoCy + photoR + s(5);
    doc.setTextColor(inkColor);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(s(10));
    const nameLines = doc.splitTextToSize(`${st.firstName} ${st.lastName}`.toUpperCase(), CARD_W - s(8));
    doc.text(nameLines, CARD_W / 2, y, { align: "center" });
    y += (nameLines.length - 1) * s(4);

    y += s(3);
    divider(y);
    y += s(4);

    if (config.showClassSection) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(s(7.5));
      doc.setTextColor(mutedColor);
      doc.text(st.className ? `${st.className} · ${st.section}` : st.section, CARD_W / 2, y, { align: "center" });
      y += s(4.5);
    }

    if (config.showDateOfBirth && st.dateOfBirth) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(s(6.2));
      doc.setTextColor(mutedColor);
      doc.text(`DOB ${new Date(st.dateOfBirth).toLocaleDateString()}`, CARD_W / 2, y, { align: "center" });
      y += s(4);
    }

    if (config.showGender && st.gender) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(s(6.2));
      doc.setTextColor(mutedColor);
      doc.text(st.gender, CARD_W / 2, y, { align: "center" });
      y += s(4);
    }

    if (config.showAdmissionNumber) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(s(6.8));
      doc.setTextColor(primary);
      doc.text(`ID ${st.admissionNumber}`, CARD_W / 2, y, { align: "center" });
      y += s(2.5);
    }

    if (config.showQrCode && qrDataUrl) {
      const qrSize = s(12);
      doc.addImage(qrDataUrl, "PNG", CARD_W / 2 - qrSize / 2, y, qrSize, qrSize);
    }

    // ---- Back ----
    doc.addPage([CARD_W, CARD_H], "portrait");
    let by = header();
    by += s(4);
    doc.setTextColor(primary);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(s(9));
    const headingLines = doc.splitTextToSize("TERMS & CONDITIONS", CARD_W - s(10));
    doc.text(headingLines, CARD_W / 2, by, { align: "center" });
    by += (headingLines.length - 1) * s(4) + s(3);
    divider(by);

    by += s(5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(s(6.2));
    doc.setTextColor(inkColor);
    const lineH = s(2.7);
    const p1 = doc.splitTextToSize("Carry this card at all times on school premises.", CARD_W - s(10));
    doc.text(p1, CARD_W / 2, by, { align: "center" });
    by += p1.length * lineH + s(3);

    const p2 = doc.splitTextToSize("If found, please return to the school address below.", CARD_W - s(10));
    doc.text(p2, CARD_W / 2, by, { align: "center" });
    by += p2.length * lineH + s(4);

    if (config.showAdmissionNumber) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(s(6.5));
      doc.setTextColor(primary);
      doc.text(`ID ${st.admissionNumber}`, CARD_W / 2, by, { align: "center" });
      by += s(2.5);
    }
    if (config.showQrCode && qrDataUrl) {
      const qrSize2 = s(12);
      doc.addImage(qrDataUrl, "PNG", CARD_W / 2 - qrSize2 / 2, by, qrSize2, qrSize2);
      by += qrSize2 + s(4);
    }

    doc.setFont("helvetica", "normal");
    doc.setFontSize(s(5.5));
    doc.setTextColor(mutedColor);
    if (school.phone) {
      doc.text(school.phone, CARD_W / 2, by, { align: "center" });
      by += s(2.8);
    }
    if (school.address) {
      const addr = doc.splitTextToSize(school.address, CARD_W - s(10));
      doc.text(addr, CARD_W / 2, by, { align: "center" });
    }
  }

  doc.save(students.length === 1 ? `id-card-${students[0]!.admissionNumber}.pdf` : `id-cards-${new Date().toISOString().slice(0, 10)}.pdf`);
}
