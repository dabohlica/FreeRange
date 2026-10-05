import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isR2 } from '@/lib/storage'

/** Non-secret S3 settings to prefill the export form. */
function storageDefaults() {
  if (isR2()) {
    return {
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      bucket: process.env.R2_BUCKET_NAME ?? '',
      region: 'auto',
    }
  }
  if (process.env.SUPABASE_URL) {
    return {
      endpoint: `${process.env.SUPABASE_URL.replace(/\/$/, '')}/storage/v1/s3`,
      bucket: 'media',
      region: '',
    }
  }
  return { endpoint: '', bucket: '', region: '' }
}

/**
 * GET /api/admin/export → S3 prefill settings plus the storage keys of the
 * original uploads. The bucket also holds generated copies (thumb_/mid_/web_
 * variants and video poster frames), which the export skips. The download
 * itself runs in the browser against the bucket's S3 API, so no file bytes
 * pass through this server.
 */
export async function GET() {
  const session = await getSession()
  if (session?.role !== 'admin') {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const media = await prisma.media.findMany({ select: { filename: true, type: true } })

  return NextResponse.json({
    ...storageDefaults(),
    originals: media.map((m) => ({ key: m.filename, type: m.type })),
  })
}
