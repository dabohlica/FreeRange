import path from 'path'
import { NextRequest, NextResponse } from 'next/server'
import { makeZip } from 'client-zip'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { downloadFileStream } from '@/lib/storage'

// Each part streams through one function invocation, so keep parts small enough
// to finish within the duration limit even on a modest connection.
export const maxDuration = 300
export const runtime = 'nodejs'

const PART_BYTES = 1024 * 1024 * 1024 // 1 GB per ZIP

interface ExportFile {
  filename: string
  name: string
  size: number
  lastModified: Date
}

function slugify(s: string) {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'entry'
}

/** Groups every original image into ZIP parts of at most PART_BYTES each. */
async function planParts(): Promise<ExportFile[][]> {
  const entries = await prisma.entry.findMany({
    select: {
      date: true,
      title: true,
      media: {
        where: { type: 'IMAGE' },
        select: { filename: true, size: true, takenAt: true, createdAt: true },
        orderBy: [{ takenAt: 'asc' }, { createdAt: 'asc' }],
      },
    },
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
  })

  const parts: ExportFile[][] = []
  let current: ExportFile[] = []
  let currentBytes = 0

  for (const entry of entries) {
    const folder = `${entry.date.toISOString().slice(0, 10)}_${slugify(entry.title)}`
    entry.media.forEach((m, i) => {
      const ext = path.extname(m.filename).toLowerCase()
      const file: ExportFile = {
        filename: m.filename,
        name: `${folder}/${String(i + 1).padStart(3, '0')}${ext}`,
        size: m.size,
        lastModified: m.takenAt ?? m.createdAt,
      }
      if (current.length > 0 && currentBytes + file.size > PART_BYTES) {
        parts.push(current)
        current = []
        currentBytes = 0
      }
      current.push(file)
      currentBytes += file.size
    })
  }
  if (current.length > 0) parts.push(current)
  return parts
}

/**
 * GET /api/admin/export           → JSON summary of the available ZIP parts
 * GET /api/admin/export?part=N    → streams part N (1-based) as a ZIP of original files
 */
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (session?.role !== 'admin') {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const parts = await planParts()
  const partParam = request.nextUrl.searchParams.get('part')

  if (partParam === null) {
    return NextResponse.json({
      totalFiles: parts.reduce((n, p) => n + p.length, 0),
      totalBytes: parts.flat().reduce((n, f) => n + f.size, 0),
      parts: parts.map((p, i) => ({
        part: i + 1,
        files: p.length,
        bytes: p.reduce((n, f) => n + f.size, 0),
      })),
    })
  }

  const partNum = parseInt(partParam, 10)
  const files = parts[partNum - 1]
  if (!files) {
    return NextResponse.json({ error: 'part not found' }, { status: 404 })
  }

  // Files are fetched lazily as the ZIP is consumed, so only one original is
  // in flight at a time. Failures are listed in a text file instead of aborting.
  async function* entriesForZip() {
    const failed: string[] = []
    for (const f of files) {
      try {
        const input = await downloadFileStream(f.filename)
        yield { name: f.name, input, lastModified: f.lastModified }
      } catch (err) {
        console.error('[admin/export] failed to fetch', f.filename, err)
        failed.push(`${f.name} (${f.filename}): ${(err as Error).message}`)
      }
    }
    if (failed.length > 0) {
      yield { name: 'MISSING_FILES.txt', input: failed.join('\n') + '\n' }
    }
  }

  const zipName = parts.length === 1
    ? 'freerange-originals.zip'
    : `freerange-originals-part-${partNum}-of-${parts.length}.zip`

  return new Response(makeZip(entriesForZip()), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${zipName}"`,
      'Cache-Control': 'no-store',
    },
  })
}
