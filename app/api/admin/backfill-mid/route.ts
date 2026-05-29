import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { downloadFile } from '@/lib/storage'
import { generateThumbnailAndBlurhash } from '@/lib/thumbnail'

export const maxDuration = 60
export const runtime = 'nodejs'

const BATCH_SIZE = 5

export async function POST() {
  const session = await getSession()
  if (session?.role !== 'admin') {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const remaining = await prisma.media.count({
    where: { midUrl: null, type: 'IMAGE' },
  })

  const batch = await prisma.media.findMany({
    where: { midUrl: null, type: 'IMAGE' },
    take: BATCH_SIZE,
    orderBy: { createdAt: 'asc' },
  })

  let processed = 0
  let failed = 0
  const errors: string[] = []

  for (const media of batch) {
    try {
      const { buffer } = await downloadFile(media.filename)
      const { midUrl, webUrl, thumbUrl, blurhash } = await generateThumbnailAndBlurhash(buffer, media.filename)
      await prisma.media.update({
        where: { id: media.id },
        data: {
          midUrl,
          ...(media.webUrl       ? {} : { webUrl }),
          ...(media.thumbnailUrl ? {} : { thumbnailUrl: thumbUrl, blurhash }),
        },
      })
      processed++
    } catch (err) {
      failed++
      errors.push(`${media.filename}: ${(err as Error).message}`)
      console.error('[backfill-mid] failed', media.filename, err)
    }
  }

  return NextResponse.json({ processed, failed, remaining: Math.max(0, remaining - processed), errors })
}
