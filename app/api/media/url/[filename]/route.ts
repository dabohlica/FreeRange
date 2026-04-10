import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'

// Module-level cache: filename → { signedUrl, expiresAt }
// Signed URLs are valid 1 hour; cache for 50 min to avoid serving stale URLs near expiry.
// Resets on cold start (fine for Vercel — warm instances reuse it across requests).
const urlCache = new Map<string, { signedUrl: string; expiresAt: number }>()
const CACHE_TTL_MS = 50 * 60 * 1000 // 50 minutes

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

  // Return cached signed URL if still valid — avoids a Supabase API call per image
  const cached = urlCache.get(filename)
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.redirect(cached.signedUrl, {
      status: 302,
      headers: { 'Cache-Control': 'private, max-age=3000' },
    })
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

  urlCache.set(filename, { signedUrl: data.signedUrl, expiresAt: Date.now() + CACHE_TTL_MS })

  // Redirect to Supabase signed URL — image bytes flow Supabase→browser directly,
  // never through Vercel. Safe for <img src> and <video src>; avoids origin transfer cost.
  return NextResponse.redirect(data.signedUrl, {
    status: 302,
    headers: { 'Cache-Control': 'private, max-age=3000' },
  })
}
