/**
 * Standalone backfill script — generates web_*.webp files for all IMAGE media
 * records that are missing a webUrl. Runs locally against the same DB + R2.
 *
 * Usage:
 *   npx tsx scripts/backfill-web.ts
 *   npx tsx scripts/backfill-web.ts --batch 10   # custom batch size (default 5)
 */

import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { downloadFile } from '../lib/storage'
import { generateThumbnailAndBlurhash } from '../lib/thumbnail'

const BATCH_SIZE = (() => {
  const idx = process.argv.indexOf('--batch')
  return idx !== -1 ? parseInt(process.argv[idx + 1], 10) : 5
})()

const prisma = new PrismaClient()

async function main() {
  const total = await prisma.media.count({ where: { webUrl: null, type: 'IMAGE' } })
  console.log(`Images missing webUrl: ${total}`)
  if (total === 0) { console.log('Nothing to do.'); return }

  let pass = 0
  let remaining = total

  while (remaining > 0) {
    const batch = await prisma.media.findMany({
      where: { webUrl: null, type: 'IMAGE' },
      take: BATCH_SIZE,
      orderBy: { createdAt: 'asc' },
    })
    if (batch.length === 0) break

    let batchOk = 0
    for (const media of batch) {
      try {
        const { buffer } = await downloadFile(media.filename)
        const { webUrl, thumbUrl, blurhash } = await generateThumbnailAndBlurhash(buffer, media.filename)
        await prisma.media.update({
          where: { id: media.id },
          data: {
            webUrl,
            ...(media.thumbnailUrl ? {} : { thumbnailUrl: thumbUrl, blurhash }),
          },
        })
        batchOk++
        process.stdout.write(`  ✓ ${media.filename}\n`)
      } catch (err) {
        process.stderr.write(`  ✗ ${media.filename}: ${(err as Error).message}\n`)
      }
    }

    pass++
    remaining = await prisma.media.count({ where: { webUrl: null, type: 'IMAGE' } })
    console.log(`Pass ${pass} done — ${batchOk}/${batch.length} ok, ${remaining} remaining`)
  }

  console.log('\nBackfill complete.')
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
