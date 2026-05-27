import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { isR2, getR2PublicUrl, downloadFile, createDownloadUrl } from '@/lib/storage'

// ── Signed URL caches ────────────────────────────────────────────────────────
// Signed URLs are generated once and re-used until 1h before expiry.
// In-flight deduplication ensures concurrent cache-miss requests share one fetch.

const videoUrlCache = new Map<string, { url: string; expiresAt: number }>()
const VIDEO_TTL_S   = 7 * 24 * 3600
const VIDEO_TTL_MS  = (VIDEO_TTL_S - 3600) * 1000
const videoPending  = new Map<string, Promise<string>>()

// web_* and mid_* files are pre-processed WebPs — redirect via signed URL
const webUrlCache  = new Map<string, { url: string; expiresAt: number }>()
const WEB_TTL_S    = 86400
const WEB_TTL_MS   = (WEB_TTL_S - 3600) * 1000   // cache until 1h before expiry
const webPending   = new Map<string, Promise<string>>()

async function getSignedUrl(
  filename: string,
  ttlS: number,
  cache: Map<string, { url: string; expiresAt: number }>,
  pending: Map<string, Promise<string>>,
  ttlMs: number,
): Promise<string> {
  const hit = cache.get(filename)
  if (hit && hit.expiresAt > Date.now()) return hit.url

  const inflight = pending.get(filename)
  if (inflight) return inflight

  const promise = createDownloadUrl(filename, ttlS)
    .then((url) => {
      cache.set(filename, { url, expiresAt: Date.now() + ttlMs })
      pending.delete(filename)
      return url
    })
    .catch((err) => {
      pending.delete(filename)
      throw err
    })

  pending.set(filename, promise)
  return promise
}

// ── Processed image cache ─────────────────────────────────────────────────────
// Keyed by "filename:width:webp". On Vercel Fluid Compute, instances are reused
// across requests so this avoids re-downloading and re-processing images.
const imageCache    = new Map<string, { buffer: Buffer; contentType: string }>()
const IMAGE_CACHE_MAX = 300

function getCached(key: string) {
  return imageCache.get(key)
}

function setCached(key: string, value: { buffer: Buffer; contentType: string }) {
  if (imageCache.size >= IMAGE_CACHE_MAX) {
    imageCache.delete(imageCache.keys().next().value!)
  }
  imageCache.set(key, value)
}

const VIDEO_EXT = /\.(mp4|mov|webm|avi|m4v)$/i

// 7 days — filenames are content-addressed so cached responses are immutable
const IMAGE_CC = 'private, max-age=604800, immutable'
// Signed-URL redirect: 23h max-age + 30min SWR so browsers refresh before URL expires
const SIGNED_CC = 'private, max-age=82800, stale-while-revalidate=1800'

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
  const r2Public = getR2PublicUrl()
  if (isR2() && r2Public) {
    return NextResponse.redirect(`${r2Public}/${filename}`, {
      status: 302,
      headers: { 'Cache-Control': 'public, max-age=31536000, immutable' },
    })
  }

  // ── Pre-processed WebPs (web_* and mid_*) — signed URL redirect ────────
  if (filename.startsWith('web_') || filename.startsWith('mid_')) {
    let signedUrl: string
    try {
      signedUrl = await getSignedUrl(filename, WEB_TTL_S, webUrlCache, webPending, WEB_TTL_MS)
    } catch {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }
    return NextResponse.redirect(signedUrl, {
      status: 302,
      headers: { 'Cache-Control': SIGNED_CC },
    })
  }

  const isVideo = VIDEO_EXT.test(filename)

  // ── Videos ────────────────────────────────────────────────────────────
  if (isVideo) {
    let videoUrl: string
    try {
      videoUrl = await getSignedUrl(filename, VIDEO_TTL_S, videoUrlCache, videoPending, VIDEO_TTL_MS)
    } catch {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }
    return NextResponse.redirect(videoUrl, {
      status: 302,
      headers: { 'Cache-Control': 'private, max-age=604800' },
    })
  }

  // ── Images ────────────────────────────────────────────────────────────
  const { searchParams } = new URL(request.url)
  const reqWidth    = parseInt(searchParams.get('w') || '0') || undefined
  const acceptsWebP = (request.headers.get('accept') ?? '').includes('image/webp')
  const isHEIC      = /\.(heic|heif)$/i.test(filename)

  const needsProcessing = reqWidth != null || acceptsWebP || isHEIC

  const cacheKey = `${filename}:${reqWidth ?? ''}:${acceptsWebP ? 'webp' : 'orig'}`
  const hit = getCached(cacheKey)
  if (hit) {
    return new Response(new Uint8Array(hit.buffer), {
      headers: {
        'Content-Type': hit.contentType,
        'Content-Length': String(hit.buffer.byteLength),
        'Cache-Control': IMAGE_CC,
        'Vary': 'Accept',
      },
    })
  }

  let buffer: Buffer
  let contentType: string
  try {
    ;({ buffer, contentType } = await downloadFile(filename))
  } catch {
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }

  if (needsProcessing) {
    try {
      const sharp = (await import('sharp')).default
      let pipeline = sharp(buffer).rotate()
      if (reqWidth) pipeline = pipeline.resize(reqWidth, undefined, { withoutEnlargement: true })
      if (acceptsWebP) {
        buffer = await pipeline.webp({ quality: 80 }).toBuffer()
        contentType = 'image/webp'
      } else {
        buffer = await pipeline.jpeg({ quality: 85 }).toBuffer()
        contentType = 'image/jpeg'
      }
    } catch {
      // fall back to original bytes on sharp failure
    }
  }

  setCached(cacheKey, { buffer, contentType })

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(buffer.byteLength),
      'Cache-Control': IMAGE_CC,
      'Vary': 'Accept',
    },
  })
}
