import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "duga-assets";

let _admin: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
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

export async function ensureBucket(): Promise<void> {
  const sb = supabaseAdmin();
  const { data, error } = await sb.storage.getBucket(BUCKET);
  if (error || !data) {
    await sb.storage.createBucket(BUCKET, { public: true, fileSizeLimit: 8 * 1024 * 1024 });
  }
}

export async function uploadPublicFile(opts: {
  folder: string;
  name: string;
  mime: string;
  buffer: Buffer;
}): Promise<{ url: string; key: string; bucket: string }> {
  const sb = supabaseAdmin();
  await ensureBucket();
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

export async function removeFile(key: string): Promise<void> {
  const sb = supabaseAdmin();
  const { error } = await sb.storage.from(BUCKET).remove([key]);
  if (error) {
    const err = new Error(`Storage delete failed: ${error.message}`) as Error & { status?: number };
    err.status = 500;
    throw err;
  }
}
