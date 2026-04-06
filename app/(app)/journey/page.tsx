import { prisma } from '@/lib/prisma'
import JourneyClient from './JourneyClient'

export const dynamic = 'force-dynamic'

export default async function JourneyPage() {
  const entries = await prisma.entry.findMany({
    include: {
      media: { orderBy: { createdAt: 'asc' } },
      trip: { select: { id: true, name: true, color: true } },
    },
    orderBy: { date: 'desc' },
  })

  const liveLocation = await prisma.liveLocation.findUnique({
    where: { id: 'singleton' },
  })

  const serialized = entries.map((e) => ({
    id: e.id,
    title: e.title,
    description: e.description,
    date: e.date.toISOString(),
    latitude: e.latitude,
    longitude: e.longitude,
    city: e.city,
    country: e.country,
    trip: e.trip,
    media: e.media.map((m) => ({
      id: m.id,
      url: m.url,
      type: m.type as string,
      filename: m.filename,
      width: m.width,
      height: m.height,
      takenAt: m.takenAt?.toISOString() ?? null,
    })),
  }))

  return (
    <JourneyClient
      entries={serialized}
      liveLocation={liveLocation ? {
        latitude: liveLocation.latitude,
        longitude: liveLocation.longitude,
        updatedAt: liveLocation.updatedAt.toISOString(),
      } : null}
    />
  )
}
