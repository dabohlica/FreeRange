import { prisma } from '@/lib/prisma'
import MapView from './MapView'

export const revalidate = 30

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
        weather: e.weather as import('@/lib/weather').WeatherData | null,
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
