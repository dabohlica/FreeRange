import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const tripId = searchParams.get('tripId')
  const limit = parseInt(searchParams.get('limit') || '50')
  const offset = parseInt(searchParams.get('offset') || '0')

  const entries = await prisma.entry.findMany({
    where: tripId ? { tripId } : undefined,
    include: {
      media: { orderBy: { createdAt: 'asc' } },
      trip: { select: { id: true, name: true, color: true } },
    },
    orderBy: { date: 'desc' },
    take: limit,
    skip: offset,
  })

  return NextResponse.json(entries)
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (session?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { title, description, date, latitude, longitude, altitude, city, country, tripId } = body

  if (!title || !date) {
    return NextResponse.json({ error: 'Title and date are required' }, { status: 400 })
  }

  // Get the first admin user
  const author = await prisma.user.findFirst({ where: { role: 'ADMIN' } })
  if (!author) return NextResponse.json({ error: 'No admin user found. Please seed the database.' }, { status: 500 })

  const entry = await prisma.entry.create({
    data: {
      title,
      description,
      date: new Date(date),
      latitude: latitude ? parseFloat(latitude) : null,
      longitude: longitude ? parseFloat(longitude) : null,
      altitude: altitude ? parseFloat(altitude) : null,
      city,
      country,
      tripId: tripId || null,
      authorId: author.id,
    },
    include: {
      media: true,
      trip: { select: { id: true, name: true, color: true } },
    },
  })

  return NextResponse.json(entry, { status: 201 })
}
