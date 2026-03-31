import { prisma } from '@/lib/prisma'
import MapView from './MapView'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const entries = await prisma.entry.findMany({
    include: { media: { orderBy: { createdAt: 'asc' } } },
    orderBy: { date: 'desc' },
  })

  const liveLocation = await prisma.liveLocation.findUnique({
    where: { id: 'singleton' },
  })

  return (
    <MapView
      entries={entries.map((e) => ({
        ...e,
        date: e.date.toISOString(),
        media: e.media.map((m) => ({
          ...m,
          takenAt: m.takenAt?.toISOString() ?? null,
        })),
      }))}
      liveLocation={liveLocation ? {
        latitude: liveLocation.latitude,
        longitude: liveLocation.longitude,
        updatedAt: liveLocation.updatedAt.toISOString(),
      } : null}
    />
  )
}
