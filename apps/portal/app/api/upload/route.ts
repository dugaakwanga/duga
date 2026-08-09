import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { requireSession } from "@duga/core/server";
import { assertPermission } from "@duga/core";
import { prisma } from "@duga/core/server";
import { uploadPublicFile } from "@/lib/server/storage";

const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_BYTES = 8 * 1024 * 1024;

function ext(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  return "jpg";
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    assertPermission(session.user.role, "gallery:manage");

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "No file uploaded" }, { status: 400 });
    }
    const mime = file.type || "image/jpeg";
    if (!ALLOWED.includes(mime)) {
      return NextResponse.json({ ok: false, error: "Only JPG, PNG, WebP and GIF images are allowed" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ ok: false, error: "Image must be under 8MB" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const name = `${crypto.randomUUID()}.${ext(mime)}`;
    const { url, key, bucket } = await uploadPublicFile({
      folder: "gallery",
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
        url,
        mime,
        size: file.size,
        purpose: "gallery",
      },
    });

    return NextResponse.json({ ok: true, data: { url, id: upload.id } });
  } catch (e) {
    const err = e as Error & { status?: number };
    const status = err.status ?? (err.name === "ForbiddenError" ? 403 : 500);
    if (status >= 500) console.error("upload error:", err);
    return NextResponse.json({ ok: false, error: err.message || "Upload failed" }, { status });
  }
}
