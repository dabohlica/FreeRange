import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { isR2, getR2PublicUrl, downloadFile, createDownloadUrl } from '@/lib/storage'

const videoUrlCache = new Map<string, { url: string; expiresAt: number }>()
const VIDEO_TTL_S   = 7 * 24 * 3600
const VIDEO_TTL_MS  = (VIDEO_TTL_S - 3600) * 1000

// Processed image cache — keyed by "filename:width:webp"
// On Vercel Fluid Compute, instances are reused across requests so this avoids
// re-downloading and re-processing the same image repeatedly.
const imageCache = new Map<string, { buffer: Buffer; contentType: string }>()
const IMAGE_CACHE_MAX = 150

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
      headers: { 'Cache-Control': 'private, max-age=31536000' },
    })
  }

  const isVideo = VIDEO_EXT.test(filename)

  // ── Videos ────────────────────────────────────────────────────────────
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

  // ── Images ────────────────────────────────────────────────────────────
  const { searchParams } = new URL(request.url)
  const reqWidth    = parseInt(searchParams.get('w') || '0') || undefined
  const acceptsWebP = (request.headers.get('accept') ?? '').includes('image/webp')
  const isHEIC      = /\.(heic|heif)$/i.test(filename)

  // Process when: explicit width requested, browser accepts WebP, or HEIC needs conversion
  const needsProcessing = reqWidth != null || acceptsWebP || isHEIC

  const cacheKey = `${filename}:${reqWidth ?? ''}:${acceptsWebP ? 'webp' : 'orig'}`
  const hit = getCached(cacheKey)
  if (hit) {
    return new Response(new Uint8Array(hit.buffer), {
      headers: {
        'Content-Type': hit.contentType,
        'Content-Length': String(hit.buffer.byteLength),
        'Cache-Control': 'private, max-age=86400',
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
      let pipeline = sharp(buffer).rotate() // auto-orient from EXIF
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
      'Cache-Control': 'private, max-age=86400',
      'Vary': 'Accept',
    },
  })
}
