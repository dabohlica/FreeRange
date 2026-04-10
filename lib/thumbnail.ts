import sharp from 'sharp'
import { encode } from 'blurhash'
import { createClient } from '@supabase/supabase-js'
import exifr from 'exifr'

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
}

export async function generateThumbnailAndBlurhash(
  buffer: Buffer,
  originalFilename: string,
): Promise<ThumbnailResult> {
  // Read EXIF orientation once and pass it explicitly — more reliable than
  // sharp's no-arg .rotate() auto-detect which can silently no-op.
  const degrees = await getRotationDegrees(buffer)

  // 1. 400px JPEG thumbnail — rotate BEFORE resize so dimensions are correct
  const thumbBuffer = await sharp(buffer)
    .rotate(degrees)
    .resize(400, 400, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 75 })
    .toBuffer()

  // 2. blurhash from 32x32 raw RGBA — same rotation
  const { data, info } = await sharp(buffer)
    .rotate(degrees)
    .resize(32, 32, { fit: 'inside' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const hash = encode(new Uint8ClampedArray(data), info.width, info.height, 4, 4)

  // 3. Upload to Supabase flat bucket with `thumb_` prefix
  // (underscore — bucket is flat, slash would fail auth proxy validation)
  const thumbFilename = `thumb_${originalFilename.replace(/\.[^.]+$/, '.jpg')}`
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { error } = await supabase.storage
    .from('media')
    .upload(thumbFilename, thumbBuffer, { contentType: 'image/jpeg', upsert: true })
  if (error) throw new Error(`Thumb upload failed: ${error.message}`)

  return {
    thumbFilename,
    thumbUrl: `/api/media/url/${thumbFilename}`,
    blurhash: hash,
  }
}
