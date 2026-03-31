import { prisma } from '@/lib/prisma'
import MediaPageClient from './MediaPageClient'

export const dynamic = 'force-dynamic'

export default async function MediaPage() {
  const [allMedia, gpsMedia, entries] = await Promise.all([
    prisma.media.findMany({
      include: {
        entry: { select: { id: true, title: true, date: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
    prisma.media.findMany({
      where: { latitude: { not: null }, longitude: { not: null } },
      include: {
        entry: { select: { id: true, title: true, date: true, latitude: true, longitude: true } },
      },
      orderBy: { takenAt: 'desc' },
    }),
    prisma.entry.findMany({
      where: { latitude: { not: null }, longitude: { not: null } },
      include: { media: { orderBy: { createdAt: 'asc' }, take: 1 } },
      orderBy: { date: 'desc' },
    }),
  ])

  return (
    <MediaPageClient
      allMedia={allMedia.map((m) => ({
        ...m,
        takenAt: m.takenAt?.toISOString() ?? null,
        createdAt: m.createdAt.toISOString(),
        entry: m.entry
          ? { ...m.entry, date: m.entry.date.toISOString() }
          : null,
      }))}
      gpsMedia={gpsMedia.map((m) => ({
        ...m,
        takenAt: m.takenAt?.toISOString() ?? null,
        createdAt: m.createdAt.toISOString(),
        entry: m.entry
          ? { ...m.entry, date: m.entry.date.toISOString() }
          : null,
      }))}
      entriesWithLocation={entries.map((e) => ({
        id: e.id,
        title: e.title,
        date: e.date.toISOString(),
        latitude: e.latitude!,
        longitude: e.longitude!,
        media: e.media.map((m) => ({
          id: m.id,
          url: m.url,
          type: m.type,
          filename: m.filename,
          takenAt: m.takenAt?.toISOString() ?? null,
        })),
      }))}
    />
  )
}
