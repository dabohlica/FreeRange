import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { extractExif } from '@/lib/exif'
import { getMediaType } from '@/lib/upload'
import { generateThumbnailAndBlurhash } from '@/lib/thumbnail'
import { reverseGeocode } from '@/lib/gps'
import { downloadFile, deleteFile } from '@/lib/storage'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (session?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { entryId, storedFilename, originalName, size } = await req.json()
  if (!entryId || !storedFilename || !originalName) {
    return NextResponse.json({ error: 'entryId, storedFilename, originalName required' }, { status: 400 })
  }

  const entry = await prisma.entry.findUnique({ where: { id: entryId } })
  if (!entry) return NextResponse.json({ error: 'Entry not found' }, { status: 404 })

  let buffer: Buffer
  try {
    const result = await downloadFile(storedFilename)
    buffer = result.buffer
  } catch (err) {
    return NextResponse.json({ error: `Failed to read uploaded file: ${String(err)}` }, { status: 500 })
  }

  const hash = createHash('sha256').update(buffer).digest('hex')

  const existing = await prisma.media.findUnique({ where: { hash } })
  if (existing) {
    await deleteFile(storedFilename).catch(() => {})
    return NextResponse.json({ skipped: true, media: existing })
  }

  let thumbnailUrl: string | null = null
  let blurhash: string | null = null
  try {
    const result = await generateThumbnailAndBlurhash(buffer, storedFilename)
    thumbnailUrl = result.thumbUrl
    blurhash = result.blurhash
  } catch (err) {
    console.error('[upload/register] thumbnail gen failed', err)
  }

  const exif = await extractExif(buffer)
  const url = `/api/media/url/${storedFilename}`

  const media = await prisma.media.create({
    data: {
      filename: storedFilename,
      url,
      type:    getMediaType(originalName),
      size:    size ?? buffer.length,
      width:   exif.width,
      height:  exif.height,
      latitude:  exif.latitude,
      longitude: exif.longitude,
      altitude:  exif.altitude,
      takenAt:   exif.takenAt,
      hash,
      entryId,
      thumbnailUrl,
      blurhash,
    },
  })

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

  return NextResponse.json({ success: true, media })
}
