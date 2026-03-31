import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { fetchPAJLocation } from '@/lib/gps'

export async function GET() {
  // Live location is public-ish (auth required but no role check)
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // First try PAJ GPS if configured
  const pajUrl = process.env.PAJ_GPS_SHARE_URL
  if (pajUrl) {
    const pajLocation = await fetchPAJLocation(pajUrl)
    if (pajLocation) {
      // Update the DB with the latest
      await prisma.liveLocation.upsert({
        where: { id: 'singleton' },
        update: {
          latitude: pajLocation.latitude,
          longitude: pajLocation.longitude,
          altitude: pajLocation.altitude,
          source: 'paj',
        },
        create: {
          id: 'singleton',
          latitude: pajLocation.latitude,
          longitude: pajLocation.longitude,
          altitude: pajLocation.altitude,
          source: 'paj',
        },
      })
      return NextResponse.json(pajLocation)
    }
  }

  // Fall back to stored live location
  const location = await prisma.liveLocation.findUnique({ where: { id: 'singleton' } })
  if (!location) return NextResponse.json(null)

  return NextResponse.json({
    latitude: location.latitude,
    longitude: location.longitude,
    altitude: location.altitude,
    speed: location.speed,
    accuracy: location.accuracy,
    updatedAt: location.updatedAt,
  })
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (session?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { latitude, longitude, altitude, speed, accuracy } = body

  if (latitude === undefined || longitude === undefined) {
    return NextResponse.json({ error: 'latitude and longitude required' }, { status: 400 })
  }

  const location = await prisma.liveLocation.upsert({
    where: { id: 'singleton' },
    update: {
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
      altitude: altitude ? parseFloat(altitude) : null,
      speed: speed ? parseFloat(speed) : null,
      accuracy: accuracy ? parseFloat(accuracy) : null,
      source: 'manual',
    },
    create: {
      id: 'singleton',
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
      altitude: altitude ? parseFloat(altitude) : null,
      speed: speed ? parseFloat(speed) : null,
      accuracy: accuracy ? parseFloat(accuracy) : null,
      source: 'manual',
    },
  })

  // Also save to history
  await prisma.location.create({
    data: {
      latitude: location.latitude,
      longitude: location.longitude,
      altitude: location.altitude,
      speed: location.speed,
      accuracy: location.accuracy,
      source: location.source,
      recordedAt: new Date(),
    },
  })

  return NextResponse.json(location)
}
