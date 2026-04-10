import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import path from 'path'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { extractExif } from '@/lib/exif'
import { saveUploadedFile, getMediaType, MAX_FILE_SIZE } from '@/lib/upload'
import { generateThumbnailAndBlurhash } from '@/lib/thumbnail'
import { reverseGeocode } from '@/lib/gps'
import { fetchWeather } from '@/lib/weather'

export const maxDuration = 60

// Accept by MIME type OR by extension (browsers often omit MIME type for HEIC)
const ALLOWED_MIME = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif',
  'video/mp4', 'video/quicktime', 'video/webm',
])
const ALLOWED_EXT = new Set([
  '.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.gif',
  '.mp4', '.mov', '.avi', '.webm', '.m4v',
])

function isAllowed(file: File): boolean {
  if (file.type && ALLOWED_MIME.has(file.type)) return true
  return ALLOWED_EXT.has(path.extname(file.name).toLowerCase())
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (session?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch (err) {
    return NextResponse.json({ error: `Failed to parse upload: ${String(err)}` }, { status: 400 })
  }

  const entryId = formData.get('entryId') as string | null
  const file    = formData.get('file') as File | null

  if (!entryId) return NextResponse.json({ error: 'entryId required' }, { status: 400 })
  if (!file)    return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  if (!isAllowed(file)) {
    return NextResponse.json(
      { error: `File type not allowed: "${file.type || path.extname(file.name) || 'unknown'}" (${file.name})` },
      { status: 400 }
    )
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: `File too large: ${(file.size / 1024 / 1024).toFixed(1)} MB — max 100 MB (${file.name})` },
      { status: 400 }
    )
  }

  const entry = await prisma.entry.findUnique({ where: { id: entryId } })
  if (!entry) return NextResponse.json({ error: 'Entry not found' }, { status: 404 })

  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    const hash   = createHash('sha256').update(buffer).digest('hex')

    const existing = await prisma.media.findUnique({ where: { hash } })
    if (existing) return NextResponse.json({ skipped: true, media: existing })

    const { filename, url } = await saveUploadedFile(buffer, file.name)
    const exif = await extractExif(buffer)

    let thumbUrl: string | null = null
    let blurhash: string | null = null
    try {
      const result = await generateThumbnailAndBlurhash(buffer, filename)
      thumbUrl = result.thumbUrl
      blurhash = result.blurhash
    } catch (err) {
      console.error('[upload] thumbnail gen failed', err)
    }

    const media = await prisma.media.create({
      data: {
        filename, url,
        type:    getMediaType(file.name),
        size:    file.size,
        width:   exif.width,
        height:  exif.height,
        latitude:  exif.latitude,
        longitude: exif.longitude,
        altitude:  exif.altitude,
        takenAt:   exif.takenAt,
        hash,
        entryId,
        thumbnailUrl: thumbUrl,
        blurhash,
      },
    })

    // Reverse-geocode in background if entry has no location yet
    if (!entry.latitude && exif.latitude && exif.longitude) {
      reverseGeocode(exif.latitude, exif.longitude).then(geo => {
        prisma.entry.update({
          where: { id: entryId },
          data: {
            latitude:  exif.latitude!,
            longitude: exif.longitude!,
            altitude:  exif.altitude,
            ...(geo.city    && { city:    geo.city }),
            ...(geo.country && { country: geo.country }),
          },
        }).catch(() => {})
      }).catch(() => {})
    }

    // Fetch weather in background if entry has GPS + date and no weather yet
    const wLat = entry.latitude ?? exif.latitude
    const wLng = entry.longitude ?? exif.longitude
    if (!entry.weather && wLat != null && wLng != null && entry.date) {
      const dateStr = new Date(entry.date).toISOString().slice(0, 10)
      fetchWeather(wLat, wLng, dateStr).then(weather => {
        if (!weather) return
        prisma.entry.update({
          where: { id: entryId },
          data: { weather },
        }).catch(() => {})
      }).catch(() => {})
    }

    return NextResponse.json({ success: true, media })
  } catch (err) {
    console.error(`Upload failed for ${file.name}:`, err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
