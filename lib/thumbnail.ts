import sharp from 'sharp'
import { encode } from 'blurhash'
import { createClient } from '@supabase/supabase-js'

export interface ThumbnailResult {
  thumbFilename: string
  thumbUrl: string
  blurhash: string
}

export async function generateThumbnailAndBlurhash(
  buffer: Buffer,
  originalFilename: string,
): Promise<ThumbnailResult> {
  // 1. 400px JPEG thumbnail
  // .rotate() with no args applies EXIF orientation and strips the tag so the
  // pixels are already correctly oriented — without this portrait shots appear
  // rotated 90° because sharp ignores EXIF orientation by default.
  const thumbBuffer = await sharp(buffer)
    .rotate()
    .resize(400, 400, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 75 })
    .toBuffer()

  // 2. blurhash from 32x32 raw RGBA — same rotation fix applies
  const { data, info } = await sharp(buffer)
    .rotate()
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
