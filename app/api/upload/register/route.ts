import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { extractExif } from '@/lib/exif'
import { getMediaType } from '@/lib/upload'
import { reverseGeocode } from '@/lib/gps'

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

  // Download the file from Supabase to extract EXIF and compute hash
  const { createClient } = await import('@supabase/supabase-js')
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: fileData, error: downloadError } = await supabase.storage
    .from('media')
    .download(storedFilename)

  if (downloadError || !fileData) {
    return NextResponse.json({ error: `Failed to read uploaded file: ${downloadError?.message}` }, { status: 500 })
  }

  const buffer = Buffer.from(await fileData.arrayBuffer())
  const hash = createHash('sha256').update(buffer).digest('hex')

  // Check for duplicate
  const existing = await prisma.media.findUnique({ where: { hash } })
  if (existing) {
    // Remove the just-uploaded duplicate from storage
    await supabase.storage.from('media').remove([storedFilename])
    return NextResponse.json({ skipped: true, media: existing })
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

  return NextResponse.json({ success: true, media })
}
