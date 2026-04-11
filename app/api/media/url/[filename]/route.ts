import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { isR2, getR2PublicUrl, downloadFile, createDownloadUrl } from '@/lib/storage'

// Cache signed/presigned download URLs for video redirects.
// Reset on cold start — fine for Vercel warm instances.
const videoUrlCache = new Map<string, { url: string; expiresAt: number }>()
const VIDEO_TTL_S   = 7 * 24 * 3600               // 7 days
const VIDEO_TTL_MS  = (VIDEO_TTL_S - 3600) * 1000 // cache until 1h before expiry

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

  // ── R2 with public CDN domain ──────────────────────────────────────────
  // Best case: redirect straight to the CDN URL — bytes never touch Vercel.
  // Works for both images (proxied below otherwise) and videos (Range requests
  // are handled natively by the CDN). URL is permanent so cache for 1 year.
  const r2Public = getR2PublicUrl()
  if (isR2() && r2Public) {
    return NextResponse.redirect(`${r2Public}/${filename}`, {
      status: 302,
      headers: { 'Cache-Control': 'private, max-age=31536000' },
    })
  }

  const isVideo = VIDEO_EXT.test(filename)

  // ── Videos (R2 private or Supabase) ───────────────────────────────────
  // Redirect to a presigned/signed URL so the browser can send Range requests
  // for seeking. Use a 7-day TTL so the browser redirect cache stays valid for
  // a week — one download per video per user per week.
  if (isVideo) {
    const cached = videoUrlCache.get(filename)
    let videoUrl: string
    if (cached && cached.expiresAt > Date.now()) {
      videoUrl = cached.url
    } else {
      try {
        videoUrl = await createDownloadUrl(filename, VIDEO_TTL_S)
      } catch {
        return NextResponse.json({ error: 'File not found' }, { status: 404 })
      }
      videoUrlCache.set(filename, { url: videoUrl, expiresAt: Date.now() + VIDEO_TTL_MS })
    }
    return NextResponse.redirect(videoUrl, {
      status: 302,
      headers: { 'Cache-Control': 'private, max-age=604800' },
    })
  }

  // ── Images (R2 private or Supabase) ───────────────────────────────────
  // Proxy bytes so the browser can cache at the stable /api/media/url/{filename}
  // URL for 24 h. Redirecting to a signed URL breaks caching because the token
  // changes on every cache miss — the browser would re-download every image every
  // 50 min. Proxying here costs Vercel bandwidth on first load but eliminates
  // repeated storage egress.
  let buffer: Buffer
  let contentType: string
  try {
    ;({ buffer, contentType } = await downloadFile(filename))
  } catch {
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(buffer.byteLength),
      'Cache-Control': 'private, max-age=86400',
    },
  })
}
