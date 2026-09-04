import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { S3Client, PutObjectCommand, DeleteObjectCommand, HeadBucketCommand, CreateBucketCommand } from "@aws-sdk/client-s3";

const BUCKET = "duga-assets";

// Cloudflare R2 is the primary target (10GB free, zero egress) — used
// whenever its env vars are configured. Falls back to Supabase Storage (the
// original provider, 1GB free) so uploads keep working unchanged until R2
// credentials are added; nothing about existing files or URLs is touched.
function r2Configured(): boolean {
  return !!(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET && process.env.R2_PUBLIC_URL);
}

// ---------------------------------------------------------------------------
// Cloudflare R2 (S3-compatible)
// ---------------------------------------------------------------------------

let _r2: S3Client | null = null;
let _r2BucketEnsured = false;

function r2Client(): S3Client {
  if (!_r2) {
    _r2 = new S3Client({
      region: "auto",
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    });
  }
  return _r2;
}

async function ensureR2Bucket(): Promise<void> {
  if (_r2BucketEnsured) return;
  const client = r2Client();
  const bucket = process.env.R2_BUCKET!;
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch {
    await client.send(new CreateBucketCommand({ Bucket: bucket })).catch(() => undefined);
  }
  _r2BucketEnsured = true;
}

async function uploadToR2(opts: { folder: string; name: string; mime: string; buffer: Buffer }): Promise<{ url: string; key: string; bucket: string }> {
  await ensureR2Bucket();
  const bucket = process.env.R2_BUCKET!;
  const key = `${opts.folder}/${opts.name}`;
  await r2Client().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: opts.buffer,
      ContentType: opts.mime,
    }),
  );
  const base = process.env.R2_PUBLIC_URL!.replace(/\/$/, "");
  return { url: `${base}/${key}`, key, bucket };
}

async function removeFromR2(key: string): Promise<void> {
  await r2Client().send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET!, Key: key }));
}

// ---------------------------------------------------------------------------
// Supabase Storage (fallback / legacy)
// ---------------------------------------------------------------------------

let _admin: SupabaseClient | null = null;

function supabaseAdmin(): SupabaseClient {
  if (!_admin) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      const err = new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for uploads") as Error & { status?: number };
      err.status = 500;
      throw err;
    }
    _admin = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _admin;
}

async function ensureSupabaseBucket(): Promise<void> {
  const sb = supabaseAdmin();
  const { data, error } = await sb.storage.getBucket(BUCKET);
  if (error || !data) {
    const created = await sb.storage.createBucket(BUCKET, { public: true, fileSizeLimit: 64 * 1024 * 1024 });
    // Some Storage backends reject a fileSizeLimit at creation time; retry with
    // the bare minimum so the bucket still gets created.
    if (created.error) {
      await sb.storage.createBucket(BUCKET, { public: true });
    }
    return;
  }
  const current = typeof data.file_size_limit === "number" ? data.file_size_limit : 0;
  if (current > 0 && current < 64 * 1024 * 1024) {
    await sb.storage.updateBucket(BUCKET, { public: true, fileSizeLimit: 64 * 1024 * 1024 });
  }
}

async function uploadToSupabase(opts: { folder: string; name: string; mime: string; buffer: Buffer }): Promise<{ url: string; key: string; bucket: string }> {
  const sb = supabaseAdmin();
  await ensureSupabaseBucket();
  const key = `${opts.folder}/${opts.name}`;
  const { error } = await sb.storage.from(BUCKET).upload(key, opts.buffer, {
    contentType: opts.mime,
    upsert: false,
  });
  if (error) {
    const err = new Error(`Storage upload failed: ${error.message}`) as Error & { status?: number };
    err.status = 500;
    throw err;
  }
  const { data } = sb.storage.from(BUCKET).getPublicUrl(key);
  return { url: data.publicUrl, key, bucket: BUCKET };
}

async function removeFromSupabase(key: string): Promise<void> {
  const sb = supabaseAdmin();
  const { error } = await sb.storage.from(BUCKET).remove([key]);
  if (error) {
    const err = new Error(`Storage delete failed: ${error.message}`) as Error & { status?: number };
    err.status = 500;
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Public API — unchanged signatures, callers don't need to know the provider.
// ---------------------------------------------------------------------------

const COMPRESSIBLE_IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * Resize/re-encode photos to WebP at upload time to keep storage and
 * bandwidth down. Leaves non-image files (PDFs, EPUBs, etc.) untouched.
 */
async function compressIfImage(mime: string, buffer: Buffer): Promise<{ mime: string; buffer: Buffer }> {
  if (!COMPRESSIBLE_IMAGE_MIME.has(mime)) return { mime, buffer };
  try {
    const sharp = (await import("sharp")).default;
    const out = await sharp(buffer)
      .rotate()
      .resize({ width: 1920, height: 1920, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
    return { mime: "image/webp", buffer: out };
  } catch {
    // If compression fails for any reason (corrupt image, unsupported
    // variant), fall back to storing the original rather than failing the
    // upload outright.
    return { mime, buffer };
  }
}

function extForMime(mime: string, fallbackName: string): string {
  if (mime === "image/webp") return fallbackName.replace(/\.[^.]+$/, ".webp");
  return fallbackName;
}

export async function uploadPublicFile(opts: {
  folder: string;
  name: string;
  mime: string;
  buffer: Buffer;
}): Promise<{ url: string; key: string; bucket: string }> {
  const { mime, buffer } = await compressIfImage(opts.mime, opts.buffer);
  const name = extForMime(mime, opts.name);
  const input = { folder: opts.folder, name, mime, buffer };
  return r2Configured() ? uploadToR2(input) : uploadToSupabase(input);
}

export async function removeFile(key: string): Promise<void> {
  return r2Configured() ? removeFromR2(key) : removeFromSupabase(key);
}
