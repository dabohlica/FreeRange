import sharp from 'sharp'
import { encode } from 'blurhash'
import exifr from 'exifr'
import { uploadFile } from '@/lib/storage'

// EXIF orientation → clockwise degrees sharp should rotate.
// Values not in this map (2,4,5,7 — mirrored) are rare for phone photos; treat as 0.
const EXIF_TO_DEGREES: Record<number, number> = { 1: 0, 3: 180, 6: 90, 8: 270 }

async function getRotationDegrees(buffer: Buffer): Promise<number> {
  try {
    // translateValues: false keeps Orientation as a raw integer (e.g. 6), not a string ("Rotate 90 CW")
    const meta = await exifr.parse(buffer, { pick: ['Orientation'], translateValues: false })
    return EXIF_TO_DEGREES[meta?.Orientation ?? 1] ?? 0
  } catch {
    return 0
  }
}

export interface ThumbnailResult {
  thumbFilename: string
  thumbUrl: string
  blurhash: string
  webFilename: string
  webUrl: string
}

export async function generateThumbnailAndBlurhash(
  buffer: Buffer,
  originalFilename: string,
): Promise<ThumbnailResult> {
  const degrees = await getRotationDegrees(buffer)

  // 1. 400px JPEG thumbnail
  const thumbBuffer = await sharp(buffer)
    .rotate(degrees)
    .resize(400, 400, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 75 })
    .toBuffer()

  // 2. 2400px WebP web version — served via signed-URL redirect, bypasses Vercel bandwidth
  const webBuffer = await sharp(buffer)
    .rotate(degrees)
    .resize(2400, undefined, { withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer()

  // 3. blurhash from 32x32 raw RGBA
  const { data, info } = await sharp(buffer)
    .rotate(degrees)
    .resize(32, 32, { fit: 'inside' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const hash = encode(new Uint8ClampedArray(data), info.width, info.height, 4, 4)

  const base = originalFilename.replace(/\.[^.]+$/, '')
  const thumbFilename = `thumb_${base}.jpg`
  const webFilename   = `web_${base}.webp`

  await Promise.all([
    uploadFile(thumbBuffer, thumbFilename, 'image/jpeg'),
    uploadFile(webBuffer,   webFilename,   'image/webp'),
  ])

  return {
    thumbFilename,
    thumbUrl: `/api/media/url/${thumbFilename}`,
    blurhash: hash,
    webFilename,
    webUrl: `/api/media/url/${webFilename}`,
  }
}
