import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { requireSession, ForbiddenError, checkRateLimit } from "@duga/core/server";
import { assertPermission } from "@duga/core";
import { prisma } from "@duga/core/server";
import { uploadPublicFile } from "@/lib/server/storage";

const LIBRARY_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "application/epub+zip": "epub",
  "application/x-mobipocket-ebook": "mobi",
  "application/x-ibooks+zip": "epub",
  "application/vnd.amazon.ebook": "mobi",
};

// A teacher attaching an already-written lesson document (rather than
// typing one in the editor, or having the AI draft one) — PDF or Word,
// not the ebook formats library uploads accept.
const LESSON_DOC_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

function ext(mime: string, purpose: string): string {
  if (purpose === "library" || purpose === "scheme" || purpose === "textbook") {
    return LIBRARY_TYPES[mime] ?? "pdf";
  }
  if (purpose === "lesson-doc" || purpose === "family-corner-doc") {
    return LESSON_DOC_TYPES[mime] ?? "pdf";
  }
  return IMAGE_TYPES[mime] ?? "jpg";
}

// The browser-supplied `file.type` is attacker-controlled — a request can
// claim any Content-Type regardless of the actual bytes. JPEG/PNG/WebP are
// separately verified by actually decoding them (see storage.ts's
// compressIfImage, which now rejects rather than silently storing an
// unverified buffer on failure); everything else that isn't run through an
// image decoder is checked here against its real file signature before
// it's trusted and stored under the claimed type.
function matchesSignature(mime: string, buffer: Buffer): boolean {
  const startsWith = (bytes: number[]) => bytes.every((b, i) => buffer[i] === b);
  switch (mime) {
    case "image/gif":
      return startsWith([0x47, 0x49, 0x46, 0x38]); // "GIF8"
    case "application/pdf":
      return startsWith([0x25, 0x50, 0x44, 0x46]); // "%PDF"
    case "application/msword":
      // Legacy OLE Compound File header — also covers old .xls/.ppt, but
      // this mime is only ever reached for the "doc" purpose already.
      return startsWith([0xd0, 0xcf, 0x11, 0xe0]);
    // .docx, .epub and the .ibooks variant are all ZIP containers — real
    // internal-structure disambiguation isn't worth it here, the signature
    // check exists to block "this isn't even a zip file", not to fully
    // parse the format.
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    case "application/epub+zip":
    case "application/x-ibooks+zip":
      return startsWith([0x50, 0x4b, 0x03, 0x04]) || startsWith([0x50, 0x4b, 0x05, 0x06]);
    default:
      // image/jpeg, image/png, image/webp go through sharp decoding
      // instead (a stronger check than a signature match); anything else
      // (e.g. mobi) has no cheap, reliable signature to check — allowed
      // through unchanged rather than a false sense of security from a
      // partial check.
      return true;
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    const rl = checkRateLimit(`upload:${session.user.id}`, 20, 5 * 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { ok: false, error: "Too many uploads. Please wait a few minutes and try again." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } },
      );
    }
    const stateUrl = new URL(request.url);
    const purpose = stateUrl.searchParams.get("purpose") ?? "gallery";

    if (purpose === "library" || purpose === "scheme") {
      assertPermission(session.user.role, purpose === "scheme" ? "settings:manage" : "library:manage");
    } else if (purpose === "textbook") {
      assertPermission(session.user.role, "curriculum:manage");
    } else if (purpose === "student-photo") {
      assertPermission(session.user.role, "students:manage");
    } else if (purpose === "school-logo") {
      assertPermission(session.user.role, "settings:manage");
    } else if (purpose === "avatar") {
      // Students keep the photo the school (admin) assigns them — everyone
      // else, including parents, may set their own profile picture.
      if (session.user.role === "STUDENT") {
        throw new ForbiddenError("Students cannot change their profile photo");
      }
    } else if (purpose === "signature") {
      // Self-service: a teacher uploads their own signature (auto-attached
      // to every report card for their class), an admin/owner uploads the
      // one used as the school's Principal signatory — see profile.ts.
      if (!["TEACHER", "ADMIN", "OWNER"].includes(session.user.role)) {
        throw new ForbiddenError("Only teachers and admins can upload a signature");
      }
    } else if (purpose === "clock-photo") {
      assertPermission(session.user.role, "staff:clock");
    } else if (purpose === "paper-exam") {
      // Any signed-in student (uploading their own script) or staff member
      // (submitting on a student's behalf) may upload — paperExam.ts's own
      // actions gate who can grade/approve what happens with it next.
    } else if (purpose === "lesson-note" || purpose === "lesson-doc") {
      // A teacher inserting an image into their lesson content, or
      // attaching an already-written PDF/Word document as the note itself
      // — was wrongly gated behind gallery:manage (website-gallery,
      // admin/owner only), so every teacher upload in the lesson-note
      // editor failed with a permission error.
      assertPermission(session.user.role, "learning:manage");
    } else if (purpose === "family-corner-doc") {
      assertPermission(session.user.role, "familyCorner:manage");
    } else {
      assertPermission(session.user.role, "gallery:manage");
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "No file uploaded" }, { status: 400 });
    }
    const isLibraryDoc = purpose === "library" || purpose === "scheme" || purpose === "textbook";
    // Same PDF/Word type set as a lesson-doc attachment — used for both a
    // lesson note's attached document and a Family Corner post's.
    const isPdfDoc = purpose === "lesson-doc" || purpose === "family-corner-doc";
    const isDocument = isLibraryDoc || isPdfDoc;
    const mime = file.type || (isDocument ? "application/pdf" : "image/jpeg");
    const allowed = isLibraryDoc ? LIBRARY_TYPES : isPdfDoc ? LESSON_DOC_TYPES : IMAGE_TYPES;
    if (!allowed[mime]) {
      const hint = isLibraryDoc ? "Only PDF, EPUB and MOBI files are allowed" : isPdfDoc ? "Only PDF and Word (.doc/.docx) files are allowed" : "Only JPG, PNG, WebP and GIF images are allowed";
      return NextResponse.json({ ok: false, error: hint }, { status: 400 });
    }
    // Clock photos are a client-compressed snapshot meant to stay tiny (a few
    // tens of KB) — a much lower cap than a normal image upload catches a
    // compression failure instead of silently storing a full-size photo.
    const maxBytes = isDocument ? 64 * 1024 * 1024 : purpose === "clock-photo" ? 512 * 1024 : 8 * 1024 * 1024;
    if (file.size > maxBytes) {
      const label = isDocument ? "64MB" : purpose === "clock-photo" ? "512KB" : "8MB";
      return NextResponse.json({ ok: false, error: `File must be under ${label}` }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (!matchesSignature(mime, buffer)) {
      return NextResponse.json({ ok: false, error: "This file's contents don't match its claimed type." }, { status: 400 });
    }
    const name = `${crypto.randomUUID()}.${ext(mime, purpose)}`;
    const folder = purpose === "library" ? "library" : purpose === "scheme" ? "scheme" : purpose === "textbook" ? "textbooks" : purpose === "lesson-doc" ? "lesson-docs" : purpose === "family-corner-doc" ? "family-corner-docs" : purpose === "paper-exam" ? "paper-exams" : purpose === "avatar" ? "avatars" : purpose === "student-photo" ? "students" : purpose === "school-logo" ? "school" : purpose === "clock-photo" ? "clock" : purpose === "signature" ? "signatures" : "gallery";
    const { url: fileUrl, key, bucket } = await uploadPublicFile({
      folder,
      name,
      mime,
      buffer,
    });

    const upload = await prisma.fileUpload.create({
      data: {
        schoolId: session.user.schoolId,
        uploadedByUserId: session.user.id,
        bucket,
        key,
        url: fileUrl,
        mime,
        size: file.size,
        purpose,
      },
    });

    return NextResponse.json({ ok: true, data: { url: fileUrl, id: upload.id, key, size: file.size, mime } });
  } catch (e) {
    const err = e as Error & { status?: number };
    const status = err.status ?? (err.name === "ForbiddenError" ? 403 : 500);
    if (status >= 500) console.error("upload error:", err);
    return NextResponse.json({ ok: false, error: err.message || "Upload failed" }, { status });
  }
}