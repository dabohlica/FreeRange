import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateThumbnailAndBlurhash } from '@/lib/thumbnail'
import { downloadFile } from '@/lib/storage'

export const maxDuration = 60
export const runtime = 'nodejs'

const BATCH_SIZE = 10

export async function POST(req: Request) {
  const session = await getSession()
  if (session?.role !== 'admin') {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const reset = searchParams.get('reset') === 'true'

  // ?reset=true clears all existing thumbnails so they get re-generated on the
  // next backfill passes — use this after fixing thumbnail generation bugs.
  if (reset) {
    await prisma.media.updateMany({
      where: { type: 'IMAGE' },
      data: { thumbnailUrl: null, blurhash: null },
    })
    const total = await prisma.media.count({ where: { type: 'IMAGE' } })
    return NextResponse.json({ reset: true, queued: total })
  }

  const remainingBefore = await prisma.media.count({
    where: { thumbnailUrl: null, type: 'IMAGE' },
  })

  const batch = await prisma.media.findMany({
    where: { thumbnailUrl: null, type: 'IMAGE' },
    take: BATCH_SIZE,
    orderBy: { createdAt: 'asc' },
  })

  let processed = 0
  let failed = 0
  const errors: string[] = []

  for (const media of batch) {
    try {
      const { buffer } = await downloadFile(media.filename)
      const { thumbUrl, blurhash } = await generateThumbnailAndBlurhash(buffer, media.filename)
      await prisma.media.update({
        where: { id: media.id },
        data: { thumbnailUrl: thumbUrl, blurhash },
      })
      processed++
    } catch (err) {
      failed++
      errors.push(`${media.filename}: ${(err as Error).message}`)
      console.error('[backfill-thumbnails] failed', media.filename, err)
    }
  }

  const remaining = Math.max(0, remainingBefore - processed)
  return NextResponse.json({ processed, failed, remaining, errors })
}
