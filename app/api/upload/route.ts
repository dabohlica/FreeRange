import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { extractExif } from '@/lib/exif'
import { saveUploadedFile, getMediaType, ALLOWED_MIME_TYPES, MAX_FILE_SIZE } from '@/lib/upload'
import { reverseGeocode } from '@/lib/gps'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (session?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const formData = await req.formData()
  const entryId = formData.get('entryId') as string
  const files = formData.getAll('files') as File[]

  if (!entryId) return NextResponse.json({ error: 'entryId required' }, { status: 400 })
  if (!files.length) return NextResponse.json({ error: 'No files provided' }, { status: 400 })

  const entry = await prisma.entry.findUnique({ where: { id: entryId } })
  if (!entry) return NextResponse.json({ error: 'Entry not found' }, { status: 404 })

  const results = []

  for (const file of files) {
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      results.push({ error: `Unsupported file type: ${file.type}`, filename: file.name })
      continue
    }

    if (file.size > MAX_FILE_SIZE) {
      results.push({ error: `File too large: ${file.name}`, filename: file.name })
      continue
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const { filename, url } = await saveUploadedFile(buffer, file.name)

    const exif = await extractExif(buffer)

    const mediaType = getMediaType(file.name)
    const media = await prisma.media.create({
      data: {
        filename,
        url,
        type: mediaType,
        size: file.size,
        width: exif.width,
        height: exif.height,
        latitude: exif.latitude,
        longitude: exif.longitude,
        altitude: exif.altitude,
        takenAt: exif.takenAt,
        entryId,
      },
    })

    // If the entry has no location yet but the photo has GPS, update the entry
    if (!entry.latitude && exif.latitude && exif.longitude) {
      const geo = await reverseGeocode(exif.latitude, exif.longitude)
      await prisma.entry.update({
        where: { id: entryId },
        data: {
          latitude: exif.latitude,
          longitude: exif.longitude,
          altitude: exif.altitude,
          ...(geo.city && { city: geo.city }),
          ...(geo.country && { country: geo.country }),
        },
      })
    }

    results.push({ success: true, media })
  }

  return NextResponse.json({ results })
}
