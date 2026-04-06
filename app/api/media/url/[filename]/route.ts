import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  // Require authentication
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { filename } = await params

  // Validate filename — no path traversal
  if (!filename || filename.includes('/') || filename.includes('..')) {
    return NextResponse.json({ error: 'Invalid filename' }, { status: 400 })
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Storage not configured' }, { status: 500 })
  }

  const { createClient } = await import('@supabase/supabase-js')
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  const { data, error } = await supabase.storage
    .from('media')
    .createSignedUrl(filename, 3600) // 1-hour expiry

  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }

  // Redirect to Supabase signed URL — image bytes flow Supabase→browser directly,
  // never through Vercel. Safe for <img src> and <video src>; avoids origin transfer cost.
  // Browser caches the redirect itself for 1 hour (matching the signed URL expiry).
  return NextResponse.redirect(data.signedUrl, {
    status: 302,
    headers: {
      'Cache-Control': 'private, max-age=3600',
    },
  })
}
