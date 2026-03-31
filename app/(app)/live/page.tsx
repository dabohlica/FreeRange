import { prisma } from '@/lib/prisma'
import LiveView from './LiveView'

export const dynamic = 'force-dynamic'

export default async function LivePage() {
  const location = await prisma.liveLocation.findUnique({ where: { id: 'singleton' } })
  const pajUrl = process.env.PAJ_GPS_SHARE_URL || null

  return (
    <LiveView
      pajUrl={pajUrl}
      liveLocation={location ? {
        latitude: location.latitude,
        longitude: location.longitude,
        altitude: location.altitude,
        updatedAt: location.updatedAt.toISOString(),
      } : null}
    />
  )
}
