import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'

// Cache signed URLs for internal proxying — reduces createSignedUrl API calls
// for concurrent requests on the same warm Vercel instance.
const urlCache = new Map<string, { signedUrl: string; expiresAt: number }>()
const CACHE_TTL_MS = 50 * 60 * 1000

const VIDEO_EXT = /\.(mp4|mov|webm|avi|m4v)$/i

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { filename } = await params

  if (!filename || filename.includes('/') || filename.includes('..')) {
    return NextResponse.json({ error: 'Invalid filename' }, { status: 400 })
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Storage not configured' }, { status: 500 })
  }

  // Get or generate a signed URL (used server-side only for proxying)
  let signedUrl: string
  const cached = urlCache.get(filename)
  if (cached && cached.expiresAt > Date.now()) {
    signedUrl = cached.signedUrl
  } else {
    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )
    const { data, error } = await supabase.storage
      .from('media')
      .createSignedUrl(filename, 3600)

    if (error || !data?.signedUrl) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }

    signedUrl = data.signedUrl
    urlCache.set(filename, { signedUrl, expiresAt: Date.now() + CACHE_TTL_MS })
  }

  // Videos: redirect so the browser can send Range requests for seeking.
  // Short cache is fine — video files don't change after upload.
  if (VIDEO_EXT.test(filename)) {
    return NextResponse.redirect(signedUrl, {
      status: 302,
      headers: { 'Cache-Control': 'private, max-age=3000' },
    })
  }

  // Images: proxy bytes so the browser caches at the stable /api/media/url/{filename} URL.
  //
  // Redirecting to a signed URL is broken for caching: signed URL tokens change every
  // 50 min, so the browser treats each new token as a fresh resource and re-fetches all
  // image bytes from Supabase on every cache miss — regardless of Cache-Control on the
  // redirect. Proxying here routes bytes through Vercel on the first load, but the
  // 24 h browser cache means Supabase egress drops from "every 50 min per user" to
  // "once per day per user".
  const upstream = await fetch(signedUrl)
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: 'Failed to fetch file' }, { status: 502 })
  }

  const headers: HeadersInit = { 'Cache-Control': 'private, max-age=86400' }
  const ct = upstream.headers.get('Content-Type')
  if (ct) headers['Content-Type'] = ct
  const cl = upstream.headers.get('Content-Length')
  if (cl) headers['Content-Length'] = cl

  return new Response(upstream.body, { headers })
}
