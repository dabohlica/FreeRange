import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'

// Separate caches for images and videos — different signed URL TTLs.
// Images are proxied (signed URL used server-side only, short TTL is fine).
// Videos are redirected; browser caches the redirect, so the signed URL must
// stay stable for as long as the browser keeps the redirect cached.
const imageUrlCache = new Map<string, { signedUrl: string; expiresAt: number }>()
const videoUrlCache = new Map<string, { signedUrl: string; expiresAt: number }>()

const IMAGE_SIGNED_TTL_S  = 3600              // 1 h — only used server-side
const IMAGE_CACHE_TTL_MS  = 50 * 60 * 1000   // 50 min

const VIDEO_SIGNED_TTL_S  = 7 * 24 * 3600    // 7 days — browser keeps redirect this long
const VIDEO_CACHE_TTL_MS  = 6.5 * 24 * 60 * 60 * 1000  // 6.5 days

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

  const isVideo = VIDEO_EXT.test(filename)
  const cache      = isVideo ? videoUrlCache  : imageUrlCache
  const signedTtl  = isVideo ? VIDEO_SIGNED_TTL_S : IMAGE_SIGNED_TTL_S
  const cacheTtl   = isVideo ? VIDEO_CACHE_TTL_MS : IMAGE_CACHE_TTL_MS

  // Get or generate a signed URL
  let signedUrl: string
  const cached = cache.get(filename)
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
      .createSignedUrl(filename, signedTtl)

    if (error || !data?.signedUrl) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }

    signedUrl = data.signedUrl
    cache.set(filename, { signedUrl, expiresAt: Date.now() + cacheTtl })
  }

  // Videos: redirect so the browser can send Range requests for seeking.
  // 7-day signed URL + matching Cache-Control keeps the browser pointing at the same
  // token for a week — no re-download until the token actually expires.
  if (isVideo) {
    return NextResponse.redirect(signedUrl, {
      status: 302,
      headers: { 'Cache-Control': 'private, max-age=604800' },
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
