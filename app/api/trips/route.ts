import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const trips = await prisma.trip.findMany({
    include: {
      _count: { select: { entries: true } },
    },
    orderBy: { startDate: 'desc' },
  })

  return NextResponse.json(trips)
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (session?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { name, description, startDate, endDate, color } = body

  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

  const trip = await prisma.trip.create({
    data: {
      name,
      description,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      color: color || '#3B82F6',
    },
  })

  return NextResponse.json(trip, { status: 201 })
}
