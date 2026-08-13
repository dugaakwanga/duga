import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { requireSession } from "@duga/core/server";
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

const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

function ext(mime: string, purpose: string): string {
  if (purpose === "library") {
    return LIBRARY_TYPES[mime] ?? "pdf";
  }
  return IMAGE_TYPES[mime] ?? "jpg";
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    const stateUrl = new URL(request.url);
    const purpose = stateUrl.searchParams.get("purpose") ?? "gallery";

    if (purpose === "library") {
      assertPermission(session.user.role, "library:manage");
    } else if (purpose === "student-photo") {
      assertPermission(session.user.role, "students:manage");
    } else if (purpose !== "avatar") {
      // "avatar" is allowed for any signed-in user (their own profile picture).
      assertPermission(session.user.role, "gallery:manage");
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "No file uploaded" }, { status: 400 });
    }
    const mime = file.type || (purpose === "library" ? "application/pdf" : "image/jpeg");
    const allowed = purpose === "library" ? LIBRARY_TYPES : IMAGE_TYPES;
    if (!allowed[mime]) {
      const hint = purpose === "library" ? "Only PDF, EPUB and MOBI files are allowed" : "Only JPG, PNG, WebP and GIF images are allowed";
      return NextResponse.json({ ok: false, error: hint }, { status: 400 });
    }
    const maxBytes = purpose === "library" ? 64 * 1024 * 1024 : 8 * 1024 * 1024;
    if (file.size > maxBytes) {
      const label = purpose === "library" ? "64MB" : "8MB";
      return NextResponse.json({ ok: false, error: `File must be under ${label}` }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const name = `${crypto.randomUUID()}.${ext(mime, purpose)}`;
    const folder = purpose === "library" ? "library" : purpose === "avatar" ? "avatars" : purpose === "student-photo" ? "students" : "gallery";
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