/**
 * Storage abstraction — routes to Cloudflare R2 or Supabase Storage based on env vars.
 *
 * R2 is used when R2_ACCOUNT_ID + R2_ACCESS_KEY_ID + R2_SECRET_ACCESS_KEY + R2_BUCKET_NAME
 * are all set. Otherwise falls back to Supabase.
 *
 * Optional R2_PUBLIC_URL: if the R2 bucket has a public custom domain configured, the media
 * proxy redirects directly to it — image bytes never touch Vercel.
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

// ── Configuration detection ───────────────────────────────────────────────

export function isR2(): boolean {
  return !!(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET_NAME
  )
}

/** Public CDN domain for the R2 bucket, e.g. "https://media.yourdomain.com". */
export function getR2PublicUrl(): string | null {
  return process.env.R2_PUBLIC_URL?.replace(/\/$/, '') ?? null
}

function r2Client(): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  })
}

// ── Core operations ───────────────────────────────────────────────────────

export async function uploadFile(
  buffer: Buffer,
  filename: string,
  contentType: string,
): Promise<void> {
  if (isR2()) {
    await r2Client().send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME!,
        Key: filename,
        Body: buffer,
        ContentType: contentType,
      }),
    )
    return
  }

  const { createClient } = await import('@supabase/supabase-js')
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const { error } = await supabase.storage
    .from('media')
    .upload(filename, buffer, { contentType, upsert: true })
  if (error) throw new Error(`Storage upload failed: ${error.message}`)
}

export async function downloadFile(
  filename: string,
): Promise<{ buffer: Buffer; contentType: string }> {
  if (isR2()) {
    const res = await r2Client().send(
      new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME!, Key: filename }),
    )
    if (!res.Body) throw new Error(`File not found in R2: ${filename}`)
    const bytes = await res.Body.transformToByteArray()
    return { buffer: Buffer.from(bytes), contentType: res.ContentType ?? 'application/octet-stream' }
  }

  const { createClient } = await import('@supabase/supabase-js')
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const { data, error } = await supabase.storage.from('media').download(filename)
  if (error || !data) throw new Error(`Storage download failed: ${error?.message}`)
  return { buffer: Buffer.from(await data.arrayBuffer()), contentType: data.type ?? 'application/octet-stream' }
}

export async function deleteFile(filename: string): Promise<void> {
  if (isR2()) {
    await r2Client().send(
      new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_NAME!, Key: filename }),
    )
    return
  }

  const { createClient } = await import('@supabase/supabase-js')
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  await supabase.storage.from('media').remove([filename])
}

/**
 * Returns a short-lived presigned URL for direct browser → storage upload.
 * The caller returns this as `signedUrl` so AdminClient.tsx can PUT to it unchanged.
 */
export async function createUploadUrl(storedFilename: string): Promise<string> {
  if (isR2()) {
    return getSignedUrl(
      r2Client(),
      new PutObjectCommand({ Bucket: process.env.R2_BUCKET_NAME!, Key: storedFilename }),
      { expiresIn: 3600 },
    )
  }

  const { createClient } = await import('@supabase/supabase-js')
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const { data, error } = await supabase.storage
    .from('media')
    .createSignedUploadUrl(storedFilename)
  if (error || !data) throw new Error(error?.message ?? 'Failed to create upload URL')
  return data.signedUrl
}

/**
 * Returns a presigned/signed download URL for redirect-based serving (videos).
 * TTL should match the Cache-Control max-age returned to the browser.
 */
export async function createDownloadUrl(filename: string, ttlSeconds: number): Promise<string> {
  if (isR2()) {
    return getSignedUrl(
      r2Client(),
      new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME!, Key: filename }),
      { expiresIn: ttlSeconds },
    )
  }

  const { createClient } = await import('@supabase/supabase-js')
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const { data, error } = await supabase.storage
    .from('media')
    .createSignedUrl(filename, ttlSeconds)
  if (error || !data?.signedUrl) throw new Error(error?.message ?? 'Failed to create download URL')
  return data.signedUrl
}
