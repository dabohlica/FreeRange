import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'

function autoTitle(date: string, city?: string, country?: string): string {
  const d = new Date(date)
  const dateStr = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  if (city && country) return `${city}, ${country}`
  if (city) return city
  return dateStr
}

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const tripId = searchParams.get('tripId')
  const limit  = parseInt(searchParams.get('limit') || '50')
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

  if (!date) return NextResponse.json({ error: 'Date is required' }, { status: 400 })

  const author = await prisma.user.findFirst({ where: { role: 'ADMIN' } })
  if (!author) return NextResponse.json({ error: 'No admin user found' }, { status: 500 })

  const resolvedTitle = (title as string | undefined)?.trim() || autoTitle(date, city, country)

  const entry = await prisma.entry.create({
    data: {
      title: resolvedTitle,
      description: description || null,
      date: new Date(date),
      latitude:  latitude  != null ? parseFloat(latitude)  : null,
      longitude: longitude != null ? parseFloat(longitude) : null,
      altitude:  altitude  != null ? parseFloat(altitude)  : null,
      city:    city    || null,
      country: country || null,
      tripId:  tripId  || null,
      authorId: author.id,
    },
    include: {
      media: true,
      trip: { select: { id: true, name: true, color: true } },
    },
  })

  return NextResponse.json(entry, { status: 201 })
}
