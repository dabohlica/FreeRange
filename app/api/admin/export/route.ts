import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { isR2 } from '@/lib/storage'

/**
 * GET /api/admin/export → non-secret S3 settings to prefill the export form.
 * The download itself runs in the browser against the bucket's S3 API,
 * so no file bytes pass through this server.
 */
export async function GET() {
  const session = await getSession()
  if (session?.role !== 'admin') {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  if (isR2()) {
    return NextResponse.json({
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      bucket: process.env.R2_BUCKET_NAME,
      region: 'auto',
    })
  }
  if (process.env.SUPABASE_URL) {
    return NextResponse.json({
      endpoint: `${process.env.SUPABASE_URL.replace(/\/$/, '')}/storage/v1/s3`,
      bucket: 'media',
      region: '',
    })
  }
  return NextResponse.json({ endpoint: '', bucket: '', region: '' })
}
